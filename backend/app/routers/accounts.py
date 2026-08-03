import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Response
from sqlalchemy.orm import Session
from sqlmodel import select

from app.database import get_session
from app.auth import get_current_user
from app.models.account import Account
from app.models.wallet_transaction import WalletTransaction, TransactionType
from app.schemas.account import AccountCreate, AccountRead, TransferCreate, DepositCreate, AccountUpdate
from app.services.idempotency import get_cached_response, store_response, raise_sync_error

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.post("/", response_model=AccountRead, status_code=201, dependencies=[Depends(get_current_user)])
def create_account(
    tenant_id: uuid.UUID,
    payload: AccountCreate,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached and cached.response_json:
        return cached.response_json

    if payload.payment_modes:
        existing = db.exec(select(Account).where(Account.tenant_id == tenant_id)).all()
        for e in existing:
            for pm in payload.payment_modes:
                if pm in e.payment_modes:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Payment mode {pm} is already assigned to account {e.name}",
                    )

    account = Account(
        tenant_id=tenant_id,
        name=payload.name,
        payment_modes=payload.payment_modes,
        balance=0.0,
    )
    db.add(account)
    db.flush()
    store_response(db, tenant_id, idempotency_key, "POST /accounts/", 201, account)
    db.commit()
    db.refresh(account)
    return account


@router.get("/", response_model=List[AccountRead], dependencies=[Depends(get_current_user)])
def list_accounts(
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    accounts = db.exec(
        select(Account).where(Account.tenant_id == tenant_id).order_by(Account.created_at)
    ).all()
    return accounts


@router.post("/transfer", response_model=dict, dependencies=[Depends(get_current_user)])
def transfer_funds(
    tenant_id: uuid.UUID,
    payload: TransferCreate,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached and cached.response_json:
        return cached.response_json

    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="Cannot transfer to the same account")

    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Transfer amount must be greater than 0")

    # Lock in stable id order
    ids = sorted([payload.from_account_id, payload.to_account_id])
    locked = {}
    for aid in ids:
        acc = db.exec(
            select(Account).where(Account.id == aid, Account.tenant_id == tenant_id).with_for_update()
        ).first()
        if not acc:
            raise_sync_error("ACCOUNT_MISSING", "Account not found", status_code=404)
        locked[aid] = acc

    from_acc = locked[payload.from_account_id]
    to_acc = locked[payload.to_account_id]

    if from_acc.balance < payload.amount:
        raise_sync_error(
            "BALANCE_INSUFFICIENT",
            f"Insufficient balance in '{from_acc.name}'",
            available=float(from_acc.balance),
        )

    transfer_ref_id = uuid.uuid4()

    tx_out = WalletTransaction(
        tenant_id=tenant_id,
        account_id=from_acc.id,
        type=TransactionType.TRANSFER_OUT,
        amount=payload.amount,
        reference_id=transfer_ref_id,
    )
    tx_in = WalletTransaction(
        tenant_id=tenant_id,
        account_id=to_acc.id,
        type=TransactionType.TRANSFER_IN,
        amount=payload.amount,
        reference_id=transfer_ref_id,
    )

    from_acc.balance -= payload.amount
    to_acc.balance += payload.amount

    db.add(tx_out)
    db.add(tx_in)
    db.add(from_acc)
    db.add(to_acc)

    body = {"status": "success", "message": "Transfer completed successfully", "reference_id": str(transfer_ref_id)}
    store_response(db, tenant_id, idempotency_key, "POST /accounts/transfer", 200, body)
    db.commit()
    return body


@router.post("/deposit", response_model=dict, dependencies=[Depends(get_current_user)])
def deposit_funds(
    tenant_id: uuid.UUID,
    payload: DepositCreate,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached and cached.response_json:
        return cached.response_json

    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Deposit amount must be greater than 0")

    acc = db.exec(
        select(Account)
        .where(Account.id == payload.account_id, Account.tenant_id == tenant_id)
        .with_for_update()
    ).first()

    if not acc:
        raise_sync_error("ACCOUNT_MISSING", "Account not found", status_code=404)

    deposit_ref_id = uuid.uuid4()

    tx = WalletTransaction(
        tenant_id=tenant_id,
        account_id=acc.id,
        type=TransactionType.DEPOSIT,
        amount=payload.amount,
        reference_id=deposit_ref_id,
    )

    acc.balance += payload.amount
    db.add(tx)
    db.add(acc)

    body = {"status": "success", "message": "Deposit completed successfully", "reference_id": str(deposit_ref_id)}
    store_response(db, tenant_id, idempotency_key, "POST /accounts/deposit", 200, body)
    db.commit()
    return body


@router.put("/{account_id}", response_model=AccountRead, dependencies=[Depends(get_current_user)])
def update_account(
    account_id: uuid.UUID,
    tenant_id: uuid.UUID,
    payload: AccountUpdate,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached and cached.response_json:
        return cached.response_json

    acc = db.exec(
        select(Account).where(Account.id == account_id, Account.tenant_id == tenant_id).with_for_update()
    ).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    if payload.payment_modes:
        existing = db.exec(
            select(Account).where(Account.tenant_id == tenant_id, Account.id != account_id)
        ).all()
        for e in existing:
            for pm in payload.payment_modes:
                if pm in e.payment_modes:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Payment mode {pm} is already assigned to account {e.name}",
                    )

    acc.name = payload.name
    acc.payment_modes = payload.payment_modes
    db.add(acc)
    store_response(db, tenant_id, idempotency_key, f"PUT /accounts/{account_id}", 200, acc)
    db.commit()
    db.refresh(acc)
    return acc


@router.delete("/{account_id}", dependencies=[Depends(get_current_user)])
def delete_account(
    account_id: uuid.UUID,
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached:
        if cached.response_json is not None:
            return cached.response_json
        return Response(status_code=cached.status_code or 200)

    acc = db.exec(
        select(Account).where(Account.id == account_id, Account.tenant_id == tenant_id).with_for_update()
    ).first()
    if not acc:
        store_response(
            db, tenant_id, idempotency_key,
            f"DELETE /accounts/{account_id}", 200, {"status": "already_deleted"},
        )
        db.commit()
        return {"status": "already_deleted"}

    if acc.balance != 0:
        raise_sync_error(
            "BALANCE_INSUFFICIENT",
            "Cannot delete account with non-zero balance",
            balance=float(acc.balance),
        )

    db.delete(acc)
    body = {"status": "deleted"}
    store_response(db, tenant_id, idempotency_key, f"DELETE /accounts/{account_id}", 200, body)
    db.commit()
    return body
