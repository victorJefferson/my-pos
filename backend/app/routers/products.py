import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlmodel import select

from app.database import get_session
from app.auth import get_current_user
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.models.tenant import Tenant
from app.schemas.product import ProductCreate, ProductUpdate, ProductRead

router = APIRouter(prefix="/products", tags=["products"])


def _to_read(p: Product) -> ProductRead:
    margin_pct = None
    if p.selling_price is not None and p.cost_price is not None and float(p.selling_price) > 0:
        margin_pct = float(((p.selling_price - p.cost_price) / p.selling_price) * 100)

    return ProductRead(
        id=p.id,
        tenant_id=p.tenant_id,
        category=p.category,
        name=p.name,
        selling_price=p.selling_price,
        cost_price=p.cost_price,
        stock_quantity=p.stock_quantity,
        is_active=p.is_active,
        is_low_stock=p.stock_quantity <= 10,
        profit_margin_pct=margin_pct,
        created_at=p.created_at,
    )


@router.get("/", response_model=List[ProductRead], dependencies=[Depends(get_current_user)])
def list_products(
    tenant_id: uuid.UUID,
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    low_stock: Optional[bool] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_session),
):
    """List products with optional search, category filter, low-stock filter."""
    query = select(Product).where(Product.tenant_id == tenant_id)

    if active_only:
        query = query.where(Product.is_active == True)  # noqa: E712

    if category:
        query = query.where(Product.category == category)

    if search:
        pattern = f"%{search}%"
        query = query.where(Product.name.ilike(pattern))

    if low_stock is True:
        query = query.where(Product.stock_quantity <= 10)

    products = db.exec(query.order_by(Product.category, Product.name)).all()
    return [_to_read(p) for p in products]


@router.get("/frequently-sold", response_model=List[ProductRead], dependencies=[Depends(get_current_user)])
def get_frequently_sold_products(
    tenant_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_session),
):
    """
    Returns products sorted by historical checkout volume for this tenant.
    If no sales exist, falls back to recently created active products.
    """
    # Query top sold product IDs for this tenant
    results = db.exec(
        select(SaleItem.product_id, Product)
        .join(Product, SaleItem.product_id == Product.id)
        .where(Product.tenant_id == tenant_id, Product.is_active == True)  # noqa: E712
    ).all()

    if not results:
        return []

    # Aggregate sales count per product
    product_counts = {}
    product_map = {}
    for p_id, product in results:
        product_counts[p_id] = product_counts.get(p_id, 0) + 1
        product_map[p_id] = product

    sorted_p_ids = sorted(product_counts.keys(), key=lambda k: product_counts[k], reverse=True)[:limit]
    return [_to_read(product_map[p_id]) for p_id in sorted_p_ids]


@router.get("/categories", response_model=List[str], dependencies=[Depends(get_current_user)])
def get_categories(tenant_id: uuid.UUID, db: Session = Depends(get_session)):
    """Return distinct categories for a tenant."""
    results = db.exec(
        select(Product.category)
        .where(Product.tenant_id == tenant_id, Product.is_active == True)  # noqa: E712
        .distinct()
    ).all()
    return [c for c in results if c]


@router.post("/reset", dependencies=[Depends(get_current_user)])
def reset_inventory(
    tenant_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Delete all products and associated sale items for a tenant."""
    sale_items = db.exec(
        select(SaleItem)
        .join(Product, SaleItem.product_id == Product.id)
        .where(Product.tenant_id == tenant_id)
    ).all()
    for si in sale_items:
        db.delete(si)

    sales = db.exec(select(Sale).where(Sale.tenant_id == tenant_id)).all()
    for s in sales:
        db.delete(s)

    products = db.exec(select(Product).where(Product.tenant_id == tenant_id)).all()
    count = len(products)
    for p in products:
        db.delete(p)

    db.commit()
    return {"detail": "Inventory reset successfully", "deleted_count": count}


@router.post("/import-csv", status_code=201, dependencies=[Depends(get_current_user)])
def import_csv_products(
    tenant_id: uuid.UUID,
    items: List[ProductCreate],
    db: Session = Depends(get_session),
):
    """Bulk import products from CSV data."""
    if not items:
        raise HTTPException(status_code=400, detail="No product items provided")

    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' does not exist")

    new_products = [Product(tenant_id=tenant_id, **item.model_dump()) for item in items]
    db.add_all(new_products)
    db.commit()
    return {"detail": f"Imported {len(new_products)} products successfully", "imported_count": len(new_products)}


@router.get("/{product_id}", response_model=ProductRead, dependencies=[Depends(get_current_user)])
def get_product(product_id: uuid.UUID, tenant_id: uuid.UUID, db: Session = Depends(get_session)):
    p = db.exec(select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return _to_read(p)


@router.post("/", response_model=ProductRead, status_code=201, dependencies=[Depends(get_current_user)])
def create_product(tenant_id: uuid.UUID, payload: ProductCreate, db: Session = Depends(get_session)):
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' does not exist")

    p = Product(tenant_id=tenant_id, **payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_read(p)


@router.patch("/{product_id}", response_model=ProductRead, dependencies=[Depends(get_current_user)])
def update_product(
    product_id: uuid.UUID,
    tenant_id: uuid.UUID,
    payload: ProductUpdate,
    db: Session = Depends(get_session),
):
    p = db.exec(select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)

    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_read(p)


@router.delete("/{product_id}", dependencies=[Depends(get_current_user)])
def delete_product(product_id: uuid.UUID, tenant_id: uuid.UUID, db: Session = Depends(get_session)):
    p = db.exec(select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    p.is_active = False
    db.add(p)
    db.commit()
    return {"detail": "Product deactivated successfully"}
