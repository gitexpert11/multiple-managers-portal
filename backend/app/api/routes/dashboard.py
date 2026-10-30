from fastapi import APIRouter

from app.api.deps import DB, Filters, Range
from app.schemas.dashboard import DashboardSeriesOut, DashboardSummaryOut
from app.services import dashboard as svc

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummaryOut, summary="Period totals vs the previous period, plus counts")
def summary(db: DB, rng: Range, filters: Filters) -> DashboardSummaryOut:
    return svc.summary(db, filters, rng)


@router.get("/series", response_model=DashboardSeriesOut, summary="One point per day of the period")
def series(db: DB, rng: Range, filters: Filters) -> DashboardSeriesOut:
    return svc.series(db, filters, rng)
