# Ads Campaign Management

A small, private, client-side ads campaign manager: Tab 3 of the [three-tab workspace](../README.md). Vanilla JavaScript (ES modules), HTML5 and CSS, with all campaigns stored in the browser's `localStorage` under its own key, separate from the Expense Tracker and the Todo Manager.

## Pages

**Campaign dashboard** (`#/ads`)

- **Time period selector** — a preset dropdown (Last 7 / 14 / 30 / 90 days, This month, Last month, Custom range) with previous / next arrows that slide the window by its own length, and from / to date inputs for custom ranges (never past today, up to two years). Rolling presets include today. Every number on the dashboard is scoped to the selected period.
- **Campaign performance summary cards** — Spend (with CPC), Sales (with ACOS), ROAS, Impressions, Clicks (with CTR) and Orders (with conversion rate). Each card shows the change against the previous period of the same length, coloured by whether that change is good for the metric (a lower CPC is good; a lower ROAS is not). Long figures are abbreviated (1.2M, $12.3K) with the exact value in the tooltip.
- **Performance over time** — a Chart.js line chart with one point per day of the period. The chips above it pick which metrics to plot: up to two at once, the first on the left axis and the second on the right, so Spend and Sales (or Clicks and CTR) can be compared directly. Hovering shows every plotted value for that day; the period totals for the plotted metrics sit in the panel header.
- **Campaign grid** — one single-height row per campaign, one column per piece of metadata — **Campaign** (name, sticky), **Status**, **Type**, **Products** (count; names in the tooltip), **Bid**, **Start**, **End** ("—" when open-ended, struck through once passed), **Daily budget** — followed by its performance for the period (impressions, clicks, CTR, spend, CPC, orders, sales, ROAS) and a totals footer. The table scrolls sideways when the window is narrower than its columns. Every column but Bid sorts; a search box (campaign name, product name or SKU), an All / Active / Paused / Archived switch and type chips filter the grid — and the cards and chart follow the same filter, so the dashboard always describes the campaigns you are looking at. Campaigns with nothing served in the period show dashes (with a tooltip). **Paged 5 campaigns at a time by default, with a rows-per-page choice of 5 / 10 / 20** ("Showing 1–5 of 96", previous / next and page numbers with ellipses; changing the size keeps the first visible row in view); the totals footer still covers every filtered row, filters and sorting go back to page 1, and a campaign you just created, duplicated or edited is highlighted on whichever page it lands. Per row: **edit** (the campaign name opens the editor too), **pause / resume**, and a **⋯ More** menu with **Duplicate**, **Archive** (or **Unarchive**) and **Delete** (with an **Undo** toast). On phones the table becomes a stack of campaign cards.
- **Campaign actions**
  - **Duplicate** adds a copy to the grid: same budget, type, products and bid strategy, a new id, named "Copy of …" (numbered if taken), starting today, **paused** so it does not spend until you decide, with no performance history. The copy is highlighted and the toast offers an **Edit** shortcut.
  - **Archive** keeps the campaign and its history but takes it out of the default views: the status filter's **All** means active + paused, the subtitle notes "N archived hidden", and an **Archived** filter lists them. Archived campaigns cannot be paused / resumed; **Unarchive** brings one back paused. Archive has an **Undo** toast. Because the cards and chart follow the grid's filter, archived spend is excluded from the headline numbers unless you view the Archived filter.
- **Create campaign** button (top right of the dashboard, and in the empty state) opens the create page.

**Create campaign** (`#/ads/new`)

