"""Campaign performance maths.

Each campaign carries daily performance rows with five base counters
(impressions, clicks, spend, conversions, sales). Everything else (CTR, CPC,
ROAS, ...) is derived from *sums* of those counters, so derived metrics are
always ratio-of-sums and never an average of daily ratios.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.constants import BASE_METRICS


def _div(a: float, b: float) -> float:
    return a / b if b > 0 else 0.0


@dataclass
class Totals:
    impressions: int = 0
    clicks: int = 0
    spend: int = 0
    conversions: int = 0
    sales: int = 0
    days: int = 0

    def add(self, other: Totals) -> None:
        for key in BASE_METRICS:
            setattr(self, key, getattr(self, key) + getattr(other, key))
        self.days += other.days


@dataclass
class Metrics(Totals):
    ctr: float = 0.0
    cpc: float = 0.0
    cvr: float = 0.0
    roas: float = 0.0
    acos: float = 0.0
    _derived: bool = field(default=False, repr=False)

    @classmethod
    def from_totals(cls, t: Totals) -> Metrics:
        return cls(
            impressions=t.impressions,
            clicks=t.clicks,
            spend=t.spend,
            conversions=t.conversions,
            sales=t.sales,
            days=t.days,
            ctr=_div(t.clicks, t.impressions),
            cpc=_div(t.spend, t.clicks),
            cvr=_div(t.conversions, t.clicks),
            roas=_div(t.sales, t.spend),
            acos=_div(t.spend, t.sales),
        )

    def value(self, metric_id: str) -> float:
        return float(getattr(self, metric_id))


def derive(totals: Totals) -> Metrics:
    return Metrics.from_totals(totals)
