import os
from sqlmodel import SQLModel, Session
from sqlalchemy import text
from app.database import engine, create_db_and_tables
import app.main  # this imports all models


# 1. Create new tables
SQLModel.metadata.create_all(engine)

# 2. Alter expenses table
with Session(engine) as session:
    try:
        session.exec(text("ALTER TABLE expenses ADD COLUMN account_id UUID REFERENCES accounts(id);"))
        session.exec(text("CREATE INDEX ix_expenses_account_id ON expenses (account_id);"))
        session.commit()
        print("Migrated expenses successfully")
    except Exception as e:
        print("Alter already applied or error:", e)

# 3. Alter transactiontype enum
with Session(engine) as session:
    try:
        session.commit()
        session.exec(text("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'DEPOSIT';"))
        session.commit()
        print("Migrated transactiontype enum successfully")
    except Exception as e:
        print("Enum already updated or error:", e)

# 4. Offline sync: client_sale_id + unique constraints + sync_idempotency
with Session(engine) as session:
    statements = [
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_sale_id UUID;",
        "CREATE INDEX IF NOT EXISTS ix_sales_client_sale_id ON sales (client_sale_id);",
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_client_sale_id
        ON sales (tenant_id, client_sale_id)
        WHERE client_sale_id IS NOT NULL;
        """,
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_invoice
        ON sales (tenant_id, invoice_number);
        """,
    ]
    for stmt in statements:
        try:
            session.exec(text(stmt))
            session.commit()
            print("OK:", stmt.strip().split("\n")[0][:80])
        except Exception as e:
            session.rollback()
            print("Skip/error:", e)
