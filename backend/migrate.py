"""Idempotent schema migrations for the connected DATABASE_URL.

Safe on prod for existing data: new columns are nullable; unique invoice index
is skipped if duplicates already exist.
"""

from sqlmodel import SQLModel, Session
from sqlalchemy import text
from app.database import engine
import app.main  # noqa: F401 — register all models


def run(stmt: str, session: Session) -> None:
    try:
        session.exec(text(stmt))
        session.commit()
        print("OK:", stmt.strip().split("\n")[0][:90])
    except Exception as e:
        session.rollback()
        print("Skip/error:", e)


# 1. Create missing tables (e.g. sync_idempotency) — does not drop/alter existing
SQLModel.metadata.create_all(engine)
print("create_all done")

# 2. expenses.account_id
with Session(engine) as session:
    run(
        "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);",
        session,
    )
    run(
        "CREATE INDEX IF NOT EXISTS ix_expenses_account_id ON expenses (account_id);",
        session,
    )

# 3. transactiontype enum
with Session(engine) as session:
    try:
        session.exec(text("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'DEPOSIT';"))
        session.commit()
        print("OK: transactiontype DEPOSIT")
    except Exception as e:
        session.rollback()
        print("Skip/error enum:", e)

# 4. Offline sync columns / indexes
with Session(engine) as session:
    run("ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_sale_id UUID;", session)
    run("CREATE INDEX IF NOT EXISTS ix_sales_client_sale_id ON sales (client_sale_id);", session)
    run(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_client_sale_id
        ON sales (tenant_id, client_sale_id)
        WHERE client_sale_id IS NOT NULL;
        """,
        session,
    )

    # Unique invoice only if data is clean — never fail the whole migrate on this
    dupes = session.exec(
        text(
            """
            SELECT tenant_id::text, invoice_number, COUNT(*) AS c
            FROM sales
            GROUP BY tenant_id, invoice_number
            HAVING COUNT(*) > 1
            LIMIT 5
            """
        )
    ).all()
    if dupes:
        print("SKIP uq_sales_tenant_invoice — duplicate invoices found (sample):", dupes)
    else:
        run(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_invoice
            ON sales (tenant_id, invoice_number);
            """,
            session,
        )

print("Migration finished.")
