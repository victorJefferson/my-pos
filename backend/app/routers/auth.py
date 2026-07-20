import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlmodel import select

from app.database import get_session
from app.auth import get_current_user
from app.models.tenant import Tenant
from app.models.user import User, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])


class UpdateStorePayload(BaseModel):
    store_name: str


@router.get("/me")
def get_or_create_me(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """
    Called by the frontend on every app load.
    - If this Clerk user has never logged in before → auto-creates a BRAND NEW dedicated
      tenant for them so every store owner gets an isolated store database.
    - Returns the user's DB record + tenant info + needs_setup flag if store is not configured.
    """
    clerk_user_id: str = current_user["sub"]
    clerk_email: str = current_user.get("email", "")
    clerk_name: str = (
        current_user.get("name")
        or current_user.get("username")
        or clerk_email.split("@")[0]
        or "User"
    )

    # Try to find existing user by clerk_user_id
    users = db.exec(
        select(User).where(User.clerk_user_id == clerk_user_id)
    ).all()

    if users:
        user = users[0]
        tenant = db.get(Tenant, user.tenant_id)
        store_name = tenant.store_name if tenant else "New Store"
        needs_setup = not store_name or store_name in ("New Store", "My Store")
        return {
            "user_id": str(user.id),
            "clerk_user_id": user.clerk_user_id,
            "name": user.name,
            "role": user.role,
            "tenant_id": str(user.tenant_id),
            "store_name": store_name,
            "is_new": False,
            "needs_setup": needs_setup,
        }

    # Brand new Clerk user! Create a dedicated new Tenant for this store owner!
    tenant = Tenant(store_name="New Store")
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    user = User(
        tenant_id=tenant.id,
        name=clerk_name,
        role=UserRole.ADMIN,
        clerk_user_id=clerk_user_id,
        pin_code="",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "user_id": str(user.id),
        "clerk_user_id": user.clerk_user_id,
        "name": user.name,
        "role": user.role,
        "tenant_id": str(user.tenant_id),
        "store_name": tenant.store_name,
        "is_new": True,
        "needs_setup": True,
    }


@router.get("/stores")
def list_user_stores(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """List all stores/tenants associated with the logged in Clerk user."""
    clerk_user_id: str = current_user["sub"]
    users = db.exec(select(User).where(User.clerk_user_id == clerk_user_id)).all()

    stores = []
    for u in users:
        tenant = db.get(Tenant, u.tenant_id)
        if tenant:
            stores.append({
                "tenant_id": str(tenant.id),
                "store_name": tenant.store_name,
                "role": u.role,
            })
    return stores


@router.post("/create-store")
def create_new_store(
    payload: UpdateStorePayload,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Create a new store/tenant for the logged in user."""
    clerk_user_id: str = current_user["sub"]
    clerk_email: str = current_user.get("email", "")
    clerk_name: str = (
        current_user.get("name")
        or current_user.get("username")
        or clerk_email.split("@")[0]
        or "User"
    )

    name = payload.store_name.strip() if payload.store_name else "New Store"
    tenant = Tenant(store_name=name)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    user = User(
        tenant_id=tenant.id,
        name=clerk_name,
        role=UserRole.ADMIN,
        clerk_user_id=clerk_user_id,
        pin_code="",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "tenant_id": str(tenant.id),
        "store_name": tenant.store_name,
        "role": user.role,
    }


@router.post("/update-store")
def update_store_info(
    payload: UpdateStorePayload,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    clerk_user_id: str = current_user["sub"]
    user = db.exec(select(User).where(User.clerk_user_id == clerk_user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    tenant = db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    name = payload.store_name.strip() if payload.store_name else ""
    if name:
        tenant.store_name = name
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

    return {"detail": "Store name updated successfully", "tenant_id": str(tenant.id), "store_name": tenant.store_name}