- Fields: **Campaign name** (required, ≤120 chars), **Daily budget** (required, at least $1.00, stored as integer cents), **End date** (optional; cannot be in the past — leave empty to run until paused or archived), **Type of campaign** (Sponsored Products, Sponsored Brands, Sponsored Display — radio cards), **Products** (the **Add products** button opens a searchable, category-filterable catalogue picker **paged 5 products at a time (5 / 10 / 20 selectable)** — search and filters stay fixed while only the list scrolls, the selection survives searching and paging, and "Select all shown" applies to the current page; chosen products are listed in a product grid with SKU, category and price, **also paged 5 / 10 / 20 at a time**, each removable; at least one is required) and **Bid strategy** (Auto bid is selected and the only option available for now; Manual bid is shown disabled as "coming soon").
- Inline validation with focus on the first invalid field.
- On **Submit** the campaign is persisted (status *active*, starting today, no performance yet), a toast confirms it, the dashboard filters are cleared and sorted newest-first so the new campaign is visible, the row is highlighted for a few seconds, and the app returns to the dashboard.

**Edit campaign** (`#/ads/edit/:id`)

- Opened from the grid's Edit action (or by clicking the campaign name); the id is in the URL, so the page can be bookmarked and the back button works. While editing, an **Edit campaign** link appears in the top bar.
- A facts strip shows the locked metadata: type, start date, end date, days with performance data and last update.
- Editable: **Campaign name**, **Daily budget**, **End date** (may not precede the start date), **Status** (Active / Paused / Archived) and **Products** (same picker and product grid as the create page, pre-ticked with the campaign's products). **Type of campaign** is shown but locked — a campaign's type cannot change once it exists — and the bid strategy stays Auto.
- **Save changes** is enabled only once something differs from the stored campaign (a "No changes yet" / "You have unsaved changes" hint says which). Validation is the same as on the create page. Saving keeps the campaign's id, start date and full performance history, updates `updatedAt`, shows a toast, highlights the row on the dashboard and returns there. **Cancel** (or navigating away) discards the edits; reopening the campaign shows the stored values.
- An id that matches no campaign (deleted, or a stale link) shows a "Campaign not found" panel with a way back to the dashboard — also if the campaign disappears while it is open (e.g. sample data removed).

**Display currency** — the currency selector in the top bar (US Dollar, Euro, British Pound, Indian Rupee, Japanese Yen, Canadian / Australian Dollar, Swiss Franc, Chinese Yuan, Brazilian Real) changes how every amount is labelled: summary cards, chart axes / tooltips / totals, the grid (budgets, spend, CPC, sales and footer totals), the budget field's prefix, hints and validation messages, and product prices in the picker and product grids. Amounts are stored as minor units and are **not converted** — the selector only changes the label. The choice is saved with the campaigns (`preferences.currency`).

**Dummy data** — the "Create dummy data" button in the top bar fills the grid with **96 placeholder campaigns** for trying out pagination, sorting, filtering and archiving at volume. Every textual value is visibly a placeholder — "Dummy Campaign 007", "Dummy Product 3", "Dummy Category 2", SKU "DUMMY-0003" — and the numbers follow simple synthetic patterns; types, statuses (including some archived) and history lengths (0–30 days) vary. Click again to remove them. Dummy records carry a `dummy_` id prefix and are independent of the sample data below (both can be loaded at once).

**Sample data** — the "Load sample data" button in the top bar adds eight deterministic campaigns (all three types, a couple paused, one only a few days old) with up to 90 days of daily performance ending today, so every period preset has something to show. Click again to remove them; your own campaigns are untouched. Sample records carry a `mock_` id prefix, so they stay removable even after you pause or resume them.

## Getting started

Run from the repository root:

```bash
npm run dev            # all three tabs
npm run dev:ads        # this app on its own
npm run test:ads       # this app's tests only
```

## Project structure

```
index.html                 Stand-alone entry (the tab shell has its own)
vite.config.js             Used only when served stand-alone
src/
  main.js                  Stand-alone bootstrap
  app.js                   Wires store <-> pages, owns page (+ campaign being edited), period, chart-metric, filter and sort state
  lib/
    dates.js               "YYYY-MM-DD" helpers: shiftDay, eachDay, daysBetween, formatDayRange, ...
    periods.js             Period presets, resolvePeriod, previousPeriod, shiftRange
    metrics.js             Metric catalogue, sums + derived metrics, daily series, deltas, formatting, filter + sort
    pagination.js          paginate, page-size options (5 / 10 / 20), pageNumbers (with ellipses), pageOfIndex, pageAfterResize
    money.js               Cents <-> text, supported currencies + symbols, currency / number / percent formatting
    ids.js                 Id generation
  data/
    campaignTypes.js       The three campaign types + statuses (active, paused, archived)
    bidStrategies.js       Auto (available) and Manual (not yet)
    products.js            Product catalogue for the picker
    mockData.js            Seeded generator for the realistic sample-data toggle
    dummyData.js           Generator for the "Create dummy data" toggle (96 placeholder campaigns)
  store/
    storage.js             Versioned localStorage wrapper, key "ads-campaign-manager-ng"
    store.js               Campaign store: add, update, setStatus/toggleStatus, archive/unarchive, duplicate,
                           delete, restore, addPerformance, addCampaigns, removeCampaignsWhere, setPreferences, clearAll
  ui/
    dom.js  toast.js       Element builder, icons, notifications
    periodSelector.js      Time period selector
    summaryCards.js        The six headline cards with previous-period deltas
    performanceChart.js    Line chart (Chart.js) + metric chips + period totals
    pager.js               Pagination control (rows-per-page + pages) shared by the grid, the picker and the product grid
    campaignGrid.js        Sortable, filterable, paged campaign grid with row actions + "More" menu
    productPicker.js       "Add products" dialog
    campaignForm.js        Campaign form: create page (`mode: 'create'`) and edit page (`mode: 'edit'`)
  styles/
    ads.css                All component styles (every class is `ads-` prefixed)
    base.css               Design tokens + reset, used only stand-alone (the shell loads the shared copy)
tests/                     Vitest suites (pure logic + jsdom integration)
```

### Hosting

`createAdsApp(rootEl, { store, now, onNavigate })` mounts the whole app into `rootEl` and returns `{ showPage, render, store }`. A host calls `showPage('dashboard' | 'new' | 'edit', { id })` when the URL changes, and receives `onNavigate(page, { id })` when the user moves between pages inside the app (the id is only present for `edit`), so it can mirror that into the URL. Without a host the app simply switches pages itself.

## Data model

Everything lives under the `ads-campaign-manager-ng` key in `localStorage`:

```jsonc
{
  "version": 1,
  "savedAt": 1710000000000,
  "data": {
    "campaigns": [
      {
        "id": "cmp_…",
        "name": "Spring Sale — Headphones",
        "dailyBudget": 4500,               // integer cents
        "type": "sponsored_brands",        // sponsored_products | sponsored_brands | sponsored_display
        "bidStrategy": "auto",
        "status": "active",                // active | paused | archived
        "startDate": "2025-03-15",         // local calendar date
        "endDate": null,                   // optional "YYYY-MM-DD" on/after startDate; null = open-ended
        "products": [                      // snapshots, so catalogue changes never break old campaigns
          { "id": "SKU-1001", "sku": "SKU-1001", "name": "Wireless Noise-Cancelling Headphones", "category": "Electronics", "price": 14999 }
        ],
        "performance": [                   // one row per served day; everything else is derived
          { "date": "2025-03-15", "impressions": 1200, "clicks": 14, "spend": 3120, "conversions": 2, "sales": 29998 }
        ],
        "createdAt": 0, "updatedAt": 0
      }
    ],
    "preferences": { "currency": "USD" }   // display currency; amounts above are never converted
  }
}
```

Derived metrics (CTR, CPC, CVR, ROAS, ACOS) are always computed as ratios of sums over the selected period, never averages of daily ratios. Corrupt or partial records are repaired (missing id/status/bid strategy/timestamps, bad performance rows) or dropped (no name, no valid budget, no products) on load. The `version` field allows future schema migrations in `storage.js`.

Campaigns you create start with an empty `performance` array — this app has no ad network behind it — so they show dashes in the grid until rows arrive. `store.addPerformance(id, rows)` is the hook a reporting feed would use to deliver daily rows (rows for an existing date replace it).
