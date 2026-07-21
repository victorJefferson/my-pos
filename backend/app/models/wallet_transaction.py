import uuid
from datetime import datetime
from typing import Optional
from decimal import Decimal
from enum import Enum
from sqlmodel import SQLModel, Field

class TransactionType(str, Enum):
    SALE = "SALE"
    EXPENSE = "EXPENSE"
    TRANSFER_IN = "TRANSFER_IN"
    TRANSFER_OUT = "TRANSFER_OUT"
    DEPOSIT = "DEPOSIT"

class WalletTransaction(SQLModel, table=True):
    __tablename__ = "wallet_transactions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    account_id: uuid.UUID = Field(foreign_key="accounts.id", index=True)
    
    type: TransactionType
    amount: Decimal = Field(decimal_places=2, max_digits=12)
    
    # Can link to a sale_id, expense_id, or transfer_id. Nullable because it's loosely coupled.
    reference_id: Optional[uuid.UUID] = Field(default=None, index=True)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
