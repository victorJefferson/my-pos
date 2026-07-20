import uuid
from datetime import datetime
from typing import Optional
from decimal import Decimal
from enum import Enum
from sqlmodel import SQLModel, Field


class PaymentMode(str, Enum):
    CASH = "CASH"
    UPI = "UPI"
    CARD = "CARD"


class Sale(SQLModel, table=True):
    __tablename__ = "sales"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    invoice_number: int = Field(default=None)  # auto-assigned in router
    total_amount: Decimal = Field(default=Decimal("0"), decimal_places=2, max_digits=12)
    total_cost: Decimal = Field(default=Decimal("0"), decimal_places=2, max_digits=12)
    total_profit: Decimal = Field(default=Decimal("0"), decimal_places=2, max_digits=12)
    payment_mode: PaymentMode = Field(default=PaymentMode.CASH)
    cashier_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SaleItem(SQLModel, table=True):
    __tablename__ = "sale_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    sale_id: uuid.UUID = Field(foreign_key="sales.id", index=True)
    product_id: uuid.UUID = Field(foreign_key="products.id")
    quantity: int
    unit_selling_price: Decimal = Field(decimal_places=2, max_digits=10)
    unit_cost_price: Decimal = Field(default=Decimal("0"), decimal_places=2, max_digits=10)
    total_price: Decimal = Field(decimal_places=2, max_digits=12)
    total_profit: Decimal = Field(default=Decimal("0"), decimal_places=2, max_digits=12)
