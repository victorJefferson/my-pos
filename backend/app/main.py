import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Import models so SQLModel registers them before create_all
from app.models import Tenant, User, Product, Sale, SaleItem, Expense  # noqa: F401
from app.database import create_db_and_tables
from app.routers.products import router as products_router
from app.routers.pos import router as pos_router
from app.routers.analytics import router as analytics_router
from app.routers.ai import router as ai_router
from app.routers.auth import router as auth_router
from app.routers.expenses import router as expenses_router

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

app = FastAPI(
    title="Relax Corner POS API",
    description="Multi-tenant Retail POS & Management System API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers under /api/v1
API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)       # /api/v1/auth/me
app.include_router(products_router, prefix=API_PREFIX)
app.include_router(pos_router, prefix=API_PREFIX)
app.include_router(analytics_router, prefix=API_PREFIX)
app.include_router(ai_router, prefix=API_PREFIX)
app.include_router(expenses_router, prefix=API_PREFIX)


@app.on_event("startup")
def on_startup():
    """Create database tables on startup if they don't exist."""
    create_db_and_tables()


@app.get("/")
def root():
    return {
        "app": "Relax Corner POS",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}
