# Expense Tracker · Todo Manager · Ads Campaign Management

Three fast, private, client-side apps in one page, switched with a tab strip. Vanilla JavaScript (ES modules), HTML5 and modern CSS — no framework, no backend, no accounts. All data stays in the browser's `localStorage`.

| Tab | App | Folder | `localStorage` key |
| --- | --- | --- | --- |
| 1 | **Expense Tracker** — income/expense tracking with charts, grids and Excel/PDF export | [`expense-tracker/`](expense-tracker/) | `expense-tracker-ng` |
| 2 | **Todo Manager** — a month-scoped task dashboard (summary cards, category doughnut, task list) plus a create-task page, with Excel/PDF export and a 3-month sample-data toggle | [`todo-manager/`](todo-manager/) | `todo-manager-ng` |
| 3 | **Ads Campaign Management** — a campaign dashboard (time period selector, performance summary cards, daily line chart, sortable campaign grid with metadata + performance) plus create-campaign and edit-campaign pages (name, budget, end date, type, paged product picker, status, auto bid); duplicate / archive actions; paged grid (5 / 10 / 20 rows); display-currency switcher; realistic sample data and 96-campaign dummy data toggles | [`ads-campaign-manager/`](ads-campaign-manager/) | `ads-campaign-manager-ng` |
| — | **Theme** (System / Light / Dark) — workspace-level switcher at the right of the tab strip, applies to every tab | [`src/theme.js`](src/theme.js) | `workspace-ng` |

The apps are fully independent: separate source trees, separate tests, separate stores and separate storage keys. Clearing, exporting or importing one never touches the others. All are mounted when the page loads, so each shows its saved data immediately whichever tab you open first, and each keeps its own state (selected month or period, filters, a half-filled form) while another tab is active.

## Getting started

```bash
npm install
npm run dev            # the three-tab app on http://localhost:5173
npm test               # all suites: shell + expense-tracker + todo-manager + ads-campaign-manager
npm run build          # production build into dist/
npm run preview        # serve the production build
```

Each app can also be run on its own:

```bash
npm run dev:expense    # Expense Tracker alone (expense-tracker/index.html)
npm run dev:todo       # Todo Manager alone   (todo-manager/index.html)
npm run dev:ads        # Ads Campaign Management alone (ads-campaign-manager/index.html)
npm run test:expense   # only expense-tracker/tests
npm run test:todo      # only todo-manager/tests
npm run test:ads       # only ads-campaign-manager/tests
npm run test:shell     # only tests/ (tabs + routing + storage isolation)
npm run test:coverage  # all suites with a coverage summary (HTML report in coverage/)
```

Requires Node 18+.

## Routes

The tab strip is driven by the URL hash, so tabs and pages are bookmarkable and the browser's back/forward buttons work:

| Hash | Shows |
| --- | --- |
| `#/expenses` (default) | Expense Tracker |
| `#/todos` | Todo Manager → dashboard |
| `#/todos/new` | Todo Manager → create task |
| `#/ads` | Ads Campaign Management → campaign dashboard |
| `#/ads/new` | Ads Campaign Management → create campaign |
| `#/ads/edit/:id` | Ads Campaign Management → edit campaign |

## Project structure

```
index.html                 Entry page for the three-tab app
src/
  main.js                  Loads styles and mounts the shell
  shell.js                 Tab strip + hash router; mounts every app, one per pane
  theme.js                 Workspace theme: switcher control, persistence, <html data-theme>
  shell.css                Tab strip + theme switcher styles
tests/
  shell.test.js            Tabs, routing, storage isolation, data loading, theme behaviour
  theme.test.js            Theme storage + switcher unit tests

expense-tracker/           Tab 1 — unchanged application code (see its README)
  index.html  vite.config.js  src/  tests/  docs/  public/
todo-manager/              Tab 2 — application code (see its README)
  index.html  vite.config.js  src/  tests/  public/
ads-campaign-manager/      Tab 3 — new application (see its README)
  index.html  vite.config.js  src/  tests/  public/

vite.config.js             Root config: serves the shell, runs every test suite
package.json               Single dependency set for the whole workspace
```

### How the shell hosts the apps

Every application exposes a factory that mounts into any element — `createApp(rootEl, { store, now })` for the Expense Tracker, `createTodoApp(rootEl, { store, now, onNavigate })` for the Todo Manager and `createAdsApp(rootEl, { store, now, onNavigate })` for Ads Campaign Management. The shell creates one `<section class="shell__pane">` per tab, mounts each app into its pane, and toggles the `hidden` attribute as the hash changes. Nothing inside `expense-tracker/` or `todo-manager/` was modified to add the third tab; the shell only adds a small CSS rule so each app's sticky top bar sits just below the tab strip.

All apps read the same design tokens (`--surface`, `--primary`, …), which switch on `<html data-theme>`. The shell owns that attribute: the System / Light / Dark switcher at the right of the tab strip sets it once for the whole page, so the theme applies to every tab and is not part of any app's data. (It used to live in the Expense Tracker's settings; a previously saved choice is adopted automatically on first load.) Todo Manager class names are `todo-` prefixed and Ads Campaign Management class names are `ads-` prefixed, so no app's styles leak into another.

## Storage layout

Independent versioned envelopes, side by side:

```jsonc
// localStorage["expense-tracker-ng"]
{ "version": 1, "savedAt": 1710000000000, "data": { "transactions": [...], "categories": [...], "preferences": {...} } }

// localStorage["todo-manager-ng"]
{ "version": 1, "savedAt": 1710000000000, "data": { "tasks": [...] } }

// localStorage["ads-campaign-manager-ng"]
{ "version": 1, "savedAt": 1710000000000, "data": { "campaigns": [...], "preferences": { "currency": "USD" } } }

// localStorage["workspace-ng"]  (shell-level settings)
{ "version": 1, "savedAt": 1710000000000, "data": { "theme": "dark" } }
```

Each app repairs or drops corrupt records on load rather than crashing, and shows a banner if a write fails (storage full or blocked).

## License

MIT — see [LICENSE](LICENSE).
