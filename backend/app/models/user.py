import uuid
from datetime import datetime
from typing import Optional
from enum import Enum
from sqlmodel import SQLModel, Field


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    CASHIER = "CASHIER"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    name: str
    role: UserRole = Field(default=UserRole.CASHIER)
    pin_code: str = Field(default="")       # kept for seed.py compatibility; auth now via Clerk
    clerk_user_id: Optional[str] = Field(default=None, index=True)  # Clerk sub claim
    created_at: datetime = Field(default_factory=datetime.utcnow)
