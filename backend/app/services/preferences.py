"""Display preferences (currently just the display currency)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import Preference
from app.domain.constants import CURRENCY_CODES, DEFAULT_CURRENCY
from app.schemas.preferences import PreferencesOut, PreferencesUpdate

CURRENCY_KEY = "currency"


def get_preferences(db: Session) -> PreferencesOut:
    row = db.get(Preference, CURRENCY_KEY)
    currency = row.value if row and row.value in CURRENCY_CODES else DEFAULT_CURRENCY
    return PreferencesOut(currency=currency)


def update_preferences(db: Session, patch: PreferencesUpdate) -> PreferencesOut:
    if patch.currency is not None:
        row = db.get(Preference, CURRENCY_KEY)
        if row is None:
            db.add(Preference(key=CURRENCY_KEY, value=patch.currency))
        else:
            row.value = patch.currency
        db.flush()
    return get_preferences(db)
