"""Ads Campaign Management API.

Run locally with ``uvicorn app.main:app --reload``; interactive docs at /docs.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import install_exception_handlers
from app.db import models  # noqa: F401  (register models with Base.metadata)
from app.db.base import Base
from app.db.session import get_engine
from app.services.products import seed_catalogue


def init_db(engine: Engine | None = None) -> None:
    """Create tables and seed the product catalogue. Idempotent."""
    engine = engine or get_engine()
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        seed_catalogue(db)
        db.commit()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if settings.auto_migrate:
            init_db()
        yield

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Backend for the Ads Campaign Management tab: campaigns, products, daily performance and dashboard aggregates.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {"name": settings.app_name, "docs": "/docs", "api": settings.api_prefix}

    return app


app = create_app()
