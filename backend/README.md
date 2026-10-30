# Ads Campaign Management API

FastAPI + SQLAlchemy backend for the **Ads Campaign Management** tab. It owns campaigns (metadata + advertised-product snapshots), their daily performance rows, the product catalogue, the sample / dummy datasets and the display preferences, and it computes every dashboard aggregate (period totals, previous-period comparison, daily series, per-campaign metrics) server-side.

## Getting started

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload                          # http://localhost:8000  ·  docs at /docs
pytest                                                 # 38 tests, in-memory SQLite
```

On start-up the app creates the tables and seeds the product catalogue (idempotent). The default database is a SQLite file at `./data/ads.db`; point `ADS_DATABASE_URL` at any SQLAlchemy URL (e.g. PostgreSQL) to change that.

### Configuration (environment variables, prefix `ADS_`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADS_DATABASE_URL` | `sqlite:///./data/ads.db` | SQLAlchemy database URL |
| `ADS_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated origins allowed to call the API |
| `ADS_API_PREFIX` | `/api/v1` | Mount point for every route |
| `ADS_AUTO_MIGRATE` | `true` | Create tables + seed the catalogue at start-up |
| `ADS_ECHO_SQL` | `false` | Log SQL statements |

A `.env` file in this folder is read automatically (see `.env.example`).

## Project structure

```
app/
  main.py               create_app(): CORS, routers, lifespan (create tables, seed catalogue)
  core/
    config.py           Settings (pydantic-settings, ADS_* env vars)
    exceptions.py       DomainError / NotFoundError → JSON error responses
  db/
    base.py session.py  Declarative base, engine + session factory, get_db dependency
    models.py           Campaign, CampaignProduct, PerformanceRow, Product, Preference
  domain/               Framework-free business rules
    constants.py        Campaign types, statuses, bid strategies, currencies, limits, sort keys
    dates.py            DateRange (inclusive), previous period, range validation
    metrics.py          Totals → derived metrics (ratio-of-sums: CTR, CPC, CVR, ROAS, ACOS)
    catalogue.py        The 40-product catalogue that is seeded into the DB
    sample_data.py      Deterministic sample (8) and dummy (96) campaign generators
    prng.py             mulberry32, bit-compatible with the frontend's generator
  schemas/              Pydantic v2 models (camelCase on the wire, snake_case in Python)
  services/             Use-cases: campaigns, dashboard, datasets, products, preferences
  api/
    deps.py             DB session, reporting range (`from`/`to`) and filter dependencies
    routes/             One module per resource
