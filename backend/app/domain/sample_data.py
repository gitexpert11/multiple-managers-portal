"""Deterministic sample ("mock") and placeholder ("dummy") campaign generators.

Both return plain dicts shaped like ``CampaignCreate`` plus ``performance`` rows and
timestamps, ready for ``services.campaigns.insert_generated``. The output only
depends on ``today`` (and the seed), so loading the same dataset twice is idempotent.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from app.domain.catalogue import snapshot
from app.domain.constants import CAMPAIGN_TYPE_IDS, SOURCE_DUMMY, SOURCE_SAMPLE
from app.domain.prng import mulberry32

# --------------------------------------------------------------------------- sample

DEFAULT_SAMPLE_DAYS = 90

_TEMPLATES = (
    # name, type, budget, products, age, paused_since, ends_in, profile
    ("Headphones — Brand Search", "sponsored_products", 7500, ["SKU-1001", "SKU-1002"], 400, None, None, dict(ctr=0.01, cvr=0.08, aov=14500, cpm=2400, util=0.92, trend=0.15)),
    ("Smart Watch Launch", "sponsored_products", 12000, ["SKU-1004", "SKU-1003"], 45, None, 30, dict(ctr=0.008, cvr=0.06, aov=18900, cpm=2600, util=0.97, trend=0.6)),
    ("Kitchen Essentials — Spring", "sponsored_brands", 5000, ["SKU-2001", "SKU-2002", "SKU-2003"], 400, None, 75, dict(ctr=0.007, cvr=0.08, aov=4200, cpm=900, util=0.85, trend=-0.1)),
    ("Robot Vacuum — Display Retargeting", "sponsored_display", 4000, ["SKU-2004"], 400, None, None, dict(ctr=0.003, cvr=0.04, aov=24900, cpm=600, util=0.8, trend=0.05)),
    ("Skincare Bestsellers", "sponsored_products", 3500, ["SKU-3001", "SKU-3002", "SKU-3003"], 400, None, None, dict(ctr=0.014, cvr=0.12, aov=2900, cpm=700, util=0.9, trend=0.2)),
    ("Home Gym — Q1 Push", "sponsored_brands", 6000, ["SKU-4001", "SKU-4002", "SKU-4003"], 400, 12, None, dict(ctr=0.007, cvr=0.05, aov=7800, cpm=1200, util=0.88, trend=-0.3)),
    ("Toys — Holiday Gifting", "sponsored_display", 2500, ["SKU-5001", "SKU-5002", "SKU-5003"], 400, 40, -40, dict(ctr=0.005, cvr=0.07, aov=3500, cpm=400, util=0.75, trend=0)),
    ("Coffee & Pantry Staples", "sponsored_products", 2000, ["SKU-6001", "SKU-6002", "SKU-6003"], 5, None, None, dict(ctr=0.011, cvr=0.1, aov=2600, cpm=600, util=0.7, trend=0.8)),
)


def _daily_row(rand, day: date, budget: int, profile: dict, progress: float) -> dict:
    weekend = 0.8 if day.weekday() >= 5 else 1.0
    trend = 1 + profile["trend"] * progress
    noise = 0.85 + rand() * 0.3
    spend = round(budget * profile["util"] * weekend * min(1.05, trend) * noise)
    impressions = round((spend / profile["cpm"]) * 1000 * (0.9 + rand() * 0.2))
    clicks = round(impressions * profile["ctr"] * (0.85 + rand() * 0.3))
    conversions = round(clicks * profile["cvr"] * (0.7 + rand() * 0.6) * trend)
    sales = round(conversions * profile["aov"] * (0.9 + rand() * 0.2))
    return {"date": day, "impressions": impressions, "clicks": clicks, "spend": spend, "conversions": conversions, "sales": sales}


def generate_sample_campaigns(today: date, *, days: int = DEFAULT_SAMPLE_DAYS, seed: int = 20240101) -> list[dict]:
    if days < 1:
        raise ValueError("days must be a positive integer")
    rand = mulberry32(seed)
    today_dt = datetime(today.year, today.month, today.day)
    out: list[dict] = []
    for i, (name, type_, budget, products, age_days, paused_since, ends_in, profile) in enumerate(_TEMPLATES):
        age = min(age_days, days - 1)
        start = today - timedelta(days=age)
        last_served = today - timedelta(days=paused_since) if paused_since else today
        served_days = (last_served - start).days + 1
        performance = [
            _daily_row(rand, start + timedelta(days=d), budget, profile, d / max(1, served_days - 1)) for d in range(served_days)
        ]
        created_at = today_dt - timedelta(days=age) + timedelta(hours=9, microseconds=i)
        out.append(
            {
                "id": f"mock_{i + 1:04d}",
                "name": name,
                "daily_budget": budget,
                "type": type_,
                "bid_strategy": "auto",
                "products": [snapshot(p) for p in products],
                "status": "paused" if paused_since else "active",
                "start_date": start,
                "end_date": None if ends_in is None else today + timedelta(days=ends_in),
                "performance": performance,
                "source": SOURCE_SAMPLE,
                "created_at": created_at,
                "updated_at": today_dt - timedelta(days=paused_since) if paused_since else created_at,
            }
        )
    return out


# --------------------------------------------------------------------------- dummy

DEFAULT_DUMMY_COUNT = 96
DUMMY_PRODUCT_COUNT = 24
DUMMY_CATEGORY_COUNT = 6
DUMMY_MAX_DAYS = 30


def dummy_product(index: int) -> dict:
    n = ((index - 1) % DUMMY_PRODUCT_COUNT) + 1
    return {
        "id": f"DUMMY-{n:04d}",
        "sku": f"DUMMY-{n:04d}",
        "name": f"Dummy Product {n}",
        "category": f"Dummy Category {((n - 1) % DUMMY_CATEGORY_COUNT) + 1}",
        "price": 999 + (n - 1) * 500,
    }


def _dummy_row(day: date, n: int, day_index: int) -> dict:
    impressions = (500 + 250 * (n % 7)) * ((n % 10) + 1) + 100 * day_index
    clicks = 10 * ((n % 10) + 1) + day_index
    spend = 250 * ((n % 12) + 1) + 25 * day_index
    conversions = (n % 5) + (day_index % 3)
    return {"date": day, "impressions": impressions, "clicks": clicks, "spend": spend, "conversions": conversions, "sales": conversions * 2500}


def generate_dummy_campaigns(today: date, *, count: int = DEFAULT_DUMMY_COUNT) -> list[dict]:
    if count < 1:
        raise ValueError("count must be a positive integer")
    out: list[dict] = []
    for i in range(count):
        n = i + 1
        status = "archived" if n % 13 == 0 else "paused" if n % 8 == 0 else "active"
        days = n % (DUMMY_MAX_DAYS + 1)
        last_served = today if status == "active" else today - timedelta(days=1)
        served = [last_served - timedelta(days=days - 1 - d) for d in range(days)] if days else []
        start = served[0] if served else today - timedelta(days=(n % 7) + 1)
        products = [dummy_product(n + k) for k in range((n % 4) + 1)]
        created_at = datetime(start.year, start.month, start.day, 9) + timedelta(microseconds=n)
        out.append(
            {
                "id": f"dummy_{n:04d}",
                "name": f"Dummy Campaign {n:03d}",
                "daily_budget": ((n % 12) + 1) * 500,
                "type": CAMPAIGN_TYPE_IDS[i % len(CAMPAIGN_TYPE_IDS)],
                "bid_strategy": "auto",
                "products": products,
                "status": status,
                "start_date": start,
                "end_date": today + timedelta(days=(n % 3) * 20 - 10) if n % 5 == 0 else None,
                "performance": [_dummy_row(day, n, d) for d, day in enumerate(served)],
                "source": SOURCE_DUMMY,
                "created_at": created_at,
                "updated_at": created_at,
            }
        )
    return out
