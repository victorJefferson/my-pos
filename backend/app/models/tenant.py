import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Tenant(SQLModel, table=True):
    __tablename__ = "tenants"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    store_name: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
