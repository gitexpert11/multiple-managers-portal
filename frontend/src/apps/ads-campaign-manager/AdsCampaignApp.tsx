import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNow } from '@shared/hooks/useNow';
import { Icon } from '@shared/ui/Icon';
import { ToastProvider, useToaster } from '@shared/ui/Toast';
import { useTheme } from '@/shell/theme';
import { createAdsApi, type AdsApi, type CampaignListQuery } from './api/client';
import { CampaignForm, type CampaignFormHandle } from './components/CampaignForm';
import { CampaignGrid } from './components/CampaignGrid';
import { DEFAULT_CHART_METRICS, PerformanceChart } from './components/PerformanceChart';
import { PeriodSelector } from './components/PeriodSelector';
import { SummaryCards } from './components/SummaryCards';
import { useCampaign } from './hooks/useCampaign';
import { useDashboard } from './hooks/useDashboard';
import { usePreferences } from './hooks/usePreferences';
import { todayKey } from './lib/dates';
import { emptyMetrics } from './lib/metrics';
import { CURRENCIES, isCurrency } from './lib/money';
import { DEFAULT_PAGE_SIZE, isPageSize, pageAfterResize } from './lib/pagination';
import { DEFAULT_PRESET, resolvePeriod } from './lib/periods';
import type { CampaignFilter, DatasetName, GridSort, MetricId, Period, StatusAction } from './types';
import './styles/ads.css';

export const ADS_PAGES = ['dashboard', 'new', 'edit'] as const;
export type AdsPage = (typeof ADS_PAGES)[number];

/** How long a freshly created / edited campaign stays highlighted in the grid. */
const HIGHLIGHT_MS = 4000;
const EMPTY_FILTER: CampaignFilter = { status: 'all', type: null, query: '' };

export interface AdsRoute {
  page: AdsPage;
  id?: string | null;
}

export interface AdsCampaignAppProps {
  /** Inject an API client (tests use an in-memory fake); the HTTP client is created otherwise. */
  api?: AdsApi;
  /** Route controlled by the host (the shell mirrors it into the URL). */
  route?: AdsRoute;
  onNavigate?: (route: AdsRoute) => void;
}

/** Tab 3: Ads Campaign Management, backed by the FastAPI service. */
export function AdsCampaignApp({ api, route, onNavigate }: AdsCampaignAppProps) {
  const [ownApi] = useState(() => api ?? createAdsApi());
  return (
    <div className="ads">
      <ToastProvider>
        <AdsCampaignManager api={api ?? ownApi} route={route} onNavigate={onNavigate} />
      </ToastProvider>
    </div>
  );
}

