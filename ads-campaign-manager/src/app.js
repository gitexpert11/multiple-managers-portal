import { generateDummyCampaigns, isDummyCampaign } from './data/dummyData.js';
import { generateMockCampaigns, isMockCampaign } from './data/mockData.js';
import { todayKey } from './lib/dates.js';
import { countArchived, dailySeries, filterCampaigns, sortCampaignRows, summarizeCampaign, summarizeCampaigns } from './lib/metrics.js';
import { CURRENCIES, isCurrency } from './lib/money.js';
import { DEFAULT_PAGE_SIZE, isPageSize, pageAfterResize, pageOfIndex } from './lib/pagination.js';
import { DEFAULT_PRESET, previousPeriod, resolvePeriod } from './lib/periods.js';
import { createStore } from './store/store.js';
import { createCampaignForm } from './ui/campaignForm.js';
import { createCampaignGrid } from './ui/campaignGrid.js';
import { h, icon } from './ui/dom.js';
import { DEFAULT_CHART_METRICS, createPerformanceChart } from './ui/performanceChart.js';
import { createPeriodSelector } from './ui/periodSelector.js';
import { createProductPicker } from './ui/productPicker.js';
import { createSummaryCards } from './ui/summaryCards.js';
import { createToaster } from './ui/toast.js';

export const PAGES = ['dashboard', 'new', 'edit'];
/** How long a freshly created campaign stays highlighted in the grid. */
const HIGHLIGHT_MS = 4000;

/**
 * Wires the store to the three pages (campaign dashboard, create campaign,
 * edit campaign). Persistent data lives in the store; transient UI state
 * (current page, campaign being edited, selected period, chart metrics,
 * filters, sort) lives here.
 *
 * @param {HTMLElement} rootEl
 * @param {{store?: object, now?: () => Date, onNavigate?: (page: string, params?: {id?: string}) => void}} opts
 *   `onNavigate` lets a host (the tab shell) mirror in-app page changes into
 *   the URL (`edit` carries the campaign id); the host calls `showPage(page,
 *   { id })` back when the URL changes.
 */
