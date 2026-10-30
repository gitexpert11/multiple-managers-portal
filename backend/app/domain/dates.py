"""Calendar helpers. Dates are plain ``datetime.date`` values; ranges are inclusive."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from app.core.exceptions import DomainError
from app.domain.constants import DEFAULT_RANGE_DAYS, MAX_RANGE_DAYS


def utc_now() -> datetime:
    """Naive UTC timestamp (SQLite has no timezone support; everything is stored as UTC)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_today() -> date:
    return utc_now().date()


@dataclass(frozen=True)
class DateRange:
    start: date
    end: date

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    def previous(self) -> DateRange:
        """The same-length window immediately before this one (for "vs previous period")."""
        end = self.start - timedelta(days=1)
        return DateRange(end - timedelta(days=self.days - 1), end)

    def each_day(self):
        for i in range(self.days):
            yield self.start + timedelta(days=i)


def resolve_range(start: date | None, end: date | None, *, today: date | None = None) -> DateRange:
    """Validate a reporting range; defaults to the last DEFAULT_RANGE_DAYS days ending today."""
    today = today or utc_today()
    if end is None:
        end = today if start is None else min(today, start + timedelta(days=DEFAULT_RANGE_DAYS - 1))
    if start is None:
        start = end - timedelta(days=DEFAULT_RANGE_DAYS - 1)
    if start > end:
        raise DomainError("'from' must not be after 'to'")
    rng = DateRange(start, end)
    if rng.days > MAX_RANGE_DAYS:
        raise DomainError(f"Range is too long (max {MAX_RANGE_DAYS} days)")
    return rng
