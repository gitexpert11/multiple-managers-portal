from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import DB

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness + database check")
def health(db: DB) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}
