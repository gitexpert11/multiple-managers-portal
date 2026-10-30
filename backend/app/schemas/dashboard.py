from datetime import date

from app.schemas.common import APIModel, DateRangeOut
from app.schemas.performance import MetricsOut


class DatasetCounts(APIModel):
    sample: int
    dummy: int


class DashboardSummaryOut(APIModel):
    range: DateRangeOut
    previous_range: DateRangeOut
    totals: MetricsOut
    previous: MetricsOut
    campaign_count: int
    archived_count: int
    total_campaigns: int
    datasets: DatasetCounts


class SeriesPointOut(MetricsOut):
    date: date


class DashboardSeriesOut(APIModel):
    range: DateRangeOut
    points: list[SeriesPointOut]