export function createAdsApp(rootEl, { store = createStore(), now = () => new Date(), onNavigate } = {}) {
  const ui = {
    page: 'dashboard',
    editingId: null,
    period: { preset: DEFAULT_PRESET },
    chartMetrics: [...DEFAULT_CHART_METRICS],
    filter: { status: 'all', type: null, query: '' },
    sort: { key: 'createdAt', dir: 'desc' },
    gridPage: 1,
    gridPageSize: DEFAULT_PAGE_SIZE,
    highlightId: null,
  };
  const EMPTY_FILTER = { status: 'all', type: null, query: '' };
  let highlightTimer = null;

  // ---- layout ----------------------------------------------------------------
  rootEl.classList.add('ads');
  const topbarActions = h('div', { class: 'ads-topbar__actions' });
  const dashboardHost = h('div', { class: 'ads-page', 'data-page': 'dashboard' });
  const createHost = h('div', { class: 'ads-page ads-page--narrow', 'data-page': 'new', hidden: true });
  const editHost = h('div', { class: 'ads-page ads-page--narrow', 'data-page': 'edit', hidden: true });
  const storageWarning = h('p', { class: 'ads-banner ads-banner--warning', hidden: true, role: 'alert' }, 'Changes could not be saved — your browser storage may be full or blocked.');

  rootEl.append(
    h(
      'header',
      { class: 'ads-topbar' },
      h('div', { class: 'ads-topbar__brand' }, h('span', { class: 'ads-topbar__logo' }, icon('megaphone', 22)), h('h1', { class: 'ads-topbar__title' }, 'Ads Campaign Management')),
      h('nav', { class: 'ads-topbar__nav', 'aria-label': 'Campaign pages' }, pageLink('dashboard', 'Dashboard'), pageLink('new', 'Create campaign'), pageLink('edit', 'Edit campaign', { hidden: true })),
      topbarActions,
    ),
    storageWarning,
    h('main', { class: 'ads-layout' }, dashboardHost, createHost, editHost),
    h('footer', { class: 'ads-footer' }, 'Campaigns are stored locally in your browser, separately from your expenses and tasks.'),
  );

  const toaster = createToaster(rootEl);

  function pageLink(page, label, { hidden = false } = {}) {
    // The "Edit campaign" link only appears while a campaign is being edited
    // (it re-opens that campaign).
    return h('button', { type: 'button', class: 'ads-topbar__link', 'data-page-link': page, hidden, onclick: () => navigate(page, page === 'edit' ? { id: ui.editingId } : undefined) }, label);
  }

  // ---- display currency ------------------------------------------------------
  // A display preference: amounts are stored as minor units and are never
  // converted, the currency only changes how they are labelled.
  const currencySelect = h(
    'select',
    {
      class: 'ads-currency',
      'aria-label': 'Display currency',
      'data-testid': 'ads-currency',
      title: 'Display currency — amounts are shown in this currency, not converted',
      onchange: () => {
        if (!isCurrency(currencySelect.value)) return;
        store.setPreferences({ currency: currencySelect.value });
        toaster.show(`Showing amounts in ${CURRENCIES.find((c) => c.code === currencySelect.value)?.label || currencySelect.value}`, { duration: 2500 });
        render();
      },
    },
    ...CURRENCIES.map((c) => h('option', { value: c.code }, c.label)),
  );
  topbarActions.append(h('label', { class: 'ads-currency-wrap', title: 'Display currency — amounts are shown in this currency, not converted' }, icon('banknote', 14), currencySelect));

  // ---- sample data toggle ----------------------------------------------------
  const sampleLabel = h('span', {}, 'Load sample data');
  const sampleBtn = h(
    'button',
    {
      type: 'button',
      class: 'ads-btn ads-btn--sm ads-sample-toggle',
      'data-testid': 'ads-sample-data-toggle',
      'aria-pressed': 'false',
      title: 'Adds sample campaigns with 90 days of performance. Click again to remove them.',
      onclick: () => {
        const hasMock = store.getState().campaigns.some(isMockCampaign);
        try {
          if (hasMock) {
            const removed = store.removeCampaignsWhere(isMockCampaign);
            toaster.show(`Removed ${removed.length} sample campaigns`, { duration: 3000 });
          } else {
            const added = store.addCampaigns(generateMockCampaigns({ now: now() }));
            toaster.show(`Added ${added.length} sample campaigns with 90 days of performance`, { tone: 'success', duration: 3500 });
          }
        } catch (err) {
          toaster.show(err.message || 'Could not update sample data', { tone: 'error' });
        }
        ui.filter = { ...EMPTY_FILTER };
        ui.gridPage = 1;
        render();
      },
    },
    icon('database', 16),
    sampleLabel,
  );
  topbarActions.append(sampleBtn);

  // ---- dummy data toggle -----------------------------------------------------
  // Placeholder campaigns at volume (every value says "Dummy"), for trying out
  // pagination, sorting and filtering. Independent of the realistic sample data.
  const dummyLabel = h('span', {}, 'Create dummy data');
  const dummyBtn = h(
    'button',
    {
      type: 'button',
      class: 'ads-btn ads-btn--sm ads-dummy-toggle',
      'data-testid': 'ads-dummy-data-toggle',
      'aria-pressed': 'false',
      title: 'Fills the grid with placeholder campaigns (every value labelled "Dummy"). Click again to remove them.',
      onclick: () => {
        const hasDummy = store.getState().campaigns.some(isDummyCampaign);
        try {
          if (hasDummy) {
            const removed = store.removeCampaignsWhere(isDummyCampaign);
            toaster.show(`Removed ${removed.length} dummy campaigns`, { duration: 3000 });
          } else {
            const added = store.addCampaigns(generateDummyCampaigns({ now: now() }));
            toaster.show(`Created ${added.length} dummy campaigns`, { tone: 'success', duration: 3500 });
          }
        } catch (err) {
          toaster.show(err.message || 'Could not update dummy data', { tone: 'error' });
        }
        ui.filter = { ...EMPTY_FILTER };
        ui.gridPage = 1;
        render();
      },
    },
    icon('layers', 16),
    dummyLabel,
  );
  topbarActions.append(dummyBtn);

  // ---- dashboard -------------------------------------------------------------
  const toolbar = h('div', { class: 'ads-toolbar' });
  const periodSelector = createPeriodSelector(toolbar, {
    onChange: (period) => {
      ui.period = period;
      render();
    },
  });
  toolbar.append(h('button', { type: 'button', class: 'ads-btn ads-btn--primary', 'data-testid': 'ads-new-campaign', onclick: () => navigate('new') }, icon('plus', 16), h('span', {}, 'Create campaign')));
  dashboardHost.append(toolbar);

  const summaryCards = createSummaryCards(dashboardHost);
  const chart = createPerformanceChart(dashboardHost, {
    onMetricsChange: (metrics) => {
      ui.chartMetrics = metrics;
      render();
    },
  });
  const grid = createCampaignGrid(dashboardHost, {
    onSort: (sort) => {
      ui.sort = sort;
      ui.gridPage = 1;
      render();
    },
    onFilter: (patch) => {
      ui.filter = { ...ui.filter, ...patch };
      ui.gridPage = 1;
      render();
    },
    onPage: (page) => {
      ui.gridPage = page;
      render();
    },
    onPageSize: (size) => {
      if (!isPageSize(size)) return;
      ui.gridPage = pageAfterResize(ui.gridPage, ui.gridPageSize, size);
      ui.gridPageSize = size;
      render();
    },
    onDuplicate: (id) => {
      try {
        const copy = store.duplicateCampaign(id);
        // Show the copy where it lands: clear filters, newest first, jump to its page.
        ui.filter = { ...EMPTY_FILTER };
        ui.sort = { key: 'createdAt', dir: 'desc' };
        setHighlight(copy.id);
        render();
        toaster.show(`Duplicated as “${copy.name}” (paused)`, { tone: 'success', action: 'Edit', actionIcon: 'edit', onAction: () => navigate('edit', { id: copy.id }), duration: 6000 });
      } catch (err) {
        toaster.show(err.message || 'Could not duplicate campaign', { tone: 'error' });
      }
    },
    onArchive: (id) => {
      try {
        const previous = store.getState().campaigns.find((c) => c.id === id)?.status;
        const c = store.archiveCampaign(id);
        render();
        toaster.show(`Archived “${c.name}”`, {
          action: 'Undo',
          onAction: () => {
            store.setStatus(id, previous === 'archived' ? 'paused' : previous);
            render();
          },
          duration: 6000,
        });
      } catch (err) {
        toaster.show(err.message || 'Could not archive campaign', { tone: 'error' });
      }
    },
    onUnarchive: (id) => {
      try {
        const c = store.unarchiveCampaign(id);
        render();
        toaster.show(`Unarchived “${c.name}” — it is paused until you resume it`, { tone: 'success', duration: 3500 });
      } catch (err) {
        toaster.show(err.message || 'Could not unarchive campaign', { tone: 'error' });
      }
    },
    onToggleStatus: (id) => {
      try {
        const c = store.toggleStatus(id);
        render();
        toaster.show(c.status === 'paused' ? `Paused “${c.name}”` : `Resumed “${c.name}”`, { tone: c.status === 'active' ? 'success' : 'neutral', duration: 2500 });
      } catch (err) {
        toaster.show(err.message || 'Could not update campaign', { tone: 'error' });
      }
    },
    onDelete: (id) => {
      const removed = store.deleteCampaign(id);
      if (!removed) return;
      render();
      toaster.show(`Deleted “${removed.name}”`, {
        action: 'Undo',
        onAction: () => {
          store.restoreCampaign(removed);
          render();
        },
        duration: 6000,
      });
    },
    onCreate: () => navigate('new'),
    onEdit: (id) => navigate('edit', { id }),
  });

  // ---- create / edit pages ---------------------------------------------------
  // One product picker serves both forms; it hands the result to whichever
  // form opened it.
  let pickerTarget = null;
  const picker = createProductPicker(rootEl, { onConfirm: (products) => pickerTarget?.setProducts(products) });
  const openPicker = (target) => (current) => {
    pickerTarget = target;
    picker.open(current);
  };

  const form = createCampaignForm(createHost, {
    mode: 'create',
    onAddProducts: (current) => openPicker(form)(current),
    onSubmit: (payload) => {
      try {
        const campaign = store.addCampaign(payload);
        // Make sure the new campaign is actually visible on the dashboard:
        // clear the filters, sort newest first and highlight the row.
        ui.filter = { ...EMPTY_FILTER };
        ui.sort = { key: 'createdAt', dir: 'desc' };
        setHighlight(campaign.id);
        render();
        toaster.show(`Campaign “${campaign.name}” created`, { tone: 'success', duration: 3500 });
        navigate('dashboard');
        return true;
      } catch (err) {
        toaster.show(err.message || 'Could not save campaign', { tone: 'error' });
        return false;
      }
    },
    onCancel: () => navigate('dashboard'),
  });

  const editForm = createCampaignForm(editHost, {
    mode: 'edit',
    onAddProducts: (current) => openPicker(editForm)(current),
    onSubmit: (payload, campaign) => {
      try {
        const updated = store.updateCampaign(campaign.id, payload);
        // Archived campaigns are hidden by the default filter: follow it there.
        ui.filter = { ...EMPTY_FILTER, status: updated.status === 'archived' ? 'archived' : 'all' };
        setHighlight(updated.id);
        render();
        toaster.show(`Campaign “${updated.name}” updated`, { tone: 'success', duration: 3500 });
        navigate('dashboard');
        return true;
      } catch (err) {
        toaster.show(err.message || 'Could not save changes', { tone: 'error' });
        return false;
      }
    },
    onCancel: () => navigate('dashboard'),
  });
  // Shown in place of the form when the id in the URL matches no campaign.
  const notFound = h(
    'section',
    { class: 'ads-panel ads-not-found', 'data-testid': 'ads-edit-not-found', hidden: true },
    icon('alert', 28),
    h('p', { class: 'ads-not-found__title' }, 'Campaign not found'),
    h('p', { class: 'ads-panel__hint' }, 'It may have been deleted, or the link is out of date.'),
    h('button', { type: 'button', class: 'ads-btn ads-btn--primary', onclick: () => navigate('dashboard') }, icon('arrowLeft', 16), h('span', {}, 'Back to dashboard')),
  );
  editHost.append(notFound);

  /**
   * Load the campaign being edited into the edit form (or show "not found").
   * `reload` forces a fresh load (opening the page discards unsaved edits);
   * otherwise the form is only reloaded when the stored record changed.
   */
  function syncEditPage({ reload = false } = {}) {
    const campaign = ui.editingId ? store.getState().campaigns.find((c) => c.id === ui.editingId) : null;
    editForm.root.hidden = !campaign;
    notFound.hidden = Boolean(campaign);
    if (campaign && (reload || editForm.campaign !== campaign)) editForm.setCampaign(campaign);
    return campaign;
  }

  function setHighlight(id) {
    clearTimeout(highlightTimer);
    ui.highlightId = id;
    highlightTimer = setTimeout(() => {
      ui.highlightId = null;
      render();
    }, HIGHLIGHT_MS);
  }

  // ---- navigation ------------------------------------------------------------
  /**
   * @param {'dashboard'|'new'|'edit'} page
   * @param {{id?: string}} [params] the campaign id for the edit page
   */
  function showPage(page, { id = null } = {}) {
    if (!PAGES.includes(page)) page = 'dashboard';
    if (page === 'edit' && !id) page = 'dashboard';
    const changed = ui.page !== page || (page === 'edit' && ui.editingId !== id);
    ui.page = page;
    ui.editingId = page === 'edit' ? id : null;
    dashboardHost.hidden = page !== 'dashboard';
    createHost.hidden = page !== 'new';
    editHost.hidden = page !== 'edit';
    for (const link of rootEl.querySelectorAll('[data-page-link]')) {
      const active = link.dataset.pageLink === page;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      if (link.dataset.pageLink === 'edit') link.hidden = page !== 'edit';
    }
    if (page === 'edit') {
      const campaign = syncEditPage({ reload: changed });
      if (changed && campaign) editForm.focus();
    }
    if (changed && page === 'new') form.focus();
    return page;
  }

  /** Switch page and let the host (if any) mirror it into the URL. */
  function navigate(page, params) {
    showPage(page, params);
    onNavigate?.(ui.page, ui.page === 'edit' ? { id: ui.editingId } : undefined);
  }

  // ---- render ----------------------------------------------------------------
  function render() {
    const { campaigns, preferences } = store.getState();
    const { currency } = preferences;
    const today = todayKey(now());
    currencySelect.value = currency;
    const range = resolvePeriod(ui.period, today);
    const previous = previousPeriod(range);

    storageWarning.hidden = !store.saveFailed;

    const hasMock = campaigns.some(isMockCampaign);
    sampleLabel.textContent = hasMock ? 'Remove sample data' : 'Load sample data';
    sampleBtn.setAttribute('aria-label', sampleLabel.textContent); // text is hidden on phones
    sampleBtn.setAttribute('aria-pressed', hasMock ? 'true' : 'false');
    sampleBtn.classList.toggle('is-active', hasMock);

    const hasDummy = campaigns.some(isDummyCampaign);
    dummyLabel.textContent = hasDummy ? 'Remove dummy data' : 'Create dummy data';
    dummyBtn.setAttribute('aria-label', dummyLabel.textContent);
    dummyBtn.setAttribute('aria-pressed', hasDummy ? 'true' : 'false');
    dummyBtn.classList.toggle('is-active', hasDummy);

    // The campaign being edited may have changed or vanished underneath us
    // (e.g. sample data removed while editing a sample campaign).
    if (ui.page === 'edit') syncEditPage();

    periodSelector.update({ period: ui.period, range, today });
    form.update({ today, currency });
    editForm.update({ today, currency });
    picker.update({ currency });

    // Cards, chart and grid all describe the same set of campaigns: the ones
    // that pass the grid's filters, over the selected period.
    const visible = filterCampaigns(campaigns, ui.filter);
    const totals = summarizeCampaigns(visible, range);
    summaryCards.update({ totals, previous: summarizeCampaigns(visible, previous), campaignCount: visible.length, currency });
    chart.update({ series: dailySeries(visible, range), metrics: ui.chartMetrics, range, hasCampaigns: campaigns.length > 0, currency });
    const rows = sortCampaignRows(
      visible.map((campaign) => ({ campaign, metrics: summarizeCampaign(campaign, range) })),
      ui.sort,
    );
    // A highlighted (just created / duplicated / edited) campaign must be on the page shown.
    if (ui.highlightId) {
      const index = rows.findIndex((r) => r.campaign.id === ui.highlightId);
      if (index >= 0) ui.gridPage = pageOfIndex(index, ui.gridPageSize);
    }
    grid.update({
      rows,
      sort: ui.sort,
      filter: ui.filter,
      page: ui.gridPage,
      pageSize: ui.gridPageSize,
      totals,
      range,
      today,
      highlightId: ui.highlightId,
      hasAnyCampaigns: campaigns.length > 0,
      archivedCount: countArchived(campaigns),
      currency,
    });
  }

  render();
  showPage('dashboard');

  return {
    render,
    showPage,
    store,
    /** Exposed for tests. */
    get ui() {
      return { ...ui, period: { ...ui.period }, filter: { ...ui.filter }, sort: { ...ui.sort }, chartMetrics: [...ui.chartMetrics] };
    },
  };
}
