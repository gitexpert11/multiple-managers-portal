"""Shared request dependencies: DB session, reporting range and dashboard filters."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domain.constants import CAMPAIGN_TYPE_IDS
from app.domain.dates import DateRange, resolve_range
from app.services.campaigns import CampaignFilters

DB = Annotated[Session, Depends(get_db)]


def reporting_range(
    start: Annotated[date | None, Query(alias="from", description="First day of the period (YYYY-MM-DD). Defaults to 29 days before 'to'.")] = None,
    end: Annotated[date | None, Query(alias="to", description="Last day of the period (YYYY-MM-DD). Defaults to today (UTC).")] = None,
) -> DateRange:
    return resolve_range(start, end)


def campaign_filters(
    status: Annotated[str, Query(description="all (= active + paused) | active | paused | archived")] = "all",
    type: Annotated[str | None, Query(description=f"One of: {', '.join(CAMPAIGN_TYPE_IDS)}")] = None,
    q: Annotated[str | None, Query(max_length=200, description="Matches campaign name, product name or SKU")] = None,
) -> CampaignFilters:
    return CampaignFilters(status=status, type=type or None, q=q or None)


Range = Annotated[DateRange, Depends(reporting_range)]
Filters = Annotated[CampaignFilters, Depends(campaign_filters)]
