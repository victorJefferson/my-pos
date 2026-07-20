import uuid
from datetime import datetime
from typing import Optional
from decimal import Decimal
from sqlmodel import SQLModel, Field


class Product(SQLModel, table=True):
    __tablename__ = "products"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    category: str = Field(index=True)
    name: str = Field(index=True)
    selling_price: Optional[Decimal] = Field(default=None, decimal_places=2, max_digits=10)
    cost_price: Optional[Decimal] = Field(default=None, decimal_places=2, max_digits=10)
    stock_quantity: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
