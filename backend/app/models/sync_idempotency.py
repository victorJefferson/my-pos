import uuid
from datetime import datetime
from typing import Optional, Any
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, UniqueConstraint


class SyncIdempotency(SQLModel, table=True):
    """Stores responses for client_op_id so mutation retries are safe."""

    __tablename__ = "sync_idempotency"
    __table_args__ = (
        UniqueConstraint("tenant_id", "client_op_id", name="uq_sync_idempotency_tenant_op"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    client_op_id: str = Field(max_length=64, index=True)
    route: str = Field(max_length=128)
    status_code: int = Field(default=200)
    response_json: Optional[Any] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
