from datetime import date, datetime, timezone
from typing import Literal

from pydantic import Field, field_serializer, field_validator, model_validator

from app.domain.constants import (
    AVAILABLE_BID_STRATEGIES,
    BID_STRATEGY_IDS,
    CAMPAIGN_TYPE_IDS,
    MAX_DAILY_BUDGET,
    MAX_PRODUCTS,
    MIN_DAILY_BUDGET,
    NAME_MAX,
    STATUS_IDS,
)
from app.schemas.common import APIModel, DateRangeOut
from app.schemas.performance import MetricsOut
from app.schemas.product import ProductSnapshot

CampaignTypeId = Literal["sponsored_products", "sponsored_brands", "sponsored_display"]
StatusId = Literal["active", "paused", "archived"]
BidStrategyId = Literal["auto", "manual"]
SourceId = Literal["user", "sample", "dummy"]

assert set(CampaignTypeId.__args__) == set(CAMPAIGN_TYPE_IDS)
assert set(StatusId.__args__) == set(STATUS_IDS)
assert set(BidStrategyId.__args__) == set(BID_STRATEGY_IDS)


def _clean_name(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        if not value:
            raise ValueError("Campaign name is required")
    return value


def _check_budget(value: int) -> int:
    if value < MIN_DAILY_BUDGET:
        raise ValueError("Daily budget must be at least $1.00")
    if value > MAX_DAILY_BUDGET:
        raise ValueError("Daily budget is too large")
    return value


def _check_bid(value: str) -> str:
    if value not in AVAILABLE_BID_STRATEGIES:
        raise ValueError("That bid strategy is not available yet")
    return value


def _dedupe_products(products: list[ProductSnapshot]) -> list[ProductSnapshot]:
    seen: set[str] = set()
    out: list[ProductSnapshot] = []
    for p in products:
        if p.id in seen:
            continue
        seen.add(p.id)
        out.append(p.normalised())
    if not out:
        raise ValueError("Add at least one product")
    return out[:MAX_PRODUCTS]


class CampaignCreate(APIModel):
    name: str = Field(max_length=NAME_MAX)
    daily_budget: int = Field(description="Minor units (cents)")
    type: CampaignTypeId
    bid_strategy: BidStrategyId = "auto"
    products: list[ProductSnapshot]
    status: StatusId = "active"
    start_date: date | None = Field(default=None, description="Defaults to today")
    end_date: date | None = None

    _name = field_validator("name")(_clean_name)
    _budget = field_validator("daily_budget")(_check_budget)
    _bid = field_validator("bid_strategy")(_check_bid)
    _products = field_validator("products")(_dedupe_products)

    @model_validator(mode="after")
    def _dates(self) -> "CampaignCreate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("End date cannot be before the start date")
        return self


class CampaignUpdate(APIModel):
    """PATCH body. Only the fields present are changed; ``endDate: null`` clears the end date."""

    name: str | None = Field(default=None, max_length=NAME_MAX)
    daily_budget: int | None = None
    type: CampaignTypeId | None = Field(default=None, description="Must match the existing type: a campaign's type cannot change")
    bid_strategy: BidStrategyId | None = None
    products: list[ProductSnapshot] | None = None
    status: StatusId | None = None
    end_date: date | None = None

    _name = field_validator("name")(_clean_name)

    @field_validator("daily_budget")
    @classmethod
    def _budget(cls, v: int | None) -> int | None:
        return None if v is None else _check_budget(v)

    @field_validator("bid_strategy")
    @classmethod
    def _bid(cls, v: str | None) -> str | None:
        return None if v is None else _check_bid(v)

    @field_validator("products")
    @classmethod
    def _products(cls, v: list[ProductSnapshot] | None) -> list[ProductSnapshot] | None:
        return None if v is None else _dedupe_products(v)


class DuplicateIn(APIModel):
    start_date: date | None = Field(default=None, description="Defaults to today")


class CampaignOut(APIModel):
    id: str
    name: str
    daily_budget: int
    type: CampaignTypeId
    bid_strategy: BidStrategyId
    status: StatusId
    start_date: date
    end_date: date | None
    products: list[ProductSnapshot]
    source: SourceId
    performance_days: int = Field(description="How many days of performance the campaign has in total")
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def _as_utc(self, value: datetime) -> str:
        # Stored naive in UTC; say so on the wire so clients parse it correctly.
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


class CampaignWithMetricsOut(CampaignOut):
    metrics: MetricsOut


class PageAggregatesOut(APIModel):
    """Sums over *every* filtered campaign (not just the current page), for the grid footer."""

    campaigns: int
    products: int
    daily_budget: int


class CampaignPageOut(APIModel):
    items: list[CampaignWithMetricsOut]
    page: int
    page_size: int
    page_count: int
    total: int
    range: DateRangeOut
    sort: str
    dir: Literal["asc", "desc"]
    aggregates: PageAggregatesOut
