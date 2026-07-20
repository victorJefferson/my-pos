"""
seed.py — Seed the Relax Corner database with initial data.

Usage:
    cd backend
    python seed.py

This script:
1. Creates the default "Relax Corner" tenant
2. Creates a default ADMIN user (PIN: 1234)
3. Creates a default CASHIER user (PIN: 0000)
4. Reads ../populated_inventory.csv and seeds all products
"""

import os
import sys
import uuid
import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Ensure app is importable
sys.path.insert(0, str(Path(__file__).parent))

from sqlmodel import Session, select
from app.database import engine, create_db_and_tables
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.product import Product

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    _USE_PASSLIB = True
except Exception:
    _USE_PASSLIB = False

def _hash_pin(pin: str) -> str:
    """Hash a PIN — falls back to plain text since auth is now handled by Clerk."""
    if _USE_PASSLIB:
        try:
            return pwd_context.hash(pin)
        except Exception:
            pass
    return pin  # Clerk handles real auth; this is just a placeholder


TENANT_NAME = os.getenv("DEFAULT_TENANT_NAME", "Relax Corner")
CSV_PATH = Path(__file__).parent.parent / "populated_inventory.csv"


def safe_decimal(val: str) -> Decimal | None:
    try:
        stripped = val.strip()
        if not stripped:
            return None
        return Decimal(stripped)
    except InvalidOperation:
        return None


def seed():
    print("🌱 Starting database seed for Relax Corner POS...\n")

    # Ensure tables exist
    create_db_and_tables()

    with Session(engine) as db:
        # --- 1. Create / find Tenant ---
        existing_tenant = db.exec(
            select(Tenant).where(Tenant.store_name == TENANT_NAME)
        ).first()

        if existing_tenant:
            tenant = existing_tenant
            print(f"✅ Tenant already exists: {tenant.store_name} ({tenant.id})")
        else:
            tenant = Tenant(store_name=TENANT_NAME)
            db.add(tenant)
            db.commit()
            db.refresh(tenant)
            print(f"✅ Created tenant: {tenant.store_name} ({tenant.id})")

        # --- 2. Create Admin user ---
        existing_admin = db.exec(
            select(User).where(User.tenant_id == tenant.id, User.role == UserRole.ADMIN)
        ).first()

        if not existing_admin:
            admin = User(
                tenant_id=tenant.id,
                name="Store Owner",
                role=UserRole.ADMIN,
                pin_code=_hash_pin("1234"),
            )
            db.add(admin)
            print("✅ Created ADMIN user — PIN: 1234")
        else:
            print("✅ ADMIN user already exists")

        # --- 3. Create Cashier user ---
        existing_cashier = db.exec(
            select(User).where(User.tenant_id == tenant.id, User.role == UserRole.CASHIER)
        ).first()

        if not existing_cashier:
            cashier = User(
                tenant_id=tenant.id,
                name="Cashier 1",
                role=UserRole.CASHIER,
                pin_code=_hash_pin("0000"),
            )
            db.add(cashier)
            print("✅ Created CASHIER user — PIN: 0000")
        else:
            print("✅ CASHIER user already exists")

        db.commit()

        # --- 4. Seed Products from CSV ---
        if not CSV_PATH.exists():
            print(f"\n⚠️  CSV not found at {CSV_PATH}. Skipping product seed.")
            return

        existing_products = db.exec(
            select(Product).where(Product.tenant_id == tenant.id)
        ).all()
        existing_names = {p.name.lower() for p in existing_products}

        products_added = 0
        with open(CSV_PATH, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("Item Name", "").strip()
                if not name or name.lower() in existing_names:
                    continue

                product = Product(
                    tenant_id=tenant.id,
                    category=row.get("Category", "Misc").strip(),
                    name=name,
                    selling_price=safe_decimal(row.get("Selling Price", "")),
                    cost_price=safe_decimal(row.get("Cost Price", "")),
                    stock_quantity=int(row.get("Stock Quantity", 0) or 0),
                )
                db.add(product)
                products_added += 1

        db.commit()
        print(f"✅ Added {products_added} products from CSV")

        # Print tenant ID for .env setup
        print(f"\n{'='*50}")
        print(f"🎉 Seed complete!")
        print(f"   Tenant ID: {tenant.id}")
        print(f"   Store Name: {tenant.store_name}")
        print(f"   Admin PIN: 1234")
        print(f"   Cashier PIN: 0000")
        print(f"\n   ⚙️  Set this in your frontend .env:")
        print(f"   VITE_TENANT_ID={tenant.id}")
        print(f"{'='*50}\n")


if __name__ == "__main__":
    seed()
