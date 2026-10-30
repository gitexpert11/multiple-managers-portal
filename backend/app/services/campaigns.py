"""Campaign use-cases: CRUD, lifecycle actions, listing with period metrics, performance ingestion."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import Select, exists, func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError, NotFoundError
from app.db.models import Campaign, CampaignProduct, PerformanceRow
from app.domain.constants import ARCHIVED, MAX_PAGE_SIZE, NAME_MAX, SORT_KEYS, SOURCE_USER, STATUS_IDS, STATUS_ORDER
from app.domain.dates import DateRange, utc_now, utc_today
from app.domain.ids import new_id
from app.domain.metrics import Metrics, Totals, derive
from app.schemas.campaign import CampaignCreate, CampaignOut, CampaignPageOut, CampaignUpdate, CampaignWithMetricsOut, PageAggregatesOut
from app.schemas.common import DateRangeOut
from app.schemas.performance import MetricsOut, PerformanceRowIn
from app.schemas.product import ProductSnapshot

# --------------------------------------------------------------------------- filters


@dataclass(frozen=True)
class CampaignFilters:
    """Dashboard filters. ``status="all"`` means every *live* campaign (active or paused);
    archived campaigns only show up when asked for explicitly."""

    status: str = "all"
    type: str | None = None
    q: str | None = None


def filtered_campaigns(filters: CampaignFilters) -> Select[tuple[Campaign]]:
    stmt = select(Campaign).where(Campaign.deleted_at.is_(None))
    if filters.status == "all":
        stmt = stmt.where(Campaign.status != ARCHIVED)
    elif filters.status in STATUS_IDS:
        stmt = stmt.where(Campaign.status == filters.status)
    else:
        raise DomainError(f"Unknown status filter '{filters.status}'")
    if filters.type:
        stmt = stmt.where(Campaign.type == filters.type)
    q = (filters.q or "").strip().lower()
    if q:
        like = f"%{q}%"
        product_match = exists().where(
            CampaignProduct.campaign_id == Campaign.id,
            or_(func.lower(CampaignProduct.name).like(like), func.lower(CampaignProduct.sku).like(like)),
        )
        stmt = stmt.where(or_(func.lower(Campaign.name).like(like), product_match))
    return stmt


# --------------------------------------------------------------------------- lookup


def get_campaign(db: Session, campaign_id: str, *, include_deleted: bool = False) -> Campaign:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None or (campaign.deleted_at is not None and not include_deleted):
        raise NotFoundError("Campaign not found")
    return campaign


def performance_days(db: Session, campaign_ids: list[str]) -> dict[str, int]:
    if not campaign_ids:
        return {}
    stmt = select(PerformanceRow.campaign_id, func.count()).where(PerformanceRow.campaign_id.in_(campaign_ids)).group_by(PerformanceRow.campaign_id)
    return {cid: int(n) for cid, n in db.execute(stmt)}


def totals_by_campaign(db: Session, campaign_ids: list[str], rng: DateRange) -> dict[str, Totals]:
    if not campaign_ids:
        return {}
    stmt = (
        select(
            PerformanceRow.campaign_id,
            func.coalesce(func.sum(PerformanceRow.impressions), 0),
            func.coalesce(func.sum(PerformanceRow.clicks), 0),
            func.coalesce(func.sum(PerformanceRow.spend), 0),
            func.coalesce(func.sum(PerformanceRow.conversions), 0),
            func.coalesce(func.sum(PerformanceRow.sales), 0),
            func.count(),
        )
        .where(PerformanceRow.campaign_id.in_(campaign_ids), PerformanceRow.date.between(rng.start, rng.end))
        .group_by(PerformanceRow.campaign_id)
    )
    return {row[0]: Totals(*(int(v) for v in row[1:])) for row in db.execute(stmt)}


# --------------------------------------------------------------------------- mapping


def product_out(p: CampaignProduct) -> ProductSnapshot:
    return ProductSnapshot(id=p.product_id, sku=p.sku, name=p.name, category=p.category, price=p.price)


def metrics_out(m: Metrics) -> MetricsOut:
    return MetricsOut(
        impressions=m.impressions,
        clicks=m.clicks,
        spend=m.spend,
        conversions=m.conversions,
        sales=m.sales,
        ctr=m.ctr,
        cpc=m.cpc,
        cvr=m.cvr,
        roas=m.roas,
        acos=m.acos,
        days=m.days,
    )


def range_out(rng: DateRange) -> DateRangeOut:
    return DateRangeOut(start=rng.start, end=rng.end, days=rng.days)


def campaign_out(c: Campaign, days: int) -> CampaignOut:
    return CampaignOut(
        id=c.id,
        name=c.name,
        daily_budget=c.daily_budget,
        type=c.type,
        bid_strategy=c.bid_strategy,
        status=c.status,
        start_date=c.start_date,
        end_date=c.end_date,
        products=[product_out(p) for p in c.products],
        source=c.source,
        performance_days=days,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def campaign_with_metrics_out(c: Campaign, days: int, m: Metrics) -> CampaignWithMetricsOut:
    return CampaignWithMetricsOut(**campaign_out(c, days).model_dump(by_alias=False), metrics=metrics_out(m))


def serialize(db: Session, campaign: Campaign) -> CampaignOut:
    return campaign_out(campaign, performance_days(db, [campaign.id]).get(campaign.id, 0))


# --------------------------------------------------------------------------- listing


def _sort_key(key: str):
    accessors = {
        "name": lambda c, m: c.name.lower(),
        "status": lambda c, m: STATUS_ORDER.get(c.status, 99),
        "type": lambda c, m: c.type,
        "products": lambda c, m: len(c.products),
        "budget": lambda c, m: c.daily_budget,
        "startDate": lambda c, m: c.start_date,
        # Ongoing campaigns sort after every dated one (ascending).
        "endDate": lambda c, m: c.end_date or date.max,
        "createdAt": lambda c, m: c.created_at,
        "updatedAt": lambda c, m: c.updated_at,
    }
    if key in accessors:
        return accessors[key]
    return lambda c, m: m.value(key)


def list_campaigns(
    db: Session,
    filters: CampaignFilters,
    rng: DateRange,
    *,
    sort: str = "createdAt",
    direction: str = "desc",
    page: int = 1,
    page_size: int = 5,
    locate: str | None = None,
) -> CampaignPageOut:
    """Filtered campaigns with their metrics over ``rng``, sorted and paged.

    Filtering happens in SQL; sorting and paging happen in Python because most
    sort keys are derived metrics (ratios of sums) that are cheaper to compute
    once per campaign than to express in SQL. Campaign counts are small
    (hundreds, not millions), so this is the pragmatic choice.
    """
    if sort not in SORT_KEYS:
        raise DomainError(f"Unknown sort key '{sort}'")
    if direction not in ("asc", "desc"):
        raise DomainError("dir must be 'asc' or 'desc'")
    page_size = max(1, min(int(page_size), MAX_PAGE_SIZE))

    campaigns = list(db.scalars(filtered_campaigns(filters)))
    ids = [c.id for c in campaigns]
    totals = totals_by_campaign(db, ids, rng)
    days = performance_days(db, ids)
    rows = [(c, derive(totals.get(c.id, Totals()))) for c in campaigns]

    # Newest first as the tie-breaker, then a stable sort by the requested key.
    rows.sort(key=lambda r: r[0].created_at, reverse=True)
    accessor = _sort_key(sort)
    rows.sort(key=lambda r: accessor(r[0], r[1]), reverse=direction == "desc")

    total = len(rows)
    page_count = max(1, -(-total // page_size))
    if locate:
        index = next((i for i, r in enumerate(rows) if r[0].id == locate), None)
        if index is not None:
            page = index // page_size + 1
    page = max(1, min(int(page), page_count))
    start = (page - 1) * page_size
    items = [campaign_with_metrics_out(c, days.get(c.id, 0), m) for c, m in rows[start : start + page_size]]
    aggregates = PageAggregatesOut(campaigns=total, products=sum(len(c.products) for c in campaigns), daily_budget=sum(c.daily_budget for c in campaigns))
    return CampaignPageOut(
        items=items, page=page, page_size=page_size, page_count=page_count, total=total, range=range_out(rng), sort=sort, dir=direction, aggregates=aggregates
    )


# --------------------------------------------------------------------------- write


def _apply_products(campaign: Campaign, products: list[ProductSnapshot]) -> None:
    campaign.products = [
        CampaignProduct(position=i, product_id=p.id, sku=p.sku or p.id, name=p.name, category=p.category, price=p.price) for i, p in enumerate(products)
    ]


def _check_dates(start: date, end: date | None) -> None:
    if end is not None and end < start:
        raise DomainError("End date cannot be before the start date")


def create_campaign(db: Session, payload: CampaignCreate, *, today: date | None = None, source: str = SOURCE_USER) -> Campaign:
    """Create a campaign. It starts today (unless told otherwise), active, with no performance yet."""
    start = payload.start_date or today or utc_today()
    _check_dates(start, payload.end_date)
    now = utc_now()
    campaign = Campaign(
        id=new_id("cmp"),
        name=payload.name,
        daily_budget=payload.daily_budget,
        type=payload.type,
        bid_strategy=payload.bid_strategy,
        status=payload.status,
        start_date=start,
        end_date=payload.end_date,
        source=source,
        created_at=now,
        updated_at=now,
    )
    _apply_products(campaign, payload.products)
    db.add(campaign)
    db.flush()
    return campaign


def update_campaign(db: Session, campaign_id: str, patch: CampaignUpdate) -> Campaign:
    campaign = get_campaign(db, campaign_id)
    fields = patch.model_fields_set
    if "type" in fields and patch.type is not None and patch.type != campaign.type:
        raise DomainError("The campaign type cannot be changed once a campaign exists")
    if "name" in fields and patch.name is not None:
        campaign.name = patch.name[:NAME_MAX]
    if "daily_budget" in fields and patch.daily_budget is not None:
        campaign.daily_budget = patch.daily_budget
    if "bid_strategy" in fields and patch.bid_strategy is not None:
        campaign.bid_strategy = patch.bid_strategy
    if "status" in fields and patch.status is not None:
        campaign.status = patch.status
    if "end_date" in fields:
        _check_dates(campaign.start_date, patch.end_date)
        campaign.end_date = patch.end_date
    if "products" in fields and patch.products is not None:
        _apply_products(campaign, patch.products)
    campaign.updated_at = utc_now()
    db.flush()
    return campaign


def set_status(db: Session, campaign_id: str, status: str) -> Campaign:
    if status not in STATUS_IDS:
        raise DomainError("Invalid status")
    campaign = get_campaign(db, campaign_id)
    if campaign.status != status:
        campaign.status = status
        campaign.updated_at = utc_now()
        db.flush()
    return campaign


def toggle_status(db: Session, campaign_id: str) -> Campaign:
    """Flip between active and paused (an archived one comes back active)."""
    campaign = get_campaign(db, campaign_id)
    return set_status(db, campaign_id, "paused" if campaign.status == "active" else "active")


def archive(db: Session, campaign_id: str) -> Campaign:
    """Keep the campaign and its history but hide it from the default views."""
    return set_status(db, campaign_id, ARCHIVED)


def unarchive(db: Session, campaign_id: str) -> Campaign:
    """Bring an archived campaign back, paused, so it does not start spending unexpectedly."""
    campaign = get_campaign(db, campaign_id)
    if campaign.status != ARCHIVED:
        return campaign
    return set_status(db, campaign_id, "paused")


def copy_name(name: str, existing: set[str]) -> str:
    """"Copy of X", or "Copy of X (2)", "(3)", ... when that name is taken. Stays within NAME_MAX."""
    taken = {n.strip().lower() for n in existing}
    base = f"Copy of {name}"[:NAME_MAX]
    candidate = base
    i = 2
    while candidate.lower() in taken:
        suffix = f" ({i})"
        candidate = f"{base[: NAME_MAX - len(suffix)]}{suffix}"
        i += 1
    return candidate


def duplicate_campaign(db: Session, campaign_id: str, *, today: date | None = None) -> Campaign:
    """A brand-new campaign with the same settings and products: new id, starts
    today, paused (so it does not spend until you decide), no performance history."""
    source = get_campaign(db, campaign_id)
    today = today or utc_today()
    names = set(db.scalars(select(Campaign.name).where(Campaign.deleted_at.is_(None))))
    # An end date that has already passed would make the copy dead on arrival: drop it.
    end_date = source.end_date if source.end_date and source.end_date >= today else None
    now = utc_now()
    copy = Campaign(
        id=new_id("cmp"),
        name=copy_name(source.name, names),
        daily_budget=source.daily_budget,
        type=source.type,
        bid_strategy=source.bid_strategy,
        status="paused",
        start_date=today,
        end_date=end_date,
        source=SOURCE_USER,
        created_at=now,
        updated_at=now,
    )
    _apply_products(copy, [product_out(p) for p in source.products])
    db.add(copy)
    db.flush()
    return copy


def soft_delete(db: Session, campaign_id: str) -> Campaign:
    campaign = get_campaign(db, campaign_id)
    campaign.deleted_at = utc_now()
    db.flush()
    return campaign


def restore(db: Session, campaign_id: str) -> Campaign:
    campaign = get_campaign(db, campaign_id, include_deleted=True)
    if campaign.deleted_at is not None:
        campaign.deleted_at = None
        db.flush()
    return campaign


# --------------------------------------------------------------------------- performance


def upsert_performance(db: Session, campaign_id: str, rows: list[PerformanceRowIn]) -> Campaign:
    """Merge daily rows into a campaign (a row for a date that already exists is replaced).
    This is how a reporting feed would land."""
    campaign = get_campaign(db, campaign_id)
    by_date = {r.date: r for r in rows}  # last row for a date wins
    existing = {p.date: p for p in db.scalars(select(PerformanceRow).where(PerformanceRow.campaign_id == campaign.id, PerformanceRow.date.in_(list(by_date))))}
    for day, row in by_date.items():
        target = existing.get(day)
        if target is None:
            target = PerformanceRow(campaign_id=campaign.id, date=day)
            db.add(target)
        target.impressions = row.impressions
        target.clicks = row.clicks
        target.spend = row.spend
        target.conversions = row.conversions
        target.sales = row.sales
    campaign.updated_at = utc_now()
    db.flush()
    return campaign


def get_performance(db: Session, campaign_id: str, rng: DateRange | None = None) -> list[PerformanceRow]:
    campaign = get_campaign(db, campaign_id)
    stmt = select(PerformanceRow).where(PerformanceRow.campaign_id == campaign.id).order_by(PerformanceRow.date)
    if rng is not None:
        stmt = stmt.where(PerformanceRow.date.between(rng.start, rng.end))
    return list(db.scalars(stmt))


# --------------------------------------------------------------------------- bulk (datasets)


def insert_generated(db: Session, records: list[dict]) -> list[Campaign]:
    """Insert generator output (sample / dummy data). Records whose id already exists are skipped."""
    ids = [r["id"] for r in records]
    existing = set(db.scalars(select(Campaign.id).where(Campaign.id.in_(ids))))
    added: list[Campaign] = []
    for r in records:
        if r["id"] in existing:
            continue
        campaign = Campaign(
            id=r["id"],
            name=r["name"],
            daily_budget=r["daily_budget"],
            type=r["type"],
            bid_strategy=r["bid_strategy"],
            status=r["status"],
            start_date=r["start_date"],
            end_date=r["end_date"],
            source=r["source"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        _apply_products(campaign, [ProductSnapshot(**p) for p in r["products"]])
        campaign.performance = [PerformanceRow(**row) for row in r["performance"]]
        db.add(campaign)
        added.append(campaign)
    db.flush()
    return added


def remove_by_source(db: Session, source: str) -> int:
    """Hard-delete every campaign of a given source (sample / dummy toggles)."""
    campaigns = list(db.scalars(select(Campaign).where(Campaign.source == source)))
    for c in campaigns:
        db.delete(c)
    db.flush()
    return len(campaigns)


def count_by_source(db: Session, source: str) -> int:
    return int(db.scalar(select(func.count()).select_from(Campaign).where(Campaign.source == source, Campaign.deleted_at.is_(None))) or 0)
