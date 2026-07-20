import uuid
from datetime import datetime
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel
from app.models.sale import PaymentMode


class SaleItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: int
    unit_selling_price: Decimal  # frontend sends this (may have been entered via modal)
    unit_cost_price: Decimal = Decimal("0")


class SaleCreate(BaseModel):
    tenant_id: uuid.UUID
    cashier_id: Optional[uuid.UUID] = None
    payment_mode: PaymentMode = PaymentMode.CASH
    items: List[SaleItemIn]


class SaleItemRead(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    quantity: int
    unit_selling_price: Decimal
    unit_cost_price: Decimal
    total_price: Decimal
    total_profit: Decimal

    class Config:
        from_attributes = True


class SaleRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    invoice_number: int
    total_amount: Decimal
    total_cost: Decimal
    total_profit: Decimal
    payment_mode: PaymentMode
    cashier_id: Optional[uuid.UUID]
    created_at: datetime
    items: List[SaleItemRead] = []

    class Config:
        from_attributes = True
