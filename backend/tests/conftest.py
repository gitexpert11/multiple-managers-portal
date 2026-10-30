"""Test fixtures: a fresh in-memory SQLite database per test, wired into the app."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_db, make_engine
from app.main import create_app, init_db


TODAY = date(2025, 3, 15)


@pytest.fixture
def engine():
    eng = make_engine("sqlite://")
    init_db(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db(engine) -> Iterator[Session]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = factory()
    try:
        yield session
        session.commit()
    finally:
        session.close()


@pytest.fixture
def client(engine) -> Iterator[TestClient]:
    app = create_app(Settings(database_url="sqlite://", auto_migrate=False, cors_origins=["http://testserver"]))
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _get_db():
        session = factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c


def campaign_payload(**overrides) -> dict:
    payload = {
        "name": "Spring Sale — Headphones",
        "dailyBudget": 2500,
        "type": "sponsored_products",
        "products": [{"id": "SKU-1001", "sku": "SKU-1001", "name": "Wireless Noise-Cancelling Headphones", "category": "Electronics", "price": 14999}],
        "startDate": TODAY.isoformat(),
    }
    payload.update(overrides)
    return payload


def create_campaign(client: TestClient, **overrides) -> dict:
    response = client.post("/api/v1/campaigns", json=campaign_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def add_performance(client: TestClient, campaign_id: str, rows: list[dict]) -> dict:
    response = client.put(f"/api/v1/campaigns/{campaign_id}/performance", json={"rows": rows})
    assert response.status_code == 200, response.text
    return response.json()