function AdsCampaignManager({ api, route: controlledRoute, onNavigate }: { api: AdsApi } & Pick<AdsCampaignAppProps, 'route' | 'onNavigate'>) {
  const now = useNow();
  const theme = useTheme();
  const toaster = useToaster();
  const today = todayKey(now());

  // ---- UI state -------------------------------------------------------------------
  // The host (hash router) owns the route when it passes one; otherwise the app does.
  const [ownRoute, setOwnRoute] = useState<AdsRoute>({ page: 'dashboard' });
  const route = controlledRoute ?? ownRoute;
  const [period, setPeriod] = useState<Period>({ preset: DEFAULT_PRESET });
  const [chartMetrics, setChartMetrics] = useState<MetricId[]>([...DEFAULT_CHART_METRICS]);
  const [filter, setFilter] = useState<CampaignFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<GridSort>({ key: 'createdAt', dir: 'desc' });
  const [gridPage, setGridPage] = useState(1);
  const [gridPageSize, setGridPageSize] = useState(DEFAULT_PAGE_SIZE);
  /** A campaign the grid should page to (just created / duplicated / edited); cleared by any explicit paging, sorting or filtering. */
  const [locateId, setLocateId] = useState<string | null>(null);
  /** The row to visually highlight for a few seconds. */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bump after every mutation to refetch
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createFormRef = useRef<CampaignFormHandle>(null);
  const editFormRef = useRef<CampaignFormHandle>(null);

  const [preferences, updatePreferences] = usePreferences(api);
  const { currency } = preferences;

  const page: AdsPage = route.page === 'edit' && !route.id ? 'dashboard' : ADS_PAGES.includes(route.page) ? route.page : 'dashboard';
  const editingId = page === 'edit' ? (route.id ?? null) : null;

  useEffect(() => {
    if (page === 'new') createFormRef.current?.focus();
  }, [page]);

  const navigate = useCallback(
    (next: AdsRoute) => {
      const target: AdsRoute = next.page === 'edit' && next.id ? { page: 'edit', id: next.id } : { page: next.page === 'new' ? 'new' : 'dashboard' };
      setOwnRoute(target);
      onNavigate?.(target);
    },
    [onNavigate],
  );

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const setHighlight = useCallback((id: string | null) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightId(id);
    setLocateId(id);
    if (id) highlightTimer.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  }, []);
  useEffect(() => () => void (highlightTimer.current && clearTimeout(highlightTimer.current)), []);

  // ---- server data ----------------------------------------------------------------
  const range = useMemo(() => resolvePeriod(period, today), [period, today]);
  const query: CampaignListQuery = useMemo(
    () => ({ from: range.from, to: range.to, filter, sort: sort.key, dir: sort.dir, page: gridPage, pageSize: gridPageSize, locate: locateId }),
    [range.from, range.to, filter, sort, gridPage, gridPageSize, locateId],
  );
  const dashboard = useDashboard(api, query, version);
  const editing = useCampaign(api, editingId, version);

  const summary = dashboard.data?.summary ?? null;
  const campaigns = dashboard.data?.campaigns ?? null;
  const series = dashboard.data?.series.points ?? [];
  const totalCampaigns = summary?.totalCampaigns ?? 0;
  const datasets = summary?.datasets ?? { sample: 0, dummy: 0 };

  // ---- helpers --------------------------------------------------------------------
  const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

  async function run<T>(action: () => Promise<T>, fallback: string): Promise<T | null> {
    try {
      const result = await action();
      refresh();
      return result;
    } catch (err) {
      toaster.show(errorMessage(err, fallback), { tone: 'error' });
      return null;
    }
  }

  function resetFilters(status: CampaignFilter['status'] = 'all') {
    setFilter({ ...EMPTY_FILTER, status });
    setGridPage(1);
    setLocateId(null);
  }

  /** Paging / sorting / filtering chosen by the user overrides any "page to this campaign" request. */
  function goToPage(page: number) {
    setLocateId(null);
    setGridPage(page);
  }

  async function toggleDataset(name: DatasetName, present: boolean) {
    const labels = name === 'sample' ? { add: 'Added', noun: 'sample campaigns with 90 days of performance', removed: 'sample campaigns' } : { add: 'Created', noun: 'dummy campaigns', removed: 'dummy campaigns' };
    const change = await run(() => (present ? api.removeDataset(name) : api.loadDataset(name, today)), 'Could not update sample data');
    if (!change) return;
    toaster.show(present ? `Removed ${change.removed} ${labels.removed}` : `${labels.add} ${change.added} ${labels.noun}`, { tone: present ? 'neutral' : 'success', duration: 3500 });
    resetFilters();
  }

  const applyStatus = async (id: string, action: StatusAction, message: (name: string, status: string) => string, tone: 'success' | 'neutral' = 'neutral') => {
    const c = await run(() => api.applyStatus(id, action), 'Could not update campaign');
    if (c) toaster.show(message(c.name, c.status), { tone, duration: 2500 });
    return c;
  };

  const pageLink = (target: AdsPage, label: string, hidden = false) => (
    <button
      type="button"
      className={`ads-topbar__link${page === target ? ' is-active' : ''}`}
      data-page-link={target}
      hidden={hidden}
      aria-current={page === target ? 'page' : undefined}
      onClick={() => navigate(target === 'edit' ? { page: 'edit', id: editingId } : { page: target })}
    >
      {label}
    </button>
  );

  const sampleLabel = datasets.sample ? 'Remove sample data' : 'Load sample data';
  const dummyLabel = datasets.dummy ? 'Remove dummy data' : 'Create dummy data';

  return (
    <>
      <header className="ads-topbar">
        <div className="ads-topbar__brand">
          <span className="ads-topbar__logo">
            <Icon name="megaphone" size={22} />
          </span>
          <h1 className="ads-topbar__title">Ads Campaign Management</h1>
        </div>
        <nav className="ads-topbar__nav" aria-label="Campaign pages">
          {pageLink('dashboard', 'Dashboard')}
          {pageLink('new', 'Create campaign')}
          {pageLink('edit', 'Edit campaign', page !== 'edit')}
        </nav>
        <div className="ads-topbar__actions">
          <label className="ads-currency-wrap" title="Display currency — amounts are shown in this currency, not converted">
            <Icon name="banknote" size={14} />
            <select
              className="ads-currency"
              aria-label="Display currency"
              data-testid="ads-currency"
              value={currency}
              onChange={async (e) => {
                const code = e.target.value;
                if (!isCurrency(code)) return;
                try {
                  await updatePreferences({ currency: code });
                  toaster.show(`Showing amounts in ${CURRENCIES.find((c) => c.code === code)?.label || code}`, { duration: 2500 });
                } catch (err) {
                  toaster.show(errorMessage(err, 'Could not save the display currency'), { tone: 'error' });
                }
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`ads-btn ads-btn--sm ads-sample-toggle${datasets.sample ? ' is-active' : ''}`}
            data-testid="ads-sample-data-toggle"
            aria-pressed={datasets.sample ? 'true' : 'false'}
            aria-label={sampleLabel}
            title="Adds sample campaigns with 90 days of performance. Click again to remove them."
            onClick={() => toggleDataset('sample', datasets.sample > 0)}
          >
            <Icon name="database" size={16} />
            <span>{sampleLabel}</span>
          </button>
          <button
            type="button"
            className={`ads-btn ads-btn--sm ads-dummy-toggle${datasets.dummy ? ' is-active' : ''}`}
            data-testid="ads-dummy-data-toggle"
            aria-pressed={datasets.dummy ? 'true' : 'false'}
            aria-label={dummyLabel}
            title='Fills the grid with placeholder campaigns (every value labelled "Dummy"). Click again to remove them.'
            onClick={() => toggleDataset('dummy', datasets.dummy > 0)}
          >
            <Icon name="layers" size={16} />
            <span>{dummyLabel}</span>
          </button>
        </div>
      </header>

      {dashboard.error && (
        <div className="ads-banner ads-banner--error" role="alert" data-testid="ads-error">
          <Icon name="cloudOff" size={16} />
          <span>
            Could not load campaigns from the server{dashboard.error.message ? ` — ${dashboard.error.message}` : ''}.
          </span>
          <button type="button" className="ads-btn ads-btn--sm" onClick={dashboard.refresh}>
            <Icon name="refresh" size={14} />
            <span>Retry</span>
          </button>
        </div>
      )}

      <main className="ads-layout">
        <div className="ads-page" data-page="dashboard" hidden={page !== 'dashboard'}>
          <div className="ads-toolbar">
            <PeriodSelector
              range={range}
              today={today}
              onChange={(p) => {
                setPeriod(p);
                goToPage(1);
              }}
            />
            <button type="button" className="ads-btn ads-btn--primary" data-testid="ads-new-campaign" onClick={() => navigate({ page: 'new' })}>
              <Icon name="plus" size={16} />
              <span>Create campaign</span>
            </button>
          </div>
          <SummaryCards totals={summary?.totals ?? emptyMetrics()} previous={summary?.previous ?? emptyMetrics()} currency={currency} />
          <PerformanceChart series={series} metrics={chartMetrics} range={range} hasCampaigns={totalCampaigns > 0} currency={currency} theme={theme} onMetricsChange={setChartMetrics} />
          <CampaignGrid
            page={campaigns}
            totals={summary?.totals ?? emptyMetrics()}
            sort={sort}
            filter={filter}
            rangeLabel={range.label}
            today={today}
            highlightId={highlightId}
            hasAnyCampaigns={totalCampaigns > 0}
            archivedCount={summary?.archivedCount ?? 0}
            loading={dashboard.loading}
            currency={currency}
            onSort={(s) => {
              setSort(s);
              goToPage(1);
            }}
            onFilter={(patch) => {
              setFilter((f) => ({ ...f, ...patch }));
              goToPage(1);
            }}
            onPage={goToPage}
            onPageSize={(size) => {
              if (!isPageSize(size)) return;
              goToPage(pageAfterResize(campaigns?.page ?? gridPage, gridPageSize, size));
              setGridPageSize(size);
            }}
            onToggleStatus={(id) => applyStatus(id, 'toggle-status', (name, status) => (status === 'paused' ? `Paused “${name}”` : `Resumed “${name}”`), 'neutral')}
            onDuplicate={async (id) => {
              const copy = await run(() => api.duplicateCampaign(id, today), 'Could not duplicate campaign');
              if (!copy) return;
              // Show the copy where it lands: clear filters, newest first, jump to its page.
              resetFilters();
              setSort({ key: 'createdAt', dir: 'desc' });
              setHighlight(copy.id);
              toaster.show(`Duplicated as “${copy.name}” (paused)`, { tone: 'success', action: 'Edit', actionIcon: 'edit', onAction: () => navigate({ page: 'edit', id: copy.id }), duration: 6000 });
            }}
            onArchive={async (id) => {
              const previous = campaigns?.items.find((c) => c.id === id)?.status;
              const c = await run(() => api.applyStatus(id, 'archive'), 'Could not archive campaign');
              if (!c) return;
              toaster.show(`Archived “${c.name}”`, {
                action: 'Undo',
                onAction: () => run(() => api.applyStatus(id, previous === 'paused' ? 'unarchive' : 'resume'), 'Could not restore campaign'),
                duration: 6000,
              });
            }}
            onUnarchive={(id) => applyStatus(id, 'unarchive', (name) => `Unarchived “${name}” — it is paused until you resume it`, 'success')}
            onDelete={async (id) => {
              const removed = campaigns?.items.find((c) => c.id === id);
              const ok = await run(() => api.deleteCampaign(id), 'Could not delete campaign');
              if (ok === null) return;
              toaster.show(`Deleted “${removed?.name ?? 'campaign'}”`, { action: 'Undo', onAction: () => run(() => api.restoreCampaign(id), 'Could not restore campaign'), duration: 6000 });
            }}
            onCreate={() => navigate({ page: 'new' })}
            onEdit={(id) => navigate({ page: 'edit', id })}
          />
        </div>

        <div className="ads-page ads-page--narrow" data-page="new" hidden={page !== 'new'}>
          <CampaignForm
            ref={createFormRef}
            api={api}
            mode="create"
            today={today}
            currency={currency}
            onSubmit={async (payload) => {
              const created = await run(() => api.createCampaign({ ...payload, startDate: today }), 'Could not save campaign');
              if (!created) return false;
              // Make sure the new campaign is actually visible on the dashboard:
              // clear the filters, sort newest first and highlight the row.
              resetFilters();
              setSort({ key: 'createdAt', dir: 'desc' });
              setHighlight(created.id);
              toaster.show(`Campaign “${created.name}” created`, { tone: 'success', duration: 3500 });
              navigate({ page: 'dashboard' });
              return true;
            }}
            onCancel={() => navigate({ page: 'dashboard' })}
          />
        </div>

        <div className="ads-page ads-page--narrow" data-page="edit" hidden={page !== 'edit'}>
          {page === 'edit' && editing.error ? (
            <section className="ads-panel ads-not-found" data-testid="ads-edit-error">
              <Icon name="cloudOff" size={28} />
              <p className="ads-not-found__title">Could not load the campaign</p>
              <p className="ads-panel__hint">{editing.error.message}</p>
              <button type="button" className="ads-btn ads-btn--primary" onClick={editing.refresh}>
                <Icon name="refresh" size={16} />
                <span>Retry</span>
              </button>
            </section>
          ) : page === 'edit' && !editing.loading && !editing.data ? (
            // Shown in place of the form when the id in the URL matches no campaign.
            <section className="ads-panel ads-not-found" data-testid="ads-edit-not-found">
              <Icon name="alert" size={28} />
              <p className="ads-not-found__title">Campaign not found</p>
              <p className="ads-panel__hint">It may have been deleted, or the link is out of date.</p>
              <button type="button" className="ads-btn ads-btn--primary" onClick={() => navigate({ page: 'dashboard' })}>
                <Icon name="arrowLeft" size={16} />
                <span>Back to dashboard</span>
              </button>
            </section>
          ) : (
            <div hidden={!editing.data} aria-busy={editing.loading ? 'true' : 'false'}>
              <CampaignForm
                key={editing.data ? `${editing.data.id}:${editing.data.updatedAt}` : 'none'}
                ref={editFormRef}
                api={api}
                mode="edit"
                campaign={editing.data}
                today={today}
                currency={currency}
                onSubmit={async (payload) => {
                  if (!editing.data) return false;
                  const { type: _type, ...patch } = payload; // the type is locked; do not send it
                  const updated = await run(() => api.updateCampaign(editing.data!.id, patch), 'Could not save changes');
                  if (!updated) return false;
                  // Archived campaigns are hidden by the default filter: follow it there.
                  resetFilters(updated.status === 'archived' ? 'archived' : 'all');
                  setHighlight(updated.id);
                  toaster.show(`Campaign “${updated.name}” updated`, { tone: 'success', duration: 3500 });
                  navigate({ page: 'dashboard' });
                  return true;
                }}
                onCancel={() => navigate({ page: 'dashboard' })}
              />
            </div>
          )}
        </div>
      </main>
      <footer className="ads-footer">Campaigns are stored by the Ads Campaign Management service, separately from your expenses and tasks.</footer>
    </>
  );
}
