from datetime import date

from pydantic import Field

from app.schemas.common import APIModel, DateRangeOut


class PerformanceRowIn(APIModel):
    date: date
    impressions: int = Field(default=0, ge=0)
    clicks: int = Field(default=0, ge=0)
    spend: int = Field(default=0, ge=0, description="Minor units (cents)")
    conversions: int = Field(default=0, ge=0)
    sales: int = Field(default=0, ge=0, description="Minor units (cents)")


class PerformanceRowOut(PerformanceRowIn):
    pass


class PerformanceUpsertIn(APIModel):
    rows: list[PerformanceRowIn] = Field(min_length=1, max_length=5000)


class PerformanceOut(APIModel):
    campaign_id: str
    range: DateRangeOut | None = None
    rows: list[PerformanceRowOut]


class MetricsOut(APIModel):
    impressions: int
    clicks: int
    spend: int
    conversions: int
    sales: int
    ctr: float
    cpc: float
    cvr: float
    roas: float
    acos: float
    days: int
