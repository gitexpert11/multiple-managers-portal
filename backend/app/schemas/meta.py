from app.schemas.common import APIModel


class CampaignTypeOut(APIModel):
    id: str
    label: str
    short: str
    color: str
    icon: str
    description: str


class StatusOut(APIModel):
    id: str
    label: str
    order: int


class BidStrategyOut(APIModel):
    id: str
    label: str
    description: str
    available: bool


class CurrencyOut(APIModel):
    code: str
    label: str


class LimitsOut(APIModel):
    name_max: int
    min_daily_budget: int
    max_daily_budget: int
    max_products: int
    max_range_days: int
    page_size_options: list[int]
    default_page_size: int


class MetaOut(APIModel):
    campaign_types: list[CampaignTypeOut]
    statuses: list[StatusOut]
    bid_strategies: list[BidStrategyOut]
    currencies: list[CurrencyOut]
    metrics: list[str]
    sort_keys: list[str]
    limits: LimitsOut
