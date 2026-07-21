import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlmodel import select

from app.database import get_session
from app.auth import get_current_user
from app.models.account import Account
from app.models.wallet_transaction import WalletTransaction, TransactionType
from app.schemas.account import AccountCreate, AccountRead, TransferCreate, DepositCreate, AccountUpdate

router = APIRouter(prefix="/accounts", tags=["accounts"])

@router.post("/", response_model=AccountRead, status_code=201, dependencies=[Depends(get_current_user)])
def create_account(
    tenant_id: uuid.UUID,
    payload: AccountCreate,
    db: Session = Depends(get_session)
):
    # Validate that the payment modes are not already assigned to another account
    if payload.payment_modes:
        existing = db.exec(select(Account).where(Account.tenant_id == tenant_id)).all()
        for e in existing:
            for pm in payload.payment_modes:
                if pm in e.payment_modes:
                    raise HTTPException(status_code=400, detail=f"Payment mode {pm} is already assigned to account {e.name}")
    
    account = Account(
        tenant_id=tenant_id,
        name=payload.name,
        payment_modes=payload.payment_modes,
        balance=0.0
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.get("/", response_model=List[AccountRead], dependencies=[Depends(get_current_user)])
def list_accounts(
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session)
):
    accounts = db.exec(select(Account).where(Account.tenant_id == tenant_id).order_by(Account.created_at)).all()
    return accounts

@router.post("/transfer", response_model=dict, dependencies=[Depends(get_current_user)])
def transfer_funds(
    tenant_id: uuid.UUID,
    payload: TransferCreate,
    db: Session = Depends(get_session)
):
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="Cannot transfer to the same account")
        
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Transfer amount must be greater than 0")
        
    from_acc = db.exec(select(Account).where(Account.id == payload.from_account_id, Account.tenant_id == tenant_id)).first()
    to_acc = db.exec(select(Account).where(Account.id == payload.to_account_id, Account.tenant_id == tenant_id)).first()
    
    if not from_acc:
        raise HTTPException(status_code=404, detail="Source account not found")
    if not to_acc:
        raise HTTPException(status_code=404, detail="Destination account not found")
        
    # Generate a reference ID for the transfer
    transfer_ref_id = uuid.uuid4()
    
    # Create Wallet Transactions
    tx_out = WalletTransaction(
        tenant_id=tenant_id,
        account_id=from_acc.id,
        type=TransactionType.TRANSFER_OUT,
        amount=payload.amount,
        reference_id=transfer_ref_id
    )
    
    tx_in = WalletTransaction(
        tenant_id=tenant_id,
        account_id=to_acc.id,
        type=TransactionType.TRANSFER_IN,
        amount=payload.amount,
        reference_id=transfer_ref_id
    )
    
    from_acc.balance -= payload.amount
    to_acc.balance += payload.amount
    
    db.add(tx_out)
    db.add(tx_in)
    db.add(from_acc)
    db.add(to_acc)
    
    db.commit()
    
    return {"status": "success", "message": "Transfer completed successfully"}

@router.post("/deposit", response_model=dict, dependencies=[Depends(get_current_user)])
def deposit_funds(
    tenant_id: uuid.UUID,
    payload: DepositCreate,
    db: Session = Depends(get_session)
):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Deposit amount must be greater than 0")
        
    acc = db.exec(select(Account).where(Account.id == payload.account_id, Account.tenant_id == tenant_id)).first()
    
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
        
    deposit_ref_id = uuid.uuid4()
    
    tx = WalletTransaction(
        tenant_id=tenant_id,
        account_id=acc.id,
        type=TransactionType.DEPOSIT,
        amount=payload.amount,
        reference_id=deposit_ref_id
    )
    
    acc.balance += payload.amount
    
    db.add(tx)
    db.add(acc)
    db.commit()
    
    return {"status": "success", "message": "Deposit completed successfully"}

@router.put("/{account_id}", response_model=AccountRead, dependencies=[Depends(get_current_user)])
def update_account(
    account_id: uuid.UUID,
    tenant_id: uuid.UUID,
    payload: AccountUpdate,
    db: Session = Depends(get_session)
):
    acc = db.exec(select(Account).where(Account.id == account_id, Account.tenant_id == tenant_id)).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
        
    # Validate that the payment modes are not already assigned to *another* account
    if payload.payment_modes:
        existing = db.exec(select(Account).where(Account.tenant_id == tenant_id, Account.id != account_id)).all()
        for e in existing:
            for pm in payload.payment_modes:
                if pm in e.payment_modes:
                    raise HTTPException(status_code=400, detail=f"Payment mode {pm} is already assigned to account {e.name}")
                    
    acc.name = payload.name
    acc.payment_modes = payload.payment_modes
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc

@router.delete("/{account_id}", status_code=204, dependencies=[Depends(get_current_user)])
def delete_account(
    account_id: uuid.UUID,
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session)
):
    acc = db.exec(select(Account).where(Account.id == account_id, Account.tenant_id == tenant_id)).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
        
    if acc.balance != 0:
        raise HTTPException(status_code=400, detail="Cannot delete account with non-zero balance")
        
    db.delete(acc)
    db.commit()
    return None
