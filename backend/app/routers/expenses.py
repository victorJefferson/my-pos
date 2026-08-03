import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Response
from sqlalchemy.orm import Session
from sqlalchemy import cast, Date
from sqlmodel import select

from app.database import get_session
from app.auth import get_current_user
from app.models.expense import Expense
from app.models.account import Account
from app.models.wallet_transaction import WalletTransaction, TransactionType
from app.schemas.expense import ExpenseCreate, ExpenseRead
from app.services.idempotency import get_cached_response, store_response, raise_sync_error

router = APIRouter(prefix="/expenses", tags=["expenses"])


def _to_read(e: Expense) -> ExpenseRead:
    return ExpenseRead(
        id=e.id,
        tenant_id=e.tenant_id,
        category=e.category,
        amount=float(e.amount),
        payment_mode=e.payment_mode,
        description=e.description,
        account_id=e.account_id,
        created_at=e.created_at,
    )


@router.post("/", response_model=ExpenseRead, status_code=201, dependencies=[Depends(get_current_user)])
def create_expense(
    tenant_id: uuid.UUID,
    payload: ExpenseCreate,
    db: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """Record a new store operating expense."""
    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached and cached.response_json:
        return cached.response_json

    if payload.account_id:
        acc = db.exec(
            select(Account)
            .where(Account.id == payload.account_id, Account.tenant_id == tenant_id)
            .with_for_update()
        ).first()
        if not acc:
            raise_sync_error("ACCOUNT_MISSING", "Account not found", status_code=404)
    else:
        acc = None

    exp = Expense(
        tenant_id=tenant_id,
        category=payload.category.strip() or "Misc",
        amount=payload.amount,
        payment_mode=payload.payment_mode,
        description=payload.description,
        account_id=payload.account_id,
    )
    db.add(exp)
    db.flush()

    if acc:
        acc.balance -= payload.amount
        db.add(acc)
        db.add(
            WalletTransaction(
                tenant_id=tenant_id,
                account_id=acc.id,
                type=TransactionType.EXPENSE,
                amount=payload.amount,
                reference_id=exp.id,
            )
        )

    result = _to_read(exp)
    store_response(db, tenant_id, idempotency_key, "POST /expenses/", 201, result)
    db.commit()
    db.refresh(exp)
    return _to_read(exp)


@router.get("/", response_model=List[ExpenseRead], dependencies=[Depends(get_current_user)])
def list_expenses(
    tenant_id: uuid.UUID,
    category: Optional[str] = None,
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_session),
):
    """List expenses for a tenant with optional filtering."""
    stmt = select(Expense).where(Expense.tenant_id == tenant_id)

    if category:
        stmt = stmt.where(Expense.category == category)
    if start_date:
        try:
            parsed_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            stmt = stmt.where(cast(Expense.created_at, Date) >= parsed_start)
        except ValueError:
            pass
    if end_date:
        try:
            parsed_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            stmt = stmt.where(cast(Expense.created_at, Date) <= parsed_end)
        except ValueError:
            pass

    stmt = stmt.order_by(Expense.created_at.desc()).offset(skip).limit(limit)
    expenses = db.exec(stmt).all()
    return [_to_read(e) for e in expenses]


@router.get("/categories", response_model=List[str], dependencies=[Depends(get_current_user)])
def list_expense_categories(tenant_id: uuid.UUID, db: Session = Depends(get_session)):
    """Return distinct expense categories for this tenant."""
    default_cats = ["Procurement", "Transportation", "Utilities", "Maintenance", "Salary", "Misc"]
    stmt = select(Expense.category).where(Expense.tenant_id == tenant_id).distinct()
    existing_cats = db.exec(stmt).all()
    combined = sorted(list(set(default_cats + existing_cats)))
    return combined


@router.delete("/{expense_id}", dependencies=[Depends(get_current_user)])
def delete_expense(
    expense_id: uuid.UUID,
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached:
        if cached.response_json is not None:
            return cached.response_json
        return Response(status_code=cached.status_code or 200)

    exp = db.exec(
        select(Expense).where(Expense.id == expense_id, Expense.tenant_id == tenant_id).with_for_update()
    ).first()
    if not exp:
        store_response(
            db, tenant_id, idempotency_key,
            f"DELETE /expenses/{expense_id}", 200, {"status": "already_deleted"},
        )
        db.commit()
        return {"status": "already_deleted"}

    wallet_tx = db.exec(
        select(WalletTransaction).where(
            WalletTransaction.reference_id == expense_id,
            WalletTransaction.type == TransactionType.EXPENSE,
        ).with_for_update()
    ).first()

    if wallet_tx:
        acc = db.exec(
            select(Account).where(Account.id == wallet_tx.account_id).with_for_update()
        ).first()
        if acc:
            acc.balance += wallet_tx.amount
            db.add(acc)
        db.delete(wallet_tx)

    db.delete(exp)
    body = {"status": "deleted"}
    store_response(db, tenant_id, idempotency_key, f"DELETE /expenses/{expense_id}", 200, body)
    db.commit()
    return body
