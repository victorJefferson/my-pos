import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from app.database import engine
from sqlmodel import SQLModel
from app.models.tenant import Tenant
from app.models.user import User
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.models.expense import Expense

print("Dropping all tables...")
SQLModel.metadata.drop_all(engine)
print("Recreating tables...")
SQLModel.metadata.create_all(engine)
print("Done!")
