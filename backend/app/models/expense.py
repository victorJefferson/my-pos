import uuid
from datetime import datetime
from typing import Optional
from decimal import Decimal
from sqlmodel import SQLModel, Field
from app.models.sale import PaymentMode


class Expense(SQLModel, table=True):
    __tablename__ = "expenses"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    category: str = Field(default="Misc", index=True)
    amount: Decimal = Field(decimal_places=2, max_digits=12)
    payment_mode: PaymentMode = Field(default=PaymentMode.CASH)
    description: Optional[str] = Field(default=None)
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
