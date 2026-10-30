from fastapi import APIRouter

from app.domain import constants as c
from app.schemas.meta import BidStrategyOut, CampaignTypeOut, CurrencyOut, LimitsOut, MetaOut, StatusOut

router = APIRouter(tags=["meta"])


@router.get("/meta", response_model=MetaOut, summary="Vocabularies and limits the UI can rely on")
def meta() -> MetaOut:
    return MetaOut(
        campaign_types=[CampaignTypeOut(**t.__dict__) for t in c.CAMPAIGN_TYPES],
        statuses=[StatusOut(**s.__dict__) for s in c.STATUSES],
        bid_strategies=[BidStrategyOut(**b.__dict__) for b in c.BID_STRATEGIES],
        currencies=[CurrencyOut(code=code, label=label) for code, label in c.CURRENCIES],
        metrics=list(c.METRIC_IDS),
        sort_keys=list(c.SORT_KEYS),
        limits=LimitsOut(
            name_max=c.NAME_MAX,
            min_daily_budget=c.MIN_DAILY_BUDGET,
            max_daily_budget=c.MAX_DAILY_BUDGET,
            max_products=c.MAX_PRODUCTS,
            max_range_days=c.MAX_RANGE_DAYS,
            page_size_options=list(c.PAGE_SIZE_OPTIONS),
            default_page_size=c.DEFAULT_PAGE_SIZE,
        ),
    )
