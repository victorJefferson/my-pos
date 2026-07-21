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
        print("Migrated successfully")
    except Exception as e:
        print("Alter already applied or error:", e)
