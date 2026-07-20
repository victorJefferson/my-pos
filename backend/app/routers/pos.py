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
from app.schemas.sale import SaleCreate, SaleRead, SaleItemRead

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
    """List recent sales for a tenant."""
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
        result.append(
            SaleRead(
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
                    for si in items
                ],
            )
        )
    return result
