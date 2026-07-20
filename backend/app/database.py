import os
from sqlalchemy import create_engine
from sqlmodel import SQLModel, Session
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set. Copy .env.example to .env and fill in your Neon DB URL.")

# Sync engine - works on Vercel serverless and local dev
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,        # validate connections before use
    pool_recycle=300,           # recycle connections every 5 minutes
    pool_size=5,
    max_overflow=10,
    connect_args={"sslmode": "require"} if "neon.tech" in DATABASE_URL else {},
)


def get_session():
    """FastAPI dependency that provides a SQLModel Session."""
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    """Create all tables defined via SQLModel metadata."""
    SQLModel.metadata.create_all(engine)
