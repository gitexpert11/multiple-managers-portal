# Frontend — React + TypeScript

The three-tab workspace (Expense Tracker · Todo Manager · Ads Campaign Management) as a single React 19 + TypeScript app built with Vite.

```bash
npm install
npm run dev            # http://localhost:5173 — proxies /api to the FastAPI backend on :8000
npm test               # vitest + React Testing Library (jsdom)
npm run typecheck      # tsc --build
npm run lint           # eslint (typescript-eslint + react-hooks)
npm run build          # type-check + production build into dist/
```

Environment (see `.env.example`): `VITE_API_BASE_URL` (default `/api/v1`) is where the Ads app sends requests; `VITE_API_PROXY_TARGET` (default `http://localhost:8000`) is where the dev server forwards `/api`.

## Structure

```
src/
  main.tsx                      Bootstraps <App/> with the shared design tokens
  App.tsx                       Renders the shell
  styles/base.css               Design tokens + reset (light/dark via [data-theme] or prefers-color-scheme)
  shell/                        Tab strip, hash router, workspace theme
    Shell.tsx                   Mounts the three apps (one pane each) and switches them by route
    routes.ts                   parseRoute / hashFor for #/expenses, #/todos[/new], #/ads[/new|/edit/:id]
    useHashRoute.ts             window.location.hash as React state
    theme.ts                    Theme storage, <html data-theme>, ThemeContext / useTheme
    TabStrip.tsx ThemeSwitcher.tsx shell.css
  shared/                       Code used by more than one app
    hooks/useStore.ts           useSyncExternalStore binding for the local-first stores
    hooks/useChart.ts           Chart.js ↔ <canvas> (no-ops gracefully without a 2D context, e.g. jsdom)
    hooks/useNow.ts             Injectable clock (tests pin "today")
    storage/createStorage.ts    Versioned, defensive localStorage wrapper (+ in-memory backend)
    lib/export/{xlsx,pdf}.ts    Dependency-light .xlsx (fflate) and .pdf writers
    lib/{ids,prng,plural,color,download}.ts
    ui/{Icon,Toast,Dialog}.tsx  Shared primitives (one icon set, one toast system, native <dialog> wrapper)
  apps/
    expense-tracker/            Local-first (localStorage key "expense-tracker-ng")
      ExpenseTrackerApp.tsx     components/  lib/  data/  store/  styles/  types.ts
    todo-manager/               Local-first (localStorage key "todo-manager-ng")
      TodoManagerApp.tsx        components/  lib/  data/  store/  styles/  types.ts
    ads-campaign-manager/       API-backed (FastAPI, see ../backend)
      AdsCampaignApp.tsx        api/client.ts  hooks/  components/  lib/  data/  styles/  types.ts  test/fakeApi.ts
  test/utils.tsx                renderWithProviders (pinned clock + theme)
```

## How the pieces fit

- **Shell** — `useHashRoute()` turns the URL hash into `{ tab, page, id }`. All three apps are mounted up front in hidden panes, so each keeps its transient state (selected month or period, filters, a half-filled form) while another tab is active. The shell passes the active tab its `page`/`route` and receives `onNavigate` callbacks that it mirrors back into the URL.
- **Local-first apps** keep their framework-agnostic `store` objects (validate → commit → persist → notify) and bind them to React with `useSyncExternalStore`. Components are prop-driven; the app component owns transient UI state.
- **Ads app** talks to the backend through `api/client.ts` (`AdsApi` interface). `useDashboard` loads the summary, the daily series and the current grid page in parallel for the current query (period + filters + sort + page) and re-runs after every mutation; `useCampaign` loads the record behind the edit page. Filtering, aggregation, sorting and paging happen on the server; the client formats, charts and validates forms inline before calling the API. A failed load shows a retryable banner; failed mutations show an error toast.
- **Theme** is a workspace-level setting applied to `<html data-theme>` before React re-renders, so charts reading CSS tokens pick up the new colours immediately.
- **Styling** is plain CSS per app, scoped by class prefix (`todo-`, `ads-`; the Expense Tracker keeps its original unprefixed classes), all reading the same design tokens.

## Testing

`vitest` with jsdom and React Testing Library. Each app has an integration test that drives the real components through the DOM (`*App.test.tsx`), plus unit tests for the pure libraries and stores. The Ads tests run against `test/fakeApi.ts`, an in-memory implementation of the `AdsApi` contract; `api/client.integration.test.ts` additionally exercises the real HTTP client against a running backend when `ADS_API_URL` is set:

```bash
ADS_API_URL=http://localhost:8000/api/v1 npx vitest run client.integration
```