tests/                  pytest suite (TestClient + fresh in-memory SQLite per test)
```

**Layering:** routes parse HTTP and call services; services hold the use-cases and SQL; `domain/` holds pure rules and maths that know nothing about HTTP or the database.

## Domain model

- **Campaign** — `name` (≤120), `dailyBudget` (integer cents, $1.00 … $1,000,000), `type` (`sponsored_products` | `sponsored_brands` | `sponsored_display`, immutable once created), `bidStrategy` (`auto`; `manual` is listed but not yet available), `status` (`active` | `paused` | `archived`), `startDate`, optional `endDate` (≥ start), 1–100 **product snapshots** (id, sku, name, category, price — copied at selection time so catalogue changes never break old campaigns), `source` (`user` | `sample` | `dummy`) and timestamps. Deletion is **soft** (`deletedAt`) so it can be undone with `/restore`.
- **Performance row** — one per campaign per day: `impressions`, `clicks`, `spend` (cents), `conversions`, `sales` (cents). Derived metrics are never stored; they are always computed as ratios of sums over the requested period.
- **Product** — the catalogue the picker offers.
- **Preference** — key/value settings; currently the display `currency` (labels only — amounts are never converted).

## API reference

All routes live under `/api/v1`. Request and response bodies are JSON with **camelCase** keys; dates are `YYYY-MM-DD`; timestamps are ISO 8601 in UTC; money is in **integer minor units** (cents). Validation failures return `422 {"detail": ...}`; unknown ids return `404`.

### Reporting range and filters

Dashboard endpoints and the campaign list accept the same query parameters:

| Param | Meaning |
| --- | --- |
| `from`, `to` | Inclusive period (default: the 30 days ending today, UTC). `from ≤ to`, at most 731 days. |
| `status` | `all` (default — active **and** paused, i.e. archived hidden) · `active` · `paused` · `archived` |
| `type` | A campaign type id |
| `q` | Case-insensitive match on campaign name, product name or product SKU |

### Campaigns

| Method & path | Purpose |
| --- | --- |
| `GET /campaigns` | Filtered campaigns **with metrics for the period**, sorted and paged. Extra params: `sort` (`name`, `status`, `type`, `products`, `budget`, `startDate`, `endDate`, `createdAt`, `updatedAt` or any metric id), `dir` (`asc`/`desc`), `page`, `pageSize` (1–100), `locate=<id>` (return the page that contains that campaign). Response: `{ items, page, pageSize, pageCount, total, range, sort, dir, aggregates: { campaigns, products, dailyBudget } }` — `aggregates` cover every filtered campaign, not just the page. |
| `POST /campaigns` | Create (`201`). Body: `{ name, dailyBudget, type, products[], bidStrategy?, status?, startDate? (defaults to today), endDate? }` |
| `GET /campaigns/{id}` | One campaign (includes `performanceDays`, the total number of days with data) |
| `PATCH /campaigns/{id}` | Edit `name`, `dailyBudget`, `endDate` (`null` clears it), `status`, `products`, `bidStrategy`. `type` may be sent only if unchanged. |
| `DELETE /campaigns/{id}` | Soft delete (`204`) |
| `POST /campaigns/{id}/restore` | Undo a delete |
| `POST /campaigns/{id}/duplicate` | Copy: new id, `"Copy of …"` (numbered if taken), **paused**, starts today (or body `{ startDate }`), a past end date is dropped, no history (`201`) |
| `POST /campaigns/{id}/pause` · `/resume` · `/toggle-status` | Pause / resume (toggle flips active↔paused; archived comes back active) |
| `POST /campaigns/{id}/archive` · `/unarchive` | Archive keeps history but hides from default views; unarchive brings it back **paused** |
| `GET /campaigns/{id}/performance?from&to` | Daily rows (optionally limited to a range) |
| `PUT /campaigns/{id}/performance` | Upsert rows `{ rows: [{ date, impressions, clicks, spend, conversions, sales }] }` — a row for an existing date is replaced (how a reporting feed lands) |

### Dashboard

| Method & path | Purpose |
| --- | --- |
| `GET /dashboard/summary` | `{ range, previousRange, totals, previous, campaignCount, archivedCount, totalCampaigns, datasets: { sample, dummy } }` — `totals`/`previous` are metrics over the filtered campaigns for the period and the same-length window before it |
| `GET /dashboard/series` | `{ range, points: [{ date, impressions, …, acos, days }] }` — one zero-filled point per day |

`totals`, `previous`, per-campaign `metrics` and series points all have the same shape: the five base counters plus `ctr`, `cpc`, `cvr`, `roas`, `acos` and `days` (rows that contributed).

### Products, datasets, preferences, meta

| Method & path | Purpose |
| --- | --- |
| `GET /products?q&category` | Catalogue for the picker: `{ items, total, categories }` |
| `GET /products/categories` | Category list |
| `GET /datasets` | `{ sample: { present, count }, dummy: { present, count } }` |
| `POST /datasets/{sample\|dummy}` | Load a dataset (`201`; body `{ today? }` aligns the generated dates with the client's calendar). Idempotent. |
| `DELETE /datasets/{sample\|dummy}` | Remove every campaign of that dataset (tracked by `source`, so edited or paused ones are removed too) |
| `GET /preferences` · `PATCH /preferences` | `{ currency }` (one of the ten supported ISO codes) |
| `GET /meta` | Vocabularies and limits the UI relies on (types, statuses, bid strategies, currencies, metric ids, sort keys, limits) |
| `GET /health` | `{ "status": "ok" }` after a database round-trip |

## Design notes

- **Filtering in SQL, sorting/paging in Python.** Status/type/search filters and the metric sums run in SQL (`GROUP BY campaign_id` / `GROUP BY date` over the period). Most sort keys are derived ratios that are cheaper to compute once per campaign than to express in SQL, and the campaign count is in the hundreds, so the list is sorted and paged in Python. Swap `services/campaigns.list_campaigns` for a SQL window-function version if the table grows into the tens of thousands.
- **Ratios of sums.** CTR, CPC, CVR, ROAS and ACOS are always computed from summed counters, never averaged per day, so the cards, the grid and the chart totals agree.
- **Soft delete** powers the "Undo" toast in the UI. Sample / dummy datasets are hard-deleted (they are regenerable).
- **Deterministic datasets.** `domain/prng.py` is a bit-exact port of the frontend's `mulberry32`, so the sample campaigns generated here are identical to the ones the original client-side app produced.
- **Schema management.** Tables are created with `Base.metadata.create_all` at start-up, which is fine for SQLite and for this scope. Introduce Alembic migrations before evolving the schema in production.
