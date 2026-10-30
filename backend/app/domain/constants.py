"""Fixed vocabularies and limits shared by validation, services and the /meta endpoint."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CampaignType:
    id: str
    label: str
    short: str
    color: str
    icon: str
    description: str


CAMPAIGN_TYPES: tuple[CampaignType, ...] = (
    CampaignType("sponsored_products", "Sponsored Products", "Products", "#4f46e5", "tag", "Promote individual listings in search results and on product pages."),
    CampaignType("sponsored_brands", "Sponsored Brands", "Brands", "#ec4899", "award", "Showcase your brand and a collection of products with a banner."),
    CampaignType("sponsored_display", "Sponsored Display", "Display", "#0ea5e9", "layout", "Reach shoppers on and off the store with display placements."),
)
CAMPAIGN_TYPE_IDS = tuple(t.id for t in CAMPAIGN_TYPES)
DEFAULT_CAMPAIGN_TYPE = CAMPAIGN_TYPE_IDS[0]


@dataclass(frozen=True)
class Status:
    id: str
    label: str
    order: int


STATUSES: tuple[Status, ...] = (Status("active", "Active", 0), Status("paused", "Paused", 1), Status("archived", "Archived", 2))
STATUS_IDS = tuple(s.id for s in STATUSES)
STATUS_ORDER = {s.id: s.order for s in STATUSES}
DEFAULT_STATUS = "active"
ARCHIVED = "archived"
LIVE_STATUSES = ("active", "paused")


@dataclass(frozen=True)
class BidStrategy:
    id: str
    label: str
    description: str
    available: bool


BID_STRATEGIES: tuple[BidStrategy, ...] = (
    BidStrategy("auto", "Auto bid", "Bids are adjusted automatically to get the most conversions within your daily budget.", True),
    BidStrategy("manual", "Manual bid", "Set a fixed bid per product yourself.", False),
)
BID_STRATEGY_IDS = tuple(b.id for b in BID_STRATEGIES)
AVAILABLE_BID_STRATEGIES = tuple(b.id for b in BID_STRATEGIES if b.available)
DEFAULT_BID_STRATEGY = "auto"

CURRENCIES: tuple[tuple[str, str], ...] = (
    ("USD", "US Dollar ($)"),
    ("EUR", "Euro (€)"),
    ("GBP", "British Pound (£)"),
    ("INR", "Indian Rupee (₹)"),
    ("JPY", "Japanese Yen (¥)"),
    ("CAD", "Canadian Dollar (CA$)"),
    ("AUD", "Australian Dollar (A$)"),
    ("CHF", "Swiss Franc (CHF)"),
    ("CNY", "Chinese Yuan (¥)"),
    ("BRL", "Brazilian Real (R$)"),
)
CURRENCY_CODES = tuple(code for code, _ in CURRENCIES)
DEFAULT_CURRENCY = "USD"

# Sources: who created the record. Sample / dummy data can be removed in bulk.
SOURCE_USER = "user"
SOURCE_SAMPLE = "sample"
SOURCE_DUMMY = "dummy"
SOURCES = (SOURCE_USER, SOURCE_SAMPLE, SOURCE_DUMMY)

# Limits (mirrored by the frontend form).
NAME_MAX = 120
MIN_DAILY_BUDGET = 100  # cents ($1.00)
MAX_DAILY_BUDGET = 100_000_000  # cents ($1,000,000.00)
MAX_PRODUCTS = 100
MAX_RANGE_DAYS = 731  # two years, one chart point per day
DEFAULT_RANGE_DAYS = 30
PAGE_SIZE_OPTIONS = (5, 10, 20)
DEFAULT_PAGE_SIZE = 5
MAX_PAGE_SIZE = 100

BASE_METRICS = ("impressions", "clicks", "spend", "conversions", "sales")
DERIVED_METRICS = ("ctr", "cpc", "cvr", "roas", "acos")
METRIC_IDS = BASE_METRICS + DERIVED_METRICS

# Sortable grid columns (besides metric ids).
SORT_KEYS = ("name", "status", "type", "products", "budget", "startDate", "endDate", "createdAt", "updatedAt") + METRIC_IDS
