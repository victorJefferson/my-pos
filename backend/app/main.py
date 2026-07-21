import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Import models so SQLModel registers them before create_all
from app.models import Tenant, User, Product, Sale, SaleItem, Expense  # noqa: F401
from app.models.embeddings import ProductEmbedding  # noqa: F401
from app.database import create_db_and_tables
from app.routers.products import router as products_router
from app.routers.pos import router as pos_router
from app.routers.analytics import router as analytics_router
from app.routers.ai import router as ai_router
from app.routers.auth import router as auth_router
from app.routers.expenses import router as expenses_router
from app.routers.ml import router as ml_router

app = FastAPI(
    title="Relax Corner POS API",
    description="Multi-tenant Retail POS & Management System API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
configured_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

# If wildcard is present, allow all origins
if "*" in configured_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=configured_origins,
        allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:\d+",
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
app.include_router(ml_router, prefix=API_PREFIX)


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
