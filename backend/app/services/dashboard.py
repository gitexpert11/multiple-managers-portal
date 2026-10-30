"""Dashboard aggregates: period totals (with the previous period for deltas) and the daily series."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Campaign, PerformanceRow
from app.domain.constants import ARCHIVED, SOURCE_DUMMY, SOURCE_SAMPLE
from app.domain.dates import DateRange
from app.domain.metrics import Totals, derive
from app.schemas.dashboard import DashboardSeriesOut, DashboardSummaryOut, DatasetCounts, SeriesPointOut
from app.services.campaigns import CampaignFilters, count_by_source, filtered_campaigns, metrics_out, range_out


def _filtered_ids(filters: CampaignFilters):
    return filtered_campaigns(filters).with_only_columns(Campaign.id).scalar_subquery()


def totals_for(db: Session, filters: CampaignFilters, rng: DateRange) -> Totals:
    stmt = select(
        func.coalesce(func.sum(PerformanceRow.impressions), 0),
        func.coalesce(func.sum(PerformanceRow.clicks), 0),
        func.coalesce(func.sum(PerformanceRow.spend), 0),
        func.coalesce(func.sum(PerformanceRow.conversions), 0),
        func.coalesce(func.sum(PerformanceRow.sales), 0),
        func.count(),
    ).where(PerformanceRow.campaign_id.in_(_filtered_ids(filters)), PerformanceRow.date.between(rng.start, rng.end))
    row = db.execute(stmt).one()
    return Totals(*(int(v) for v in row))


def summary(db: Session, filters: CampaignFilters, rng: DateRange) -> DashboardSummaryOut:
    previous = rng.previous()
    campaign_count = int(db.scalar(select(func.count()).select_from(filtered_campaigns(filters).subquery())) or 0)
    live = select(func.count()).select_from(Campaign).where(Campaign.deleted_at.is_(None))
    archived_count = int(db.scalar(live.where(Campaign.status == ARCHIVED)) or 0)
    total_campaigns = int(db.scalar(live) or 0)
    return DashboardSummaryOut(
        range=range_out(rng),
        previous_range=range_out(previous),
        totals=metrics_out(derive(totals_for(db, filters, rng))),
        previous=metrics_out(derive(totals_for(db, filters, previous))),
        campaign_count=campaign_count,
        archived_count=archived_count,
        total_campaigns=total_campaigns,
        datasets=DatasetCounts(sample=count_by_source(db, SOURCE_SAMPLE), dummy=count_by_source(db, SOURCE_DUMMY)),
    )


def series(db: Session, filters: CampaignFilters, rng: DateRange) -> DashboardSeriesOut:
    """One point per day of the range (zero-filled where nothing was served),
    summed across the filtered campaigns, with derived metrics per day."""
    stmt = (
        select(
            PerformanceRow.date,
            func.coalesce(func.sum(PerformanceRow.impressions), 0),
            func.coalesce(func.sum(PerformanceRow.clicks), 0),
            func.coalesce(func.sum(PerformanceRow.spend), 0),
            func.coalesce(func.sum(PerformanceRow.conversions), 0),
            func.coalesce(func.sum(PerformanceRow.sales), 0),
            func.count(),
        )
        .where(PerformanceRow.campaign_id.in_(_filtered_ids(filters)), PerformanceRow.date.between(rng.start, rng.end))
        .group_by(PerformanceRow.date)
    )
    by_date = {row[0]: Totals(*(int(v) for v in row[1:])) for row in db.execute(stmt)}
    points = []
    for day in rng.each_day():
        m = derive(by_date.get(day, Totals()))
        points.append(SeriesPointOut(date=day, **metrics_out(m).model_dump(by_alias=False)))
    return DashboardSeriesOut(range=range_out(rng), points=points)
