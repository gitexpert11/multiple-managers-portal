from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DB
from app.schemas.product import ProductListOut
from app.services import products as svc

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=ProductListOut, summary="Searchable product catalogue for the picker")
def list_products(
    db: DB,
    q: Annotated[str | None, Query(max_length=200, description="Matches name, SKU or category")] = None,
    category: Annotated[str | None, Query(max_length=100)] = None,
) -> ProductListOut:
    return svc.list_products(db, q=q, category=category)


@router.get("/categories", response_model=list[str])
def categories(db: DB) -> list[str]:
    return svc.categories(db)
