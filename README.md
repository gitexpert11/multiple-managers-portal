# Expense Tracker · Todo Manager · Ads Campaign Management

A three-tab workspace. The UI is a **React 19 + TypeScript** single-page app; **Ads Campaign Management** is backed by a **Python / FastAPI** service, while the Expense Tracker and the Todo Manager stay private, local-first apps that keep their data in the browser.

| Tab | App | Data lives in |
| --- | --- | --- |
| 1 | **Expense Tracker** — income/expense tracking with category charts, sortable grids and Excel/PDF export | `localStorage["expense-tracker-ng"]` |
| 2 | **Todo Manager** — month-scoped task dashboard (summary cards, category doughnut, task list), create-task page, Excel/PDF export, 3-month sample data | `localStorage["todo-manager-ng"]` |
| 3 | **Ads Campaign Management** — campaign dashboard (time period selector, six performance cards with previous-period deltas, daily line chart, sortable/filterable/paged campaign grid), create & edit campaign pages with a paged product picker, duplicate / archive / delete-with-undo, display-currency switcher, sample (8) and dummy (96) datasets | the **FastAPI backend** (SQLite via SQLAlchemy) |
| — | **Theme** (System / Light / Dark) for the whole workspace | `localStorage["workspace-ng"]` |

```
.
├── frontend/   React + TypeScript + Vite     → frontend/README.md
├── backend/    FastAPI + SQLAlchemy + pytest → backend/README.md (API reference)
├── docker-compose.yml, Makefile
└── LICENSE (MIT)
```

## Getting started

Requires Node 18+ and Python 3.11+.

```bash
# 1. Backend (terminal 1)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload              # http://localhost:8000 — interactive docs at /docs

# 2. Frontend (terminal 2)
cd frontend
npm install
npm run dev                                # http://localhost:5173 — /api is proxied to :8000
```

Or with Docker: `docker compose up --build` → http://localhost:8080 (nginx serves the bundle and proxies `/api` to the backend; the SQLite file lives in the `ads-data` volume).

### Tests, lint, build

```bash
cd backend  && pytest                      # 38 API / domain tests (fresh in-memory SQLite per test)
cd frontend && npm test                    # 111 unit + component tests (vitest, React Testing Library, jsdom)
cd frontend && npm run lint && npm run typecheck && npm run build
# optional: the real HTTP client against a running backend
cd frontend && ADS_API_URL=http://localhost:8000/api/v1 npx vitest run client.integration
```

`make install`, `make dev-backend`, `make dev-frontend`, `make test` wrap the same commands.

## Routes

The tab strip is driven by the URL hash, so tabs and pages are bookmarkable and the back button works:

| Hash | Shows |
| --- | --- |
| `#/expenses` (default) | Expense Tracker |
| `#/todos` · `#/todos/new` | Todo Manager → dashboard · create task |
| `#/ads` · `#/ads/new` · `#/ads/edit/:id` | Ads Campaign Management → dashboard · create campaign · edit campaign |

## How it works

### Frontend

- **Shell** (`frontend/src/shell/`) — `useHashRoute()` turns the hash into `{ tab, page, id }`. All three apps are mounted up front, each in its own pane, so each keeps its transient state (selected month or period, filters, a half-filled form) while another tab is active. The active app receives its page/route as props and reports in-app navigation through `onNavigate`, which the shell mirrors into the URL. The theme switcher sets `<html data-theme>` and every app reads the same design tokens (`--surface`, `--primary`, …).
- **Local-first apps** (Expense Tracker, Todo Manager) keep small framework-agnostic *stores* — validate → commit → persist to a versioned `localStorage` envelope → notify — bound to React with `useSyncExternalStore`. Components are prop-driven; the app component owns UI state. Corrupt records are dropped on load instead of crashing, and a failed write shows a banner.
- **Ads app** is a thin client over the API: `api/client.ts` implements the `AdsApi` interface; `useDashboard` fetches the summary, the daily series and the current grid page in parallel for the current query (period, filters, sort, page) and re-fetches after every mutation; forms validate inline and surface server errors as toasts. Everything data-heavy — filtering, ratio-of-sums metrics, previous-period comparison, sorting, paging — happens on the server.
- **Shared** code (`frontend/src/shared/`): the storage wrapper, the `.xlsx`/`.pdf` writers, the Chart.js hook, icons, toasts and the `<dialog>` wrapper. These used to be duplicated per app.

### Backend

`backend/app/` is layered: `api/routes` (HTTP) → `services` (use-cases + SQL) → `domain` (pure rules: constants, date ranges, metric maths, dataset generators) with `db/models.py` (SQLAlchemy) and `schemas/` (Pydantic v2, camelCase on the wire). Campaigns store product *snapshots* and daily performance rows; deletes are soft so "Undo" is a restore; the sample/dummy datasets are tracked by a `source` column so they can be removed as a unit even after edits. See `backend/README.md` for the full API reference.

## Storage layout (browser)

```jsonc
// localStorage["expense-tracker-ng"]
{ "version": 1, "savedAt": 1710000000000, "data": { "transactions": [...], "categories": [...], "preferences": {...} } }
// localStorage["todo-manager-ng"]
{ "version": 1, "savedAt": 1710000000000, "data": { "tasks": [...] } }
// localStorage["workspace-ng"]
{ "version": 1, "savedAt": 1710000000000, "data": { "theme": "dark" } }
```

The Ads tab keeps nothing in the browser; its campaigns, performance and display currency live in the backend database.

## What changed from the vanilla-JS version

- The whole UI moved from hand-built DOM (`h()` helpers, `create*()` factories with `update(props)`) to React function components with TypeScript types for every record and prop. The proven pure logic — date keys, money parsing, statistics, metric maths, period presets, pagination, the xlsx/pdf writers, the sample-data generators — was ported 1:1 with types and kept under unit test.
- The project is now a `frontend/` + `backend/` monorepo; duplicated helpers moved to `frontend/src/shared/`; stylesheets were kept (class names are unchanged) so the look and responsive behaviour are the same.
- Ads Campaign Management gained a real backend. The client-side store and `localStorage` key `ads-campaign-manager-ng` are gone; the same features (including duplicate, archive/unarchive, delete-with-undo, sample/dummy data and the currency preference) are implemented as REST endpoints.
- `react-chartjs-2` was evaluated and not used: a 30-line `useChart` hook gives the same result, keeps the original "no canvas context → no chart" behaviour (important for jsdom tests) and saves a dependency.

## License

MIT — see [LICENSE](LICENSE).
