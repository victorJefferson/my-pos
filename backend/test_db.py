from sqlmodel import Session, select
from app.database import engine
from app.models.sale import Sale, SaleItem

with Session(engine) as db:
    sales = db.exec(select(Sale)).all()
    print(f"Total sales: {len(sales)}")
    for sale in sales:
        items = db.exec(select(SaleItem).where(SaleItem.sale_id == sale.id)).all()
        print(f"Sale {sale.invoice_number} (ID: {sale.id}) - total_amount: {sale.total_amount}, items: {len(items)}")
        for item in items:
            print(f"  Item {item.id} - total_price: {item.total_price}")
