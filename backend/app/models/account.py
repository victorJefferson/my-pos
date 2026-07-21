import uuid
from datetime import datetime
from typing import List, Optional
from decimal import Decimal
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON

class Account(SQLModel, table=True):
    __tablename__ = "accounts"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    name: str = Field(index=True)
    
    # E.g. ["CASH", "UPI", "CARD"]. Indicates which payment modes automatically route here for Sales.
    payment_modes: List[str] = Field(default=[], sa_column=Column(JSON))
    
    balance: Decimal = Field(default=Decimal("0.0"), decimal_places=2, max_digits=12)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
