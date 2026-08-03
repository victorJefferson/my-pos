"""Helpers for mutation idempotency via sync_idempotency table."""
from __future__ import annotations

import json
import uuid
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from sqlmodel import select

from app.models.sync_idempotency import SyncIdempotency


def _serialize(payload: Any) -> Any:
    """JSON-safe encode (UUIDs, Decimals, pydantic models)."""
    return jsonable_encoder(payload, custom_encoder={Decimal: lambda d: float(d)})


def get_cached_response(
    db: Session,
    tenant_id: uuid.UUID,
    client_op_id: Optional[str],
) -> Optional[SyncIdempotency]:
    if not client_op_id:
        return None
    return db.exec(
        select(SyncIdempotency).where(
            SyncIdempotency.tenant_id == tenant_id,
            SyncIdempotency.client_op_id == client_op_id,
        )
    ).first()


def store_response(
    db: Session,
    tenant_id: uuid.UUID,
    client_op_id: Optional[str],
    route: str,
    status_code: int,
    body: Any,
) -> None:
    if not client_op_id:
        return
    existing = get_cached_response(db, tenant_id, client_op_id)
    if existing:
        return
    row = SyncIdempotency(
        tenant_id=tenant_id,
        client_op_id=client_op_id,
        route=route,
        status_code=status_code,
        response_json=_serialize(body) if body is not None else None,
    )
    db.add(row)


def replay_or_none(
    db: Session,
    tenant_id: uuid.UUID,
    client_op_id: Optional[str],
) -> Optional[Any]:
    """
    If this client_op_id was already processed, return a FastAPI Response / body
    suitable for early return. Returns None if this is a fresh op.
    """
    cached = get_cached_response(db, tenant_id, client_op_id)
    if not cached:
        return None
    if cached.status_code == 204 or cached.response_json is None:
        return Response(status_code=cached.status_code or 204)
    # Caller should return the dict/list with appropriate status; we raise with
    # a sentinel pattern via HTTPException only for errors. For success, return body.
    return {"__idempotent__": True, "status_code": cached.status_code, "body": cached.response_json}


def raise_sync_error(code: str, message: str, status_code: int = 400, **details):
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message, **details},
    )
