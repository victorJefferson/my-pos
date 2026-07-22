import os
from sqlmodel import SQLModel, Session
from sqlalchemy import text
from app.database import engine, create_db_and_tables
import app.main # this imports all models


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
        # Commit any existing transaction block first because ALTER TYPE cannot run inside a transaction block
        session.commit()
        session.exec(text("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'DEPOSIT';"))
        session.commit()
        print("Migrated transactiontype enum successfully")
    except Exception as e:
        print("Enum already updated or error:", e)
