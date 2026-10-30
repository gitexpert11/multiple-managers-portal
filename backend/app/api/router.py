from fastapi import APIRouter

from app.api.routes import campaigns, dashboard, datasets, health, meta, preferences, products

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(meta.router)
api_router.include_router(campaigns.router)
api_router.include_router(dashboard.router)
api_router.include_router(products.router)
api_router.include_router(datasets.router)
api_router.include_router(preferences.router)
