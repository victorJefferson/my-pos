import uuid
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal

class AccountCreate(BaseModel):
    name: str
    payment_modes: List[str]

class AccountUpdate(BaseModel):
    name: str
    payment_modes: List[str]

class AccountRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    payment_modes: List[str]
    balance: Decimal
    created_at: datetime

class TransferCreate(BaseModel):
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    amount: Decimal
    description: Optional[str] = None

class DepositCreate(BaseModel):
    account_id: uuid.UUID
    amount: Decimal
    description: Optional[str] = None
