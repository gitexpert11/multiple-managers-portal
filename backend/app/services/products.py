"""Product catalogue: seeded from the fixed list, searchable for the picker."""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import Product
from app.domain.catalogue import PRODUCT_CATEGORIES, PRODUCTS
from app.schemas.product import ProductListOut, ProductOut


def seed_catalogue(db: Session) -> int:
    """Insert any catalogue product that is missing. Idempotent."""
    existing = set(db.scalars(select(Product.id)))
    added = 0
    for pid, name, category, price, color in PRODUCTS:
        if pid in existing:
            continue
        db.add(Product(id=pid, sku=pid, name=name, category=category, price=price, color=color))
        added += 1
    db.flush()
    return added


def categories(db: Session) -> list[str]:
    found = list(db.scalars(select(Product.category).distinct()))
    # Keep the canonical order for known categories; append any new ones alphabetically.
    known = [c for c in PRODUCT_CATEGORIES if c in found]
    extra = sorted(c for c in found if c not in PRODUCT_CATEGORIES)
    return known + extra


def list_products(db: Session, *, q: str | None = None, category: str | None = None) -> ProductListOut:
    stmt = select(Product)
    if category:
        stmt = stmt.where(Product.category == category)
    query = (q or "").strip().lower()
    if query:
        like = f"%{query}%"
        stmt = stmt.where(or_(func.lower(Product.name).like(like), func.lower(Product.sku).like(like), func.lower(Product.category).like(like)))
    # Catalogue order (the order products were seeded in) is meaningful for the picker.
    order = {pid: i for i, (pid, *_rest) in enumerate(PRODUCTS)}
    items = sorted(db.scalars(stmt), key=lambda p: order.get(p.id, len(order)))
    return ProductListOut(items=[ProductOut.model_validate(p) for p in items], total=len(items), categories=categories(db))
