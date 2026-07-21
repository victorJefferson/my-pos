import uuid
from datetime import datetime
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, Field
from app.models.sale import PaymentMode


class ExpenseCreate(BaseModel):
    category: str = Field(default="Misc", description="e.g. Transportation, Procurement, Utilities, Maintenance, Salary, Misc")
    amount: Decimal = Field(gt=0, decimal_places=2, max_digits=12)
    payment_mode: PaymentMode = Field(default=PaymentMode.CASH)
    description: Optional[str] = None
    account_id: Optional[uuid.UUID] = None

class ExpenseRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    category: str
    amount: float
    payment_mode: PaymentMode
    description: Optional[str] = None
    account_id: Optional[uuid.UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True
