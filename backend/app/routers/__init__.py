from app.routers.products import router as products_router
from app.routers.pos import router as pos_router
from app.routers.analytics import router as analytics_router
from app.routers.ai import router as ai_router

__all__ = ["products_router", "pos_router", "analytics_router", "ai_router"]
