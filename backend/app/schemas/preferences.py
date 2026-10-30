from pydantic import field_validator

from app.domain.constants import CURRENCY_CODES
from app.schemas.common import APIModel


class PreferencesOut(APIModel):
    currency: str


class PreferencesUpdate(APIModel):
    currency: str | None = None

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().upper()
        if v not in CURRENCY_CODES:
            raise ValueError(f"Unsupported currency '{v}'")
        return v
