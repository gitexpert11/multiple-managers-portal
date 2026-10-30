from fastapi import APIRouter

from app.api.deps import DB
from app.schemas.preferences import PreferencesOut, PreferencesUpdate
from app.services import preferences as svc

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("", response_model=PreferencesOut)
def get_preferences(db: DB) -> PreferencesOut:
    return svc.get_preferences(db)


@router.patch("", response_model=PreferencesOut, summary="Change the display currency")
def update_preferences(db: DB, patch: PreferencesUpdate) -> PreferencesOut:
    return svc.update_preferences(db, patch)
