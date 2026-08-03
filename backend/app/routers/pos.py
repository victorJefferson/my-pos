import uuid
from decimal import Decimal
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlmodel import select, func

from app.database import get_session
from app.auth import get_current_user
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.models.expense import Expense
from app.models.account import Account
from app.models.wallet_transaction import WalletTransaction, TransactionType
from app.schemas.sale import SaleCreate, SaleRead, SaleItemRead, SaleItemQtyUpdate
from app.services.idempotency import (
    get_cached_response,
    store_response,
    raise_sync_error,
)
from app.timeutil import parse_ymd, local_day_utc_bounds

router = APIRouter(prefix="/pos", tags=["pos"])


def _sale_read(sale: Sale, sale_items: list, products_map: Optional[dict] = None) -> SaleRead:
    products_map = products_map or {}
    return SaleRead(
        id=sale.id,
        tenant_id=sale.tenant_id,
        invoice_number=sale.invoice_number,
        total_amount=sale.total_amount,
        total_cost=sale.total_cost,
        total_profit=sale.total_profit,
        payment_mode=sale.payment_mode,
        cashier_id=sale.cashier_id,
        created_at=sale.created_at,
        client_sale_id=sale.client_sale_id,
        items=[
            SaleItemRead(
                id=si.id,
                product_id=si.product_id,
                product_name=products_map.get(si.product_id),
                quantity=si.quantity,
                unit_selling_price=si.unit_selling_price,
                unit_cost_price=si.unit_cost_price,
                total_price=si.total_price,
                total_profit=si.total_profit,
            )
            for si in sale_items
        ],
    )


def _resolve_account(
    db: Session,
    tenant_id: uuid.UUID,
    payment_mode,
    account_id: Optional[uuid.UUID],
) -> Optional[Account]:
    if account_id:
        acc = db.exec(
            select(Account)
            .where(Account.id == account_id, Account.tenant_id == tenant_id)
            .with_for_update()
        ).first()
        if not acc:
            raise_sync_error("ACCOUNT_MISSING", "Account not found", status_code=404)
        modes = acc.payment_modes or []
        if payment_mode not in modes and str(payment_mode) not in modes:
            # payment_mode may be enum
            pm = payment_mode.value if hasattr(payment_mode, "value") else str(payment_mode)
            if pm not in modes:
                raise_sync_error(
                    "ACCOUNT_MODE_MISMATCH",
                    f"Account '{acc.name}' does not support payment mode {pm}",
                )
        return acc

    accounts = db.exec(
        select(Account).where(Account.tenant_id == tenant_id).with_for_update()
    ).all()
    pm = payment_mode.value if hasattr(payment_mode, "value") else str(payment_mode)
    for acc in accounts:
        if pm in (acc.payment_modes or []):
            return acc
    return None


def _next_invoice(db: Session, tenant_id: uuid.UUID) -> int:
    max_invoice = db.exec(
        select(func.max(Sale.invoice_number)).where(Sale.tenant_id == tenant_id)
    ).first()
    return (max_invoice or 0) + 1


