import uuid
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlmodel import select, func

from app.database import get_session
from app.auth import get_current_user
from app.models.product import Product
from app.models.sale import Sale, SaleItem, PaymentMode
from app.schemas.sale import SaleCreate, SaleRead, SaleItemRead, SaleItemQtyUpdate

router = APIRouter(prefix="/pos", tags=["pos"])


@router.post("/checkout", response_model=SaleRead, status_code=201, dependencies=[Depends(get_current_user)])
def checkout(payload: SaleCreate, db: Session = Depends(get_session)):
    """
    Complete a POS checkout:
    1. Validate all items exist and have stock
    2. Create Sale record with totals
    3. Create SaleItem records
    4. Decrement product stock
    """
    if not payload.items:
        raise HTTPException(status_code=400, detail="Cannot checkout with an empty cart")

    # --- Compute next invoice number for this tenant ---
    max_invoice = db.exec(
        select(func.max(Sale.invoice_number)).where(Sale.tenant_id == payload.tenant_id)
    ).first()
    next_invoice = (max_invoice or 0) + 1

    total_amount = Decimal("0")
    total_cost = Decimal("0")
    total_profit = Decimal("0")

    # Validate products and compute totals
    enriched_items = []
    for item in payload.items:
        product = db.exec(
            select(Product).where(
                Product.id == item.product_id,
                Product.tenant_id == payload.tenant_id,
                Product.is_active == True,
            )
        ).first()

        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

        if product.stock_quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for '{product.name}'. Available: {product.stock_quantity}",
            )

        line_total = item.unit_selling_price * item.quantity
        line_cost = item.unit_cost_price * item.quantity
        line_profit = line_total - line_cost

        total_amount += line_total
        total_cost += line_cost
        total_profit += line_profit

        enriched_items.append({
            "product": product,
            "item": item,
            "line_total": line_total,
            "line_cost": line_cost,
            "line_profit": line_profit,
        })

    # Create Sale
    sale = Sale(
        tenant_id=payload.tenant_id,
        invoice_number=next_invoice,
        total_amount=total_amount,
        total_cost=total_cost,
        total_profit=total_profit,
        payment_mode=payload.payment_mode,
        cashier_id=payload.cashier_id,
    )
    db.add(sale)
    db.flush()  # get sale.id before creating items

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

        # Decrement stock
        product.stock_quantity -= item.quantity
        db.add(product)

    db.commit()
    db.refresh(sale)

    # Build response
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
        items=[
            SaleItemRead(
                id=si.id,
                product_id=si.product_id,
                quantity=si.quantity,
                unit_selling_price=si.unit_selling_price,
                unit_cost_price=si.unit_cost_price,
                total_price=si.total_price,
                total_profit=si.total_profit,
            )
            for si in sale_items_db
        ],
    )


