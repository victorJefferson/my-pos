import uuid
from datetime import datetime
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel


class ProductBase(BaseModel):
    category: str
    name: str
    selling_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    stock_quantity: int = 0
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    selling_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    stock_quantity: Optional[int] = None
    is_active: Optional[bool] = None


class ProductRead(ProductBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    profit_margin_pct: Optional[float] = None  # computed field

    class Config:
        from_attributes = True