@router.post("/checkout", response_model=SaleRead, status_code=201, dependencies=[Depends(get_current_user)])
def checkout(
    payload: SaleCreate,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Atomic POS checkout: sale + items + stock + wallet in one commit.
    Idempotent via client_sale_id and/or Idempotency-Key.
    """
    if not payload.items:
        raise HTTPException(status_code=400, detail="Cannot checkout with an empty cart")

    client_sale_id = payload.client_sale_id
    op_key = idempotency_key or (str(client_sale_id) if client_sale_id else None)

    # Replay via sync_idempotency
    cached = get_cached_response(db, payload.tenant_id, op_key)
    if cached and cached.response_json:
        return cached.response_json

    # Replay via client_sale_id unique key
    if client_sale_id:
        existing = db.exec(
            select(Sale).where(
                Sale.tenant_id == payload.tenant_id,
                Sale.client_sale_id == client_sale_id,
            )
        ).first()
        if existing:
            items = db.exec(select(SaleItem).where(SaleItem.sale_id == existing.id)).all()
            return _sale_read(existing, items)

    # Lock products in stable id order to avoid deadlocks
    product_ids = sorted({item.product_id for item in payload.items})
    products_by_id = {}
    for pid in product_ids:
        product = db.exec(
            select(Product)
            .where(
                Product.id == pid,
                Product.tenant_id == payload.tenant_id,
                Product.is_active == True,  # noqa: E712
            )
            .with_for_update()
        ).first()
        if not product:
            raise_sync_error(
                "PRODUCT_MISSING",
                f"Product {pid} not found",
                status_code=404,
                product_id=str(pid),
            )
        products_by_id[pid] = product

    total_amount = Decimal("0")
    total_cost = Decimal("0")
    total_profit = Decimal("0")
    enriched_items = []

    for item in payload.items:
        product = products_by_id[item.product_id]
        if product.stock_quantity < item.quantity:
            raise_sync_error(
                "STOCK_INSUFFICIENT",
                f"Insufficient stock for '{product.name}'. Available: {product.stock_quantity}",
                product_id=str(product.id),
                available=product.stock_quantity,
                requested=item.quantity,
            )

        line_total = item.unit_selling_price * item.quantity
        line_cost = item.unit_cost_price * item.quantity
        line_profit = line_total - line_cost
        total_amount += line_total
        total_cost += line_cost
        total_profit += line_profit
        enriched_items.append(
            {
                "product": product,
                "item": item,
                "line_total": line_total,
                "line_cost": line_cost,
                "line_profit": line_profit,
            }
        )

    account = _resolve_account(db, payload.tenant_id, payload.payment_mode, payload.account_id)

    # Invoice allocation + create (retry once on unique race)
    sale = None
    sale_items_db = []
    for attempt in range(2):
        try:
            next_invoice = _next_invoice(db, payload.tenant_id)
            sale = Sale(
                tenant_id=payload.tenant_id,
                invoice_number=next_invoice,
                client_sale_id=client_sale_id,
                total_amount=total_amount,
                total_cost=total_cost,
                total_profit=total_profit,
                payment_mode=payload.payment_mode,
                cashier_id=payload.cashier_id,
            )
            db.add(sale)
            db.flush()

            sale_items_db = []
            for enriched in enriched_items:
                product = enriched["product"]
                item = enriched["item"]
                sale_item = SaleItem(
                    tenant_id=payload.tenant_id,
                    sale_id=sale.id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    unit_selling_price=item.unit_selling_price,
                    unit_cost_price=item.unit_cost_price,
                    total_price=enriched["line_total"],
                    total_profit=enriched["line_profit"],
                )
                db.add(sale_item)
                sale_items_db.append(sale_item)
                product.stock_quantity -= item.quantity
                db.add(product)

            if account:
                account.balance += sale.total_amount
                db.add(account)
                db.add(
                    WalletTransaction(
                        tenant_id=payload.tenant_id,
                        account_id=account.id,
                        type=TransactionType.SALE,
                        amount=sale.total_amount,
                        reference_id=sale.id,
                    )
                )

            result = _sale_read(sale, sale_items_db)
            store_response(db, payload.tenant_id, op_key, "POST /pos/checkout", 201, result)
            db.commit()
            for si in sale_items_db:
                db.refresh(si)
            db.refresh(sale)
            return _sale_read(sale, sale_items_db)
        except IntegrityError:
            db.rollback()
            # Idempotent race: another request inserted same client_sale_id
            if client_sale_id:
                existing = db.exec(
                    select(Sale).where(
                        Sale.tenant_id == payload.tenant_id,
                        Sale.client_sale_id == client_sale_id,
                    )
                ).first()
                if existing:
                    items = db.exec(select(SaleItem).where(SaleItem.sale_id == existing.id)).all()
                    return _sale_read(existing, items)
            if attempt == 0:
                # Re-lock products for retry (invoice collision)
                products_by_id = {}
                for pid in product_ids:
                    product = db.exec(
                        select(Product)
                        .where(
                            Product.id == pid,
                            Product.tenant_id == payload.tenant_id,
                            Product.is_active == True,  # noqa: E712
                        )
                        .with_for_update()
                    ).first()
                    if not product:
                        raise_sync_error("PRODUCT_MISSING", f"Product {pid} not found", status_code=404)
                    products_by_id[pid] = product
                for enriched in enriched_items:
                    enriched["product"] = products_by_id[enriched["item"].product_id]
                account = _resolve_account(
                    db, payload.tenant_id, payload.payment_mode, payload.account_id
                )
                continue
            raise HTTPException(status_code=409, detail="Could not allocate invoice number")

    raise HTTPException(status_code=500, detail="Checkout failed")


@router.get("/sales", response_model=List[SaleRead], dependencies=[Depends(get_current_user)])
def list_sales(
    tenant_id: uuid.UUID,
    target_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_session),
):
    """List recent sales for a tenant, including product names on each item."""
    query = select(Sale).where(Sale.tenant_id == tenant_id)

    if target_date:
        day_start, day_end = local_day_utc_bounds(parse_ymd(target_date))
        query = query.where(Sale.created_at >= day_start, Sale.created_at <= day_end)
        query = query.order_by(Sale.created_at.desc())
    else:
        query = query.order_by(Sale.created_at.desc()).offset(skip).limit(limit)

    sales = db.exec(query).all()
    if not sales:
        return []

    sale_ids = [s.id for s in sales]
    all_items = db.exec(select(SaleItem).where(SaleItem.sale_id.in_(sale_ids))).all()

    items_by_sale = {}
    for item in all_items:
        items_by_sale.setdefault(item.sale_id, []).append(item)

    product_ids = list({si.product_id for si in all_items})
    products_map = {}
    if product_ids:
        prods = db.exec(select(Product).where(Product.id.in_(product_ids))).all()
        products_map = {p.id: p.name for p in prods}

    result = []
    need_commit = False

    for sale in sales:
        items = items_by_sale.get(sale.id, [])

        calc_total = sum(
            (si.total_price if si.total_price > 0 else (si.unit_selling_price * si.quantity))
            for si in items
        )
        calc_cost = sum(si.unit_cost_price * si.quantity for si in items)
        calc_profit = sum(
            (
                si.total_profit
                if si.total_profit != 0
                else ((si.unit_selling_price - si.unit_cost_price) * si.quantity)
            )
            for si in items
        )

        if sale.total_amount != calc_total or sale.total_cost != calc_cost or sale.total_profit != calc_profit:
            sale.total_amount = calc_total
            sale.total_cost = calc_cost
            sale.total_profit = calc_profit
            db.add(sale)
            need_commit = True

        result.append(_sale_read(sale, items, products_map))
        # overwrite totals in response with calculated
        result[-1].total_amount = calc_total
        result[-1].total_cost = calc_cost
        result[-1].total_profit = calc_profit

    if need_commit:
        db.commit()

    return result


@router.delete("/sales/{sale_id}", dependencies=[Depends(get_current_user)])
def delete_sale(
    sale_id: uuid.UUID,
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """Void a sale: restore stock for all items and delete the records."""
    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached:
        return Response(status_code=cached.status_code or 200)

    sale = db.exec(
        select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id).with_for_update()
    ).first()
    if not sale:
        # Idempotent delete: already gone
        store_response(db, tenant_id, idempotency_key, f"DELETE /pos/sales/{sale_id}", 200, {"status": "already_deleted"})
        db.commit()
        return {"status": "already_deleted"}

    items = db.exec(select(SaleItem).where(SaleItem.sale_id == sale_id)).all()
    product_ids = sorted({item.product_id for item in items})
    products = {}
    for pid in product_ids:
        products[pid] = db.exec(
            select(Product).where(Product.id == pid).with_for_update()
        ).first()

    for item in items:
        product = products.get(item.product_id)
        if product:
            product.stock_quantity += item.quantity
            db.add(product)
        db.delete(item)

    db.flush()

    wallet_tx = db.exec(
        select(WalletTransaction)
        .where(
            WalletTransaction.reference_id == sale_id,
            WalletTransaction.type == TransactionType.SALE,
        )
        .with_for_update()
    ).first()
    if wallet_tx:
        acc = db.exec(
            select(Account).where(Account.id == wallet_tx.account_id).with_for_update()
        ).first()
        if acc:
            acc.balance -= wallet_tx.amount
            db.add(acc)
        db.delete(wallet_tx)

    db.delete(sale)
    store_response(db, tenant_id, idempotency_key, f"DELETE /pos/sales/{sale_id}", 200, {"status": "deleted"})
    db.commit()
    return {"status": "deleted"}


@router.delete("/sales/{sale_id}/items/{item_id}", dependencies=[Depends(get_current_user)])
def delete_sale_item(
    sale_id: uuid.UUID,
    item_id: uuid.UUID,
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """Delete a single item from a sale, restoring its stock and recalculating sale totals."""
    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached and cached.response_json is not None:
        return cached.response_json
    if cached:
        return Response(status_code=cached.status_code or 200)

    sale = db.exec(
        select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id).with_for_update()
    ).first()
    if not sale:
        store_response(
            db, tenant_id, idempotency_key,
            f"DELETE /pos/sales/{sale_id}/items/{item_id}", 200, {"status": "already_deleted"},
        )
        db.commit()
        return {"status": "already_deleted"}

    item = db.exec(
        select(SaleItem).where(SaleItem.id == item_id, SaleItem.sale_id == sale_id).with_for_update()
    ).first()
    if not item:
        store_response(
            db, tenant_id, idempotency_key,
            f"DELETE /pos/sales/{sale_id}/items/{item_id}", 200, {"status": "already_deleted"},
        )
        db.commit()
        return {"status": "already_deleted"}

    product = db.exec(
        select(Product).where(Product.id == item.product_id).with_for_update()
    ).first()
    if product:
        product.stock_quantity += item.quantity
        db.add(product)

    db.delete(item)
    db.flush()

    remaining = db.exec(select(SaleItem).where(SaleItem.sale_id == sale_id)).all()
    body = {"status": "deleted"}
    if not remaining:
        wallet_tx = db.exec(
            select(WalletTransaction).where(
                WalletTransaction.reference_id == sale_id,
                WalletTransaction.type == TransactionType.SALE,
            ).with_for_update()
        ).first()
        if wallet_tx:
            acc = db.exec(
                select(Account).where(Account.id == wallet_tx.account_id).with_for_update()
            ).first()
            if acc:
                acc.balance -= wallet_tx.amount
                db.add(acc)
            db.delete(wallet_tx)
        db.delete(sale)
        body = {"status": "sale_deleted"}
    else:
        old_total = sale.total_amount
        sale.total_amount = sum(si.total_price for si in remaining)
        sale.total_cost = sum(si.unit_cost_price * si.quantity for si in remaining)
        sale.total_profit = sum(si.total_profit for si in remaining)
        db.add(sale)

        diff = old_total - sale.total_amount
        if diff != 0:
            wallet_tx = db.exec(
                select(WalletTransaction).where(
                    WalletTransaction.reference_id == sale_id,
                    WalletTransaction.type == TransactionType.SALE,
                ).with_for_update()
            ).first()
            if wallet_tx:
                acc = db.exec(
                    select(Account).where(Account.id == wallet_tx.account_id).with_for_update()
                ).first()
                if acc:
                    acc.balance -= diff
                    db.add(acc)
                wallet_tx.amount = sale.total_amount
                db.add(wallet_tx)

    store_response(
        db, tenant_id, idempotency_key,
        f"DELETE /pos/sales/{sale_id}/items/{item_id}", 200, body,
    )
    db.commit()
    return body


@router.patch("/sales/{sale_id}/items/{item_id}", response_model=SaleRead, dependencies=[Depends(get_current_user)])
def update_sale_item_qty(
    sale_id: uuid.UUID,
    item_id: uuid.UUID,
    body: SaleItemQtyUpdate,
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """Update the quantity of a single item in a sale, adjusting stock and sale totals."""
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    cached = get_cached_response(db, tenant_id, idempotency_key)
    if cached and cached.response_json:
        return cached.response_json

    sale = db.exec(
        select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id).with_for_update()
    ).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    item = db.exec(
        select(SaleItem).where(SaleItem.id == item_id, SaleItem.sale_id == sale_id).with_for_update()
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Sale item not found")

    product = db.exec(
        select(Product).where(Product.id == item.product_id).with_for_update()
    ).first()

    old_qty = item.quantity
    delta = old_qty - body.quantity

    if delta < 0 and product and product.stock_quantity < abs(delta):
        raise_sync_error(
            "STOCK_INSUFFICIENT",
            f"Insufficient stock. Only {product.stock_quantity} available.",
            available=product.stock_quantity,
        )

    if product:
        product.stock_quantity += delta
        db.add(product)

    item.quantity = body.quantity
    item.total_price = item.unit_selling_price * body.quantity
    item.total_profit = (item.unit_selling_price - item.unit_cost_price) * body.quantity
    db.add(item)
    db.flush()

    all_items = db.exec(select(SaleItem).where(SaleItem.sale_id == sale_id)).all()
    old_total = sale.total_amount
    sale.total_amount = sum(
        (si.total_price if si.total_price > 0 else (si.unit_selling_price * si.quantity))
        for si in all_items
    )
    sale.total_cost = sum(si.unit_cost_price * si.quantity for si in all_items)
    sale.total_profit = sum(
        (
            si.total_profit
            if si.total_profit != 0
            else ((si.unit_selling_price - si.unit_cost_price) * si.quantity)
        )
        for si in all_items
    )
    db.add(sale)

    diff = sale.total_amount - old_total
    if diff != 0:
        wallet_tx = db.exec(
            select(WalletTransaction).where(
                WalletTransaction.reference_id == sale_id,
                WalletTransaction.type == TransactionType.SALE,
            ).with_for_update()
        ).first()
        if wallet_tx:
            acc = db.exec(
                select(Account).where(Account.id == wallet_tx.account_id).with_for_update()
            ).first()
            if acc:
                acc.balance += diff
                db.add(acc)
            wallet_tx.amount = sale.total_amount
            db.add(wallet_tx)

    final_items = db.exec(select(SaleItem).where(SaleItem.sale_id == sale_id)).all()
    product_ids = [si.product_id for si in final_items]
    products_map = {}
    if product_ids:
        prods = db.exec(select(Product).where(Product.id.in_(product_ids))).all()
        products_map = {p.id: p.name for p in prods}

    result = _sale_read(sale, final_items, products_map)
    store_response(
        db, tenant_id, idempotency_key,
        f"PATCH /pos/sales/{sale_id}/items/{item_id}", 200, result,
    )
    db.commit()
    db.refresh(sale)
    return result


@router.delete("/purge-transactions", dependencies=[Depends(get_current_user)])
def purge_transactions(
    tenant_id: uuid.UUID,
    include_expenses: bool = True,
    db: Session = Depends(get_session),
):
    """
    Purge all historical sales, sale items, and optionally expenses for a tenant.
    Online-only admin action — not queued for offline sync.
    """
    sales = db.exec(select(Sale).where(Sale.tenant_id == tenant_id)).all()
    sale_ids = [s.id for s in sales]

    deleted_sale_items = 0
    if sale_ids:
        sale_items = db.exec(select(SaleItem).where(SaleItem.sale_id.in_(sale_ids))).all()
        deleted_sale_items = len(sale_items)
        for si in sale_items:
            db.delete(si)
        db.flush()

        for s in sales:
            db.delete(s)
        db.flush()

    deleted_expenses = 0
    if include_expenses:
        expenses = db.exec(select(Expense).where(Expense.tenant_id == tenant_id)).all()
        deleted_expenses = len(expenses)
        for ex in expenses:
            db.delete(ex)
        db.flush()

    wallet_txs = db.exec(select(WalletTransaction).where(WalletTransaction.tenant_id == tenant_id)).all()
    for tx in wallet_txs:
        db.delete(tx)
    accounts = db.exec(select(Account).where(Account.tenant_id == tenant_id)).all()
    for acc in accounts:
        acc.balance = Decimal("0.0")
        db.add(acc)

    db.commit()

    return {
        "status": "success",
        "message": "Transaction history purged successfully.",
        "deleted_sales": len(sales),
        "deleted_sale_items": deleted_sale_items,
        "deleted_expenses": deleted_expenses,
    }
