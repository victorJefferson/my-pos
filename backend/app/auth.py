"""
app/auth.py — Clerk JWT verification for FastAPI.

How it works:
1. Frontend sends `Authorization: Bearer <clerk_session_token>` on every request.
2. We fetch Clerk's public JWKS once (cached in memory) and verify the token locally
   using python-jose — zero network round-trips per request after the first load.
3. The Clerk user's `sub` (user_id) is returned for tenant linking.

Env vars needed:
  CLERK_PUBLISHABLE_KEY  — e.g. pk_test_abc123...
  (JWKS URL is auto-derived from the publishable key)
"""

import os
import base64
import httpx
from typing import Optional
from fastapi import Depends, HTTPException, Header
from jose import jwt, jwk, JWTError
from dotenv import load_dotenv

load_dotenv()

CLERK_PUBLISHABLE_KEY = os.getenv("CLERK_PUBLISHABLE_KEY", "")
# Allow overriding the JWKS URL directly (useful for testing)
_EXPLICIT_JWKS_URL = os.getenv("CLERK_JWKS_URL", "")

_jwks_cache: Optional[dict] = None


DEFAULT_CLERK_JWKS_URL = "https://set-bluegill-21.clerk.accounts.dev/.well-known/jwks.json"


def _derive_jwks_url() -> str:
    """Derive the Clerk JWKS URL from the publishable key or fallback to default."""
    if _EXPLICIT_JWKS_URL:
        return _EXPLICIT_JWKS_URL

    if CLERK_PUBLISHABLE_KEY:
        try:
            parts = CLERK_PUBLISHABLE_KEY.split("_", 2)
            if len(parts) == 3:
                b64_payload = parts[2]
                b64_payload += "=" * (4 - len(b64_payload) % 4)
                decoded = base64.b64decode(b64_payload).decode("utf-8").rstrip("$")
                return f"https://{decoded}/.well-known/jwks.json"
        except Exception as e:
            print(f"[Auth] Could not decode CLERK_PUBLISHABLE_KEY: {e}")

    return DEFAULT_CLERK_JWKS_URL


def _fetch_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache

    url = _derive_jwks_url()
    if not url:
        raise HTTPException(
            status_code=500,
            detail="Clerk not configured. Set CLERK_PUBLISHABLE_KEY in backend .env",
        )

    try:
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        return _jwks_cache
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Clerk JWKS: {e}")


def verify_clerk_token(token: str) -> dict:
    """Verify a Clerk session JWT and return the decoded payload."""
    try:
        jwks = _fetch_jwks()

        # Get the key id from the token header
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        # Find the matching public key in JWKS
        key_data = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not key_data:
            # Refresh JWKS cache once and retry (key rotation)
            global _jwks_cache
            _jwks_cache = None
            jwks = _fetch_jwks()
            key_data = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)

        if not key_data:
            raise HTTPException(status_code=401, detail="JWT key not found in Clerk JWKS")

        # Construct the RSA public key and verify
        public_key = jwk.construct(key_data)
        payload = jwt.decode(
            token,
            public_key.to_pem().decode("utf-8"),
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk tokens may not have aud
            leeway=60,  # 60-second leeway for clock skew tolerance
        )
        return payload

    except JWTError as e:
        print(f"[Auth Error] JWTError: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid session token: {e}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Auth Error] Unexpected Exception: {e}")
        raise HTTPException(status_code=401, detail=f"Auth error: {e}")


# ── FastAPI dependency ─────────────────────────────────────────────────────────

def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    FastAPI dependency — extracts and verifies the Clerk JWT from the Authorization header.
    Returns the decoded JWT payload (contains `sub` = Clerk user ID).

    Usage:
        @router.get("/protected")
        def my_route(user: dict = Depends(get_current_user)):
            clerk_user_id = user["sub"]
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Expected 'Bearer <token>'")

    return verify_clerk_token(token)


def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Same as get_current_user but returns None instead of raising if no token.
    Useful for endpoints that work both authenticated and unauthenticated."""
    if not authorization:
        return None
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None