@router.get("/sales", response_model=List[SaleRead], dependencies=[Depends(get_current_user)])
def list_sales(
    tenant_id: uuid.UUID,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_session),
):
    """List recent sales for a tenant, including product names on each item."""
    sales = db.exec(
        select(Sale)
        .where(Sale.tenant_id == tenant_id)
        .order_by(Sale.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    result = []
    for sale in sales:
        items = db.exec(select(SaleItem).where(SaleItem.sale_id == sale.id)).all()
        # Fetch product names in bulk for this sale's items
        product_ids = [si.product_id for si in items]
        products_map = {}
        if product_ids:
            prods = db.exec(select(Product).where(Product.id.in_(product_ids))).all()
            products_map = {p.id: p.name for p in prods}

        calc_total = sum(si.total_price for si in items)
        calc_cost = sum(si.unit_cost_price * si.quantity for si in items)
        calc_profit = sum(si.total_profit for si in items)

        if sale.total_amount != calc_total or sale.total_cost != calc_cost or sale.total_profit != calc_profit:
            sale.total_amount = calc_total
            sale.total_cost = calc_cost
            sale.total_profit = calc_profit
            db.add(sale)
            db.commit()

        result.append(
            SaleRead(
                id=sale.id,
                tenant_id=sale.tenant_id,
                invoice_number=sale.invoice_number,
                total_amount=calc_total,
                total_cost=calc_cost,
                total_profit=calc_profit,
                payment_mode=sale.payment_mode,
                cashier_id=sale.cashier_id,
                created_at=sale.created_at,
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
                    for si in items
                ],
            )
        )
    return result


@router.delete("/sales/{sale_id}", status_code=204, dependencies=[Depends(get_current_user)])
def delete_sale(
    sale_id: uuid.UUID,
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Void a sale: restore stock for all items and delete the records."""
    sale = db.exec(
        select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
    ).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    items = db.exec(select(SaleItem).where(SaleItem.sale_id == sale_id)).all()
    for item in items:
        product = db.exec(
            select(Product).where(Product.id == item.product_id)
        ).first()
        if product:
            product.stock_quantity += item.quantity
            db.add(product)
        db.delete(item)

    db.flush()   # commit item deletions first so FK constraint is satisfied
    db.delete(sale)
    db.commit()


@router.delete("/sales/{sale_id}/items/{item_id}", status_code=204, dependencies=[Depends(get_current_user)])
def delete_sale_item(
    sale_id: uuid.UUID,
    item_id: uuid.UUID,
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Delete a single item from a sale, restoring its stock and recalculating sale totals.
    If it was the last item in the sale, the entire sale is deleted."""
    sale = db.exec(
        select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
    ).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    item = db.exec(
        select(SaleItem).where(SaleItem.id == item_id, SaleItem.sale_id == sale_id)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Sale item not found")

    # Restore stock for this item
    product = db.exec(select(Product).where(Product.id == item.product_id)).first()
    if product:
        product.stock_quantity += item.quantity
        db.add(product)

    db.delete(item)
    db.flush()  # flush item delete before checking remaining or deleting sale

    # Check how many items remain in the sale
    remaining = db.exec(select(SaleItem).where(SaleItem.sale_id == sale_id)).all()
    if not remaining:
        # Last item removed — delete the whole sale
        db.delete(sale)
    else:
        # Recalculate sale totals from remaining items
        sale.total_amount = sum(si.total_price for si in remaining)
        sale.total_cost = sum(si.unit_cost_price * si.quantity for si in remaining)
        sale.total_profit = sum(si.total_profit for si in remaining)
        db.add(sale)

    db.commit()


@router.patch("/sales/{sale_id}/items/{item_id}", response_model=SaleRead, dependencies=[Depends(get_current_user)])
def update_sale_item_qty(
    sale_id: uuid.UUID,
    item_id: uuid.UUID,
    body: SaleItemQtyUpdate,
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Update the quantity of a single item in a sale, adjusting stock and sale totals."""
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    sale = db.exec(
        select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
    ).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    item = db.exec(
        select(SaleItem).where(SaleItem.id == item_id, SaleItem.sale_id == sale_id)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Sale item not found")

    product = db.exec(select(Product).where(Product.id == item.product_id)).first()

    old_qty = item.quantity
    delta = old_qty - body.quantity  # positive means freeing stock, negative means using more

    if delta < 0 and product and product.stock_quantity < abs(delta):
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock. Only {product.stock_quantity} available.",
        )

    # Adjust stock
    if product:
        product.stock_quantity += delta
        db.add(product)

    # Update item totals
    item.quantity = body.quantity
    item.total_price = item.unit_selling_price * body.quantity
    item.total_profit = (item.unit_selling_price - item.unit_cost_price) * body.quantity
    db.add(item)
    db.flush()  # write item changes to DB before reading back for totals

    # Re-query ALL items fresh from DB to get reliable values (avoids identity-map stale reads)
    all_items = db.exec(select(SaleItem).where(SaleItem.sale_id == sale_id)).all()
    sale.total_amount = sum(si.total_price for si in all_items)
    sale.total_cost   = sum(si.unit_cost_price * si.quantity for si in all_items)
    sale.total_profit = sum(si.total_profit for si in all_items)
    db.add(sale)
    db.commit()
    db.refresh(sale)

    # Build enriched response
    final_items = db.exec(select(SaleItem).where(SaleItem.sale_id == sale_id)).all()
    product_ids = [si.product_id for si in final_items]
    products_map = {}
    if product_ids:
        prods = db.exec(select(Product).where(Product.id.in_(product_ids))).all()
        products_map = {p.id: p.name for p in prods}

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
            for si in final_items
        ],
    )
