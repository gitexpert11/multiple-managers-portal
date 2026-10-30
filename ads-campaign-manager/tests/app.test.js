/**
 * Integration tests: mount the real Ads Campaign Manager in jsdom and drive
 * it through the DOM — create a campaign on the create page, see it on the
 * dashboard, change the period, filter/sort/pause/delete, and reload to prove
 * persistence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdsApp } from '../src/app.js';
import { DEFAULT_DUMMY_COUNT, generateDummyCampaigns, isDummyCampaign } from '../src/data/dummyData.js';
import { generateMockCampaigns, isMockCampaign } from '../src/data/mockData.js';
import { summarizeCampaigns } from '../src/lib/metrics.js';
import { resolvePeriod } from '../src/lib/periods.js';
import { createMemoryBackend, createStorage, STORAGE_KEY } from '../src/store/storage.js';
import { createStore } from '../src/store/store.js';

const NOW = new Date(2025, 2, 15, 10); // 15 March 2025
const TODAY = '2025-03-15';

let root;
let app;
let backend;
let navigations;

function mount(options = {}) {
  root = document.createElement('div');
  document.body.append(root);
  const store = createStore({ storage: createStorage(backend), now: () => NOW });
  navigations = [];
  app = createAdsApp(root, { store, now: () => NOW, onNavigate: (p) => navigations.push(p), ...options });
  return app;
}

function q(sel) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function setValue(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Tick products in the (already open) picker, searching for each so paging never hides it. */
function tickProducts(...ids) {
  for (const id of ids) {
    setValue(q('[data-testid=ads-product-search]'), id);
    const box = q(`#ads-pick-${id}`);
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function pickProducts(...ids) {
  q('[data-testid=ads-add-products]').click();
  tickProducts(...ids);
  q('[data-testid=ads-picker-confirm]').click();
}

function createCampaign({ name, budget, type, products = ['SKU-1001'] } = {}) {
  app.showPage('new');
  if (name !== undefined) setValue(q('#campaign-name'), name);
  if (budget !== undefined) setValue(q('#campaign-budget'), budget);
  if (type) {
    const radio = q(`#campaign-type-${type}`);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (products.length) pickProducts(...products);
  q('form.ads-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

const rows = () => [...root.querySelectorAll('[data-testid=ads-campaigns] tbody tr')];
const names = () => rows().map((tr) => tr.querySelector('.ads-grid__name').textContent);
const summary = (metric) => q(`[data-testid=ads-summary-${metric}]`).textContent;
const dashboardPage = () => q('[data-page=dashboard]');
const createPage = () => q('[data-page=new]');
const editPage = () => q('[data-page=edit]');
const openEdit = (index = 0) => rows()[index].querySelector('[data-action=edit]').click();
const eSet = (sel, value) => setValue(editPage().querySelector(sel), value);
const saveEdit = () => editPage().querySelector('form.ads-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const toasts = () => [...root.querySelectorAll('.ads-toast')].map((t) => t.querySelector('.ads-toast__message').textContent);
const periodLabel = () => q('[data-testid=ads-period-label]').textContent;
const sampleBtn = () => q('[data-testid=ads-sample-data-toggle]');
const dummyBtn = () => q('[data-testid=ads-dummy-data-toggle]');
const pagerSummary = () => q('[data-testid=ads-campaigns] .ads-pager__summary').textContent;
const openMenu = (row) => row.querySelector('[data-action=more]').click();
const selectPreset = (id) => setValue(q('[data-testid=ads-period-preset]'), id);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  backend = createMemoryBackend();
  mount();
});

afterEach(() => {
  root.remove();
  vi.useRealTimers();
});

describe('layout and navigation', () => {
  it('mounts the dashboard with a period selector, summary cards, chart and campaign grid', () => {
    expect(q('.ads-topbar__title').textContent).toBe('Ads Campaign Management');
    expect(dashboardPage().hidden).toBe(false);
    expect(createPage().hidden).toBe(true);
    expect(q('[data-testid=ads-period]')).not.toBeNull();
    expect(q('[data-testid=ads-summary]').querySelectorAll('.ads-card')).toHaveLength(6);
    expect(q('[data-testid=ads-chart]')).not.toBeNull();
    expect(q('[data-testid=ads-campaigns]')).not.toBeNull();
    expect(q('[data-testid=ads-new-campaign]').textContent).toContain('Create campaign');
    expect(app.ui.period).toEqual({ preset: '30d' });
    expect(periodLabel()).toBe('Feb 14 – Mar 15, 2025 · 30 days');
  });

  it('starts empty with helpful empty states', () => {
    expect(q('[data-testid=ads-campaigns] .ads-empty__title').textContent).toBe('No campaigns yet.');
    expect(q('[data-testid=ads-chart] .ads-empty').textContent).toMatch(/Create a campaign/);
    expect(summary('spend')).toBe('$0.00');
    expect(summary('roas')).toBe('0x');
  });

  it('the Create campaign button opens the create page and reports the navigation to the host', () => {
    q('[data-testid=ads-new-campaign]').click();
    expect(app.ui.page).toBe('new');
    expect(createPage().hidden).toBe(false);
    expect(dashboardPage().hidden).toBe(true);
    expect(navigations).toEqual(['new']);
    expect(document.activeElement).toBe(q('#campaign-name'));
    expect(q('[data-page-link=new]').getAttribute('aria-current')).toBe('page');
    q('[data-testid=ads-campaign-cancel]').click();
    expect(app.ui.page).toBe('dashboard');
    expect(navigations).toEqual(['new', 'dashboard']);
  });

  it('the empty-state button and the top-bar links also switch pages; unknown pages fall back', () => {
    q('[data-testid=ads-create-first]').click();
    expect(app.ui.page).toBe('new');
    q('[data-page-link=dashboard]').click();
    expect(app.ui.page).toBe('dashboard');
    expect(app.showPage('bogus')).toBe('dashboard');
  });
});

describe('creating a campaign', () => {
  it('happy path: submit creates the campaign, returns to the dashboard and shows it highlighted at the top', () => {
    createCampaign({ name: 'Spring Sale — Headphones', budget: '45', type: 'sponsored_brands', products: ['SKU-1001', 'SKU-1002'] });

    expect(app.ui.page).toBe('dashboard');
    expect(navigations.at(-1)).toBe('dashboard');
    expect(toasts()).toContain('Campaign “Spring Sale — Headphones” created');

    const campaigns = app.store.getState().campaigns;
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]).toMatchObject({
      name: 'Spring Sale — Headphones',
      dailyBudget: 4500,
      type: 'sponsored_brands',
      bidStrategy: 'auto',
      status: 'active',
      startDate: TODAY,
      endDate: null,
      performance: [],
    });
    expect(campaigns[0].products.map((p) => p.id)).toEqual(['SKU-1001', 'SKU-1002']);

    expect(names()).toEqual(['Spring Sale — Headphones']);
    const row = rows()[0];
    expect(row.classList.contains('is-new')).toBe(true);
    expect(row.querySelector('.ads-type-pill').title).toBe('Sponsored Brands');
    expect(row.querySelectorAll('td')[3].textContent).toBe('2'); // products
    expect(row.querySelectorAll('td')[6].textContent).toBe('—'); // no end date
    expect(row.dataset.served).toBe('false');
    expect(app.ui.highlightId).toBe(campaigns[0].id);

    // The highlight fades after a few seconds.
    vi.advanceTimersByTime(5000);
    expect(rows()[0].classList.contains('is-new')).toBe(false);
    expect(app.ui.highlightId).toBeNull();

    // The form was reset for the next campaign.
    app.showPage('new');
    expect(q('#campaign-name').value).toBe('');
    expect(q('.ads-product-grid').hidden).toBe(true);
  });

  it('a new campaign is added even while filters/sort would hide it', () => {
    sampleBtn().click();
    setValue(q('[data-testid=ads-search]'), 'zzz-no-match');
    q('[data-sort=name]').click();
    expect(rows()).toHaveLength(0);
    createCampaign({ name: 'Brand new', budget: '10' });
    expect(app.ui.filter).toEqual({ status: 'all', type: null, query: '' });
    expect(app.ui.sort).toEqual({ key: 'createdAt', dir: 'desc' });
    expect(names()[0]).toBe('Brand new');
    expect(q('[data-testid=ads-search]').value).toBe('');
  });

  it('negative: validation errors keep the user on the create page and nothing is saved', () => {
    createCampaign({ name: '', budget: '', products: [] });
    expect(app.ui.page).toBe('new');
    expect(app.store.getState().campaigns).toEqual([]);
    expect(q('#campaign-name-error').textContent).toBe('Give the campaign a name');
    expect(q('#campaign-budget-error').textContent).toBe('Enter a daily budget');
    expect(q('#campaign-products-error').textContent).toBe('Add at least one product');
    expect(backend.getItem(STORAGE_KEY)).toBeNull();
  });

  it('negative: a store rejection shows an error toast and keeps the form filled', () => {
    vi.spyOn(app.store, 'addCampaign').mockImplementation(() => {
      throw new Error('Disk on fire');
    });
    createCampaign({ name: 'Doomed', budget: '10' });
    expect(app.ui.page).toBe('new');
    expect(toasts()).toContain('Disk on fire');
    expect(q('#campaign-name').value).toBe('Doomed');
  });

  it('the product picker pre-ticks products already added and removing a product updates the grid', () => {
    app.showPage('new');
    pickProducts('SKU-1001', 'SKU-2001');
    expect(root.querySelectorAll('.ads-product-grid tbody tr')).toHaveLength(2);
    q('[data-testid=ads-add-products]').click();
    expect(q('#ads-pick-SKU-1001').checked).toBe(true);
    expect(q('#ads-pick-SKU-2001').checked).toBe(true);
    const box = q('#ads-pick-SKU-1001');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    q('[data-testid=ads-picker-confirm]').click();
    expect([...root.querySelectorAll('.ads-product-grid tbody tr')].map((tr) => tr.dataset.productId)).toEqual(['SKU-2001']);
  });
});

describe('dashboard with data', () => {
  beforeEach(() => sampleBtn().click());

  it('sample data toggle adds and removes deterministic campaigns', () => {
    const mock = generateMockCampaigns({ now: NOW });
    expect(app.store.getState().campaigns.map((c) => c.id)).toEqual(mock.map((c) => c.id));
    expect(sampleBtn().getAttribute('aria-pressed')).toBe('true');
    expect(sampleBtn().textContent).toContain('Remove sample data');
    expect(toasts().at(-1)).toMatch(/Added \d+ sample campaigns/);
    sampleBtn().click();
    expect(app.store.getState().campaigns.some(isMockCampaign)).toBe(false);
    expect(sampleBtn().getAttribute('aria-pressed')).toBe('false');
  });

  it('summary cards, chart totals and grid footer all agree for the selected period', () => {
    const range = resolvePeriod({ preset: '30d' }, TODAY);
    const totals = summarizeCampaigns(app.store.getState().campaigns, range);
    expect(q('[data-testid=ads-grid-total-spend]').textContent).toBe(formatCents(totals.spend));
    expect(q('[data-testid=ads-chart-total-spend]').textContent).toBe(formatCents(totals.spend));
    expect(summary('spend').replace('K', '')).toBeTruthy();
    expect(q('[data-testid=ads-summary-spend]').title).toBe(formatCents(totals.spend));
    expect(q('[data-testid=ads-grid-total-conversions]').textContent).toBe(String(totals.conversions));
    expect(summary('conversions')).toBe(String(totals.conversions));
    expect(q('[data-testid=ads-summary-spend-change]').textContent).toMatch(/vs previous period/);
  });

  it('changing the time period re-scopes everything', () => {
    const before = q('[data-testid=ads-grid-total-spend]').textContent;
    selectPreset('7d');
    expect(app.ui.period).toEqual({ preset: '7d' });
    expect(periodLabel()).toBe('Mar 9 – Mar 15, 2025 · 7 days');
    expect(q('[data-testid=ads-grid-total-spend]').textContent).not.toBe(before);
    const week = summarizeCampaigns(app.store.getState().campaigns, resolvePeriod({ preset: '7d' }, TODAY));
    expect(q('[data-testid=ads-grid-total-spend]').textContent).toBe(formatCents(week.spend));
    expect(q('[data-testid=ads-campaigns] .ads-panel__hint').textContent).toContain('performance for Mar 9 – Mar 15, 2025');

    q('[aria-label="Previous period"]').click();
    expect(app.ui.period).toEqual({ preset: 'custom', from: '2025-03-02', to: '2025-03-08' });
    expect(q('[data-testid=ads-period-preset]').value).toBe('custom');
    expect(q('.ads-period__custom').hidden).toBe(false);

    selectPreset('lastMonth');
    expect(periodLabel()).toBe('Feb 1 – Feb 28, 2025 · 28 days');
  });

  it('a period before any campaign served shows zeros and the chart empty state', () => {
    setValue(q('[data-testid=ads-period-preset]'), 'custom');
    setValue(q('[data-testid=ads-period-from]'), '2024-01-01');
    setValue(q('[data-testid=ads-period-to]'), '2024-01-31');
    expect(periodLabel()).toBe('Jan 1 – Jan 31, 2024 · 31 days');
    expect(summary('spend')).toBe('$0.00');
    expect(q('[data-testid=ads-chart] .ads-empty').hidden).toBe(false);
    expect(q('[data-testid=ads-chart] .ads-empty').textContent).toMatch(/No performance data in this period/);
    expect(rows().every((tr) => tr.dataset.served === 'false')).toBe(true);
  });

  it('chart metric chips change what is plotted', () => {
    expect(app.ui.chartMetrics).toEqual(['spend', 'sales']);
    q('[data-testid=ads-chart] .ads-chip[data-metric=roas]').click();
    expect(app.ui.chartMetrics).toEqual(['sales', 'roas']);
    expect(q('[data-testid=ads-chart-total-roas]')).not.toBeNull();
    expect(q('[data-testid=ads-chart] .ads-chip[data-metric=spend]').getAttribute('aria-pressed')).toBe('false');
  });

  it('filters scope the cards, chart and grid together', () => {
    q('[data-testid=ads-campaigns] .ads-pager__size').value = '20';
    q('[data-testid=ads-campaigns] .ads-pager__size').dispatchEvent(new Event('change', { bubbles: true }));
    const all = app.store.getState().campaigns;
    const paused = all.filter((c) => c.status === 'paused');
    q('#ads-status-paused').checked = true;
    q('#ads-status-paused').dispatchEvent(new Event('change', { bubbles: true }));
    expect(app.ui.filter.status).toBe('paused');
    expect(rows()).toHaveLength(paused.length);
    const range = resolvePeriod({ preset: '30d' }, TODAY);
    const t = summarizeCampaigns(paused, range);
    expect(q('[data-testid=ads-grid-total-spend]').textContent).toBe(formatCents(t.spend));
    expect(q('[data-testid=ads-summary-spend]').title).toBe(formatCents(t.spend));
    expect(q('[data-testid=ads-chart-total-spend]').textContent).toBe(formatCents(t.spend));

    q('.ads-chip[data-type=sponsored_brands]').click();
    expect(rows().every((tr) => tr.querySelector('.ads-type-pill').title === 'Sponsored Brands')).toBe(true);

    setValue(q('[data-testid=ads-search]'), 'zzz');
    expect(rows()).toHaveLength(0);
    expect(q('[data-testid=ads-campaigns] .ads-empty__title').textContent).toBe('No campaigns match these filters.');
    q('[data-testid=ads-campaigns] .ads-empty .ads-btn').click(); // Clear filters
    expect(app.ui.filter).toEqual({ status: 'all', type: null, query: '' });
    expect(rows()).toHaveLength(all.length);

    // Searching by product name / SKU also works.
    setValue(q('[data-testid=ads-search]'), 'SKU-2004');
    expect(names()).toEqual(['Robot Vacuum — Display Retargeting']);
  });

  it('sorting by a column reorders the rows', () => {
    q('[data-sort=name]').click();
    expect(app.ui.sort).toEqual({ key: 'name', dir: 'desc' });
    expect(names()).toEqual([...names()].sort((a, b) => b.localeCompare(a)));
    q('[data-sort=name]').click();
    expect(app.ui.sort).toEqual({ key: 'name', dir: 'asc' });
    expect(names()).toEqual([...names()].sort((a, b) => a.localeCompare(b)));
    q('[data-sort=spend]').click();
    const spends = rows().map((tr) => Number(tr.querySelectorAll('td')[11].textContent.replace(/[^0-9.]/g, '') || 0));
    expect(spends).toEqual([...spends].sort((a, b) => b - a));
  });

  it('pause / resume from the grid', () => {
    const id = rows()[0].dataset.id;
    const name = names()[0];
    rows()[0].querySelector('[data-action=toggle-status]').click();
    expect(app.store.getState().campaigns.find((c) => c.id === id).status).toBe('paused');
    expect(toasts().at(-1)).toBe(`Paused “${name}”`);
    expect(rows()[0].querySelector('.ads-badge').textContent).toBe('Paused');
    rows()[0].querySelector('[data-action=toggle-status]').click();
    expect(app.store.getState().campaigns.find((c) => c.id === id).status).toBe('active');
    expect(toasts().at(-1)).toBe(`Resumed “${name}”`);
  });

  it('delete with undo', () => {
    q('[data-testid=ads-campaigns] .ads-pager__size').value = '20';
    q('[data-testid=ads-campaigns] .ads-pager__size').dispatchEvent(new Event('change', { bubbles: true }));
    const count = rows().length;
    expect(count).toBe(app.store.getState().campaigns.length); // all on one page
    const name = names()[0];
    openMenu(rows()[0]);
    rows()[0].querySelector('[data-action=delete]').click();
    expect(rows()).toHaveLength(count - 1);
    expect(names()).not.toContain(name);
    expect(toasts().at(-1)).toBe(`Deleted “${name}”`);
    q('.ads-toast__action').click();
    expect(rows()).toHaveLength(count);
    expect(names()).toContain(name);
  });

  it('negative: a failing status change shows an error toast', () => {
    vi.spyOn(app.store, 'toggleStatus').mockImplementation(() => {
      throw new Error('Nope');
    });
    rows()[0].querySelector('[data-action=toggle-status]').click();
    expect(toasts().at(-1)).toBe('Nope');
  });
});

describe('editing a campaign', () => {
  beforeEach(() => sampleBtn().click());

  it('the Edit action opens the edit page for that campaign, prefilled, and reports the navigation with the id', () => {
    const target = app.store.getState().campaigns.find((c) => c.id === rows()[1].dataset.id);
    openEdit(1);
    expect(app.ui.page).toBe('edit');
    expect(app.ui.editingId).toBe(target.id);
    expect(navigations.at(-1)).toBe('edit');
    expect(editPage().hidden).toBe(false);
    expect(dashboardPage().hidden).toBe(true);
    expect(q('[data-testid=ads-edit]').hidden).toBe(false);
    expect(q('[data-testid=ads-edit-not-found]').hidden).toBe(true);
    expect(q('#edit-campaign-name').value).toBe(target.name);
    expect(q('#edit-campaign-budget').value).toBe((target.dailyBudget / 100).toFixed(2));
    expect(q(`#edit-campaign-status-${target.status}`).checked).toBe(true);
    expect(editPage().querySelectorAll('.ads-product-grid tbody tr')).toHaveLength(target.products.length);
    expect(document.activeElement).toBe(q('#edit-campaign-name'));
    // The top bar shows an "Edit campaign" link only while editing.
    expect(q('[data-page-link=edit]').hidden).toBe(false);
    expect(q('[data-page-link=edit]').getAttribute('aria-current')).toBe('page');
  });

  it('clicking the campaign name also opens the editor', () => {
    const id = rows()[0].dataset.id;
    rows()[0].querySelector('.ads-grid__name-btn').click();
    expect(app.ui).toMatchObject({ page: 'edit', editingId: id });
  });

  it('happy path: saving applies the edits, keeps performance, returns to the dashboard and highlights the row', () => {
    const id = rows()[0].dataset.id;
    const before = app.store.getState().campaigns.find((c) => c.id === id);
    expect(before.performance.length).toBeGreaterThan(0);
    openEdit(0);
    expect(q('[data-testid=ads-edit-submit]').disabled).toBe(true);
    eSet('#edit-campaign-name', 'Renamed campaign');
    eSet('#edit-campaign-budget', '99');
    const paused = q('#edit-campaign-status-paused');
    paused.checked = true;
    paused.dispatchEvent(new Event('change', { bubbles: true }));
    // Add a product through the shared picker.
    q('[data-testid=ads-edit-add-products]').click();
    tickProducts('SKU-8001');
    q('[data-testid=ads-picker-confirm]').click();
    expect(q('[data-testid=ads-edit-submit]').disabled).toBe(false);
    saveEdit();

    expect(app.ui.page).toBe('dashboard');
    expect(app.ui.editingId).toBeNull();
    expect(navigations.at(-1)).toBe('dashboard');
    expect(toasts().at(-1)).toBe('Campaign “Renamed campaign” updated');
    const after = app.store.getState().campaigns.find((c) => c.id === id);
    expect(after).toMatchObject({ name: 'Renamed campaign', dailyBudget: 9900, status: 'paused', type: before.type, startDate: before.startDate, createdAt: before.createdAt });
    expect(after.products.map((p) => p.id)).toEqual([...before.products.map((p) => p.id), 'SKU-8001']);
    expect(after.performance).toEqual(before.performance);
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
    const row = rows().find((tr) => tr.dataset.id === id);
    expect(row.classList.contains('is-new')).toBe(true);
    expect(row.querySelector('.ads-grid__name').textContent).toBe('Renamed campaign');
    expect(row.querySelector('.ads-badge').textContent).toBe('Paused');
    expect(JSON.parse(backend.getItem(STORAGE_KEY)).data.campaigns.find((c) => c.id === id).name).toBe('Renamed campaign');
    expect(q('[data-page-link=edit]').hidden).toBe(true);
  });

  it('cancel discards the edits; reopening shows the stored values', () => {
    const id = rows()[0].dataset.id;
    const name = app.store.getState().campaigns.find((c) => c.id === id).name;
    openEdit(0);
    eSet('#edit-campaign-name', 'Not saved');
    q('[data-testid=ads-edit-cancel]').click();
    expect(app.ui.page).toBe('dashboard');
    expect(app.store.getState().campaigns.find((c) => c.id === id).name).toBe(name);
    rows().find((tr) => tr.dataset.id === id).querySelector('[data-action=edit]').click();
    expect(q('#edit-campaign-name').value).toBe(name);
    expect(q('[data-testid=ads-edit-submit]').disabled).toBe(true);
  });

  it('the create form and the edit form keep separate state, and the picker feeds whichever opened it', () => {
    app.showPage('new');
    setValue(q('#campaign-name'), 'Half-filled draft');
    pickProducts('SKU-1001');
    openEdit(0);
    expect(editPage().querySelectorAll('.ads-product-grid tbody tr').length).toBeGreaterThan(0);
    q('[data-testid=ads-edit-add-products]').click();
    tickProducts('SKU-8002');
    q('[data-testid=ads-picker-confirm]').click();
    expect(app.ui.page).toBe('edit');
    app.showPage('new');
    expect(q('#campaign-name').value).toBe('Half-filled draft');
    expect([...createPage().querySelectorAll('.ads-product-grid tbody tr')].map((tr) => tr.dataset.productId)).toEqual(['SKU-1001']);
  });

  it('negative: validation keeps the user on the edit page and saves nothing', () => {
    const id = rows()[0].dataset.id;
    const snapshot = backend.getItem(STORAGE_KEY);
    openEdit(0);
    eSet('#edit-campaign-name', '');
    eSet('#edit-campaign-budget', '0.10');
    saveEdit();
    expect(app.ui.page).toBe('edit');
    expect(q('#edit-campaign-name-error').textContent).toBe('Give the campaign a name');
    expect(q('#edit-campaign-budget-error').textContent).toBe('Daily budget must be at least $1.00');
    expect(backend.getItem(STORAGE_KEY)).toBe(snapshot);
    expect(app.store.getState().campaigns.find((c) => c.id === id).name).not.toBe('');
  });

  it('negative: a store rejection shows an error toast and keeps the edits on screen', () => {
    vi.spyOn(app.store, 'updateCampaign').mockImplementation(() => {
      throw new Error('Disk on fire');
    });
    openEdit(0);
    eSet('#edit-campaign-name', 'Doomed edit');
    saveEdit();
    expect(app.ui.page).toBe('edit');
    expect(toasts().at(-1)).toBe('Disk on fire');
    expect(q('#edit-campaign-name').value).toBe('Doomed edit');
  });

  it('edge: an unknown or missing id shows "campaign not found" with a way back', () => {
    app.showPage('edit', { id: 'nope' });
    expect(app.ui).toMatchObject({ page: 'edit', editingId: 'nope' });
    expect(q('[data-testid=ads-edit-not-found]').hidden).toBe(false);
    expect(q('[data-testid=ads-edit]').hidden).toBe(true);
    q('[data-testid=ads-edit-not-found] .ads-btn').click();
    expect(app.ui.page).toBe('dashboard');
    expect(navigations.at(-1)).toBe('dashboard');
    // No id at all is not an edit page.
    expect(app.showPage('edit')).toBe('dashboard');
    expect(app.ui.editingId).toBeNull();
  });

  it('edge: the campaign being edited disappearing underneath (sample data removed) turns into "not found"', () => {
    openEdit(0);
    expect(q('[data-testid=ads-edit]').hidden).toBe(false);
    sampleBtn().click(); // removes every mock campaign, including the one being edited
    expect(app.ui.page).toBe('edit');
    expect(q('[data-testid=ads-edit]').hidden).toBe(true);
    expect(q('[data-testid=ads-edit-not-found]').hidden).toBe(false);
  });

  it('the "Edit campaign" top-bar link re-opens the campaign being edited', () => {
    const id = rows()[0].dataset.id;
    openEdit(0);
    q('[data-page-link=dashboard]').click();
    expect(q('[data-page-link=edit]').hidden).toBe(true);
    openEdit(0);
    q('[data-page-link=edit]').click();
    expect(app.ui).toMatchObject({ page: 'edit', editingId: id });
  });
});

describe('dummy data', () => {
  it('the Create dummy data button fills the grid with "Dummy" campaigns, paged 5 at a time, and toggles back', () => {
    expect(dummyBtn().textContent).toContain('Create dummy data');
    dummyBtn().click();
    const campaigns = app.store.getState().campaigns;
    expect(campaigns).toHaveLength(DEFAULT_DUMMY_COUNT);
    expect(campaigns.every(isDummyCampaign)).toBe(true);
    expect(campaigns.map((c) => c.id)).toEqual(generateDummyCampaigns({ now: NOW }).map((c) => c.id));
    expect(toasts().at(-1)).toBe(`Created ${DEFAULT_DUMMY_COUNT} dummy campaigns`);
    expect(dummyBtn().textContent).toContain('Remove dummy data');
    expect(dummyBtn().getAttribute('aria-pressed')).toBe('true');

    // Every visible value is visibly a placeholder.
    expect(rows()).toHaveLength(5);
    expect(names().every((n) => /^Dummy Campaign \d{3}$/.test(n))).toBe(true);
    expect(rows()[0].querySelectorAll('td')[3].title).toMatch(/Dummy Product/);
    const live = campaigns.filter((c) => c.status !== 'archived').length;
    expect(pagerSummary()).toBe(`Showing 1–5 of ${live} campaigns`);
    expect(q('[data-testid=ads-campaigns] .ads-panel__hint').textContent).toContain(`${campaigns.length - live} archived hidden`);
    expect(q('.ads-grid tfoot td').textContent).toBe(`Total · ${live} campaigns`);
    // Searching by a dummy SKU / product name works.
    setValue(q('[data-testid=ads-search]'), 'DUMMY-0001');
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().every((tr) => /Dummy Campaign/.test(tr.querySelector('.ads-grid__name').textContent))).toBe(true);

    dummyBtn().click();
    expect(app.store.getState().campaigns).toEqual([]);
    expect(toasts().at(-1)).toBe(`Removed ${DEFAULT_DUMMY_COUNT} dummy campaigns`);
    expect(dummyBtn().getAttribute('aria-pressed')).toBe('false');
  });

  it('dummy data and sample data are independent toggles', () => {
    sampleBtn().click();
    dummyBtn().click();
    const all = app.store.getState().campaigns;
    expect(all.filter(isMockCampaign)).toHaveLength(generateMockCampaigns({ now: NOW }).length);
    expect(all.filter(isDummyCampaign)).toHaveLength(DEFAULT_DUMMY_COUNT);
    dummyBtn().click();
    expect(app.store.getState().campaigns.every(isMockCampaign)).toBe(true);
    expect(sampleBtn().getAttribute('aria-pressed')).toBe('true');
  });

  it('negative: a failing store shows an error toast', () => {
    vi.spyOn(app.store, 'addCampaigns').mockImplementation(() => {
      throw new Error('No room');
    });
    dummyBtn().click();
    expect(toasts().at(-1)).toBe('No room');
  });
});

describe('grid pagination', () => {
  beforeEach(() => dummyBtn().click());

  it('pages through the campaigns; filters and sorting reset to page 1, the period does not', () => {
    expect(app.ui.gridPage).toBe(1);
    expect(app.ui.gridPageSize).toBe(5);
    q('[data-testid=ads-campaigns] [aria-label="Next page"]').click();
    expect(app.ui.gridPage).toBe(2);
    expect(pagerSummary()).toMatch(/^Showing 6–10 of/);
    const firstOnPage2 = names()[0];
    q('[data-testid=ads-campaigns] [aria-label="Page 4"]').click();
    expect(app.ui.gridPage).toBe(4);
    expect(names()[0]).not.toBe(firstOnPage2);
    selectPreset('7d');
    expect(app.ui.gridPage).toBe(4); // same rows, different numbers
    q('[data-sort=name]').click();
    expect(app.ui.gridPage).toBe(1);
    q('[data-testid=ads-campaigns] [aria-label="Page 3"]').click();
    q('.ads-chip[data-type=sponsored_brands]').click();
    expect(app.ui.gridPage).toBe(1);
    expect(rows().every((tr) => tr.querySelector('.ads-type-pill').title === 'Sponsored Brands')).toBe(true);
  });

  it('rows per page: 5 by default, switchable to 10 or 20, keeping the first visible row', () => {
    q('[data-testid=ads-campaigns] [aria-label="Page 3"]').click(); // rows 11–15
    const firstVisible = rows()[0].dataset.id;
    const select = q('[data-testid=ads-campaigns] .ads-pager__size');
    select.value = '10';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(app.ui.gridPageSize).toBe(10);
    expect(app.ui.gridPage).toBe(2); // rows 11–20
    expect(rows()).toHaveLength(10);
    expect(rows()[0].dataset.id).toBe(firstVisible);
    expect(pagerSummary()).toMatch(/^Showing 11–20 of/);
    select.value = '20';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(rows()).toHaveLength(20);
    expect(app.ui.gridPage).toBe(1);
    select.value = '5';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(rows()).toHaveLength(5);
  });

  it('edge: a filter that leaves fewer pages than the current one clamps instead of showing an empty page', () => {
    q('[data-testid=ads-campaigns] [aria-label="Page 4"]').click();
    // Simulate the page being stale: campaigns vanish without going through onFilter's reset.
    const narrow = app.store.getState().campaigns.filter((c) => c.status !== 'archived').slice(0, 7);
    app.store.removeCampaignsWhere((c) => !narrow.includes(c));
    app.render();
    expect(rows().length).toBeGreaterThan(0);
    expect(pagerSummary()).toBe('Showing 6–7 of 7 campaigns');
  });

  it('a newly created campaign is highlighted on the page where it appears (newest first → page 1)', () => {
    q('[data-testid=ads-campaigns] [aria-label="Page 4"]').click();
    createCampaign({ name: 'Brand new', budget: '10' });
    expect(app.ui.gridPage).toBe(1);
    expect(names()[0]).toBe('Brand new');
    expect(rows()[0].classList.contains('is-new')).toBe(true);
  });

  it('saving an edit jumps to the page holding the edited campaign', () => {
    q('[data-sort=name]').click(); // Z→A
    q('[data-sort=name]').click(); // A→Z
    const id = rows()[0].dataset.id; // "Dummy Campaign 001"
    openEdit(0);
    eSet('#edit-campaign-name', 'Zzz last alphabetically');
    saveEdit();
    expect(app.ui.sort).toEqual({ key: 'name', dir: 'asc' });
    const row = rows().find((tr) => tr.dataset.id === id);
    expect(row).toBeDefined();
    expect(row.classList.contains('is-new')).toBe(true);
    expect(app.ui.gridPage).toBeGreaterThan(1);
  });
});

describe('campaign actions: duplicate / archive', () => {
  beforeEach(() => sampleBtn().click());

  it('Duplicate adds a paused copy of the campaign to the grid, highlighted, with an Edit shortcut in the toast', () => {
    const source = app.store.getState().campaigns.find((c) => c.id === rows()[2].dataset.id);
    const before = app.store.getState().campaigns.length;
    openMenu(rows()[2]);
    rows()[2].querySelector('[data-action=duplicate]').click();
    const campaigns = app.store.getState().campaigns;
    expect(campaigns).toHaveLength(before + 1);
    const copy = campaigns.at(-1);
    expect(copy).toMatchObject({ name: `Copy of ${source.name}`, dailyBudget: source.dailyBudget, type: source.type, status: 'paused', startDate: TODAY, performance: [] });
    expect(copy.endDate == null || copy.endDate >= TODAY).toBe(true);
    expect(copy.products).toEqual(source.products);
    expect(copy.id).not.toBe(source.id);
    // Shown at the top of the grid, highlighted.
    expect(names()[0]).toBe(copy.name);
    expect(rows()[0].classList.contains('is-new')).toBe(true);
    expect(rows()[0].querySelector('.ads-badge').textContent).toBe('Paused');
    expect(rows()[0].dataset.served).toBe('false');
    expect(toasts().at(-1)).toBe(`Duplicated as “${copy.name}” (paused)`);
    expect(JSON.parse(backend.getItem(STORAGE_KEY)).data.campaigns.some((c) => c.id === copy.id)).toBe(true);
    // The toast's Edit action opens the copy.
    q('.ads-toast__action').click();
    expect(app.ui).toMatchObject({ page: 'edit', editingId: copy.id });
    expect(q('#edit-campaign-name').value).toBe(copy.name);
    // Duplicating again numbers the name.
    app.showPage('dashboard');
    vi.advanceTimersByTime(1000); // a later createdAt, as in real life
    const sourceRow = rows().find((tr) => tr.dataset.id === source.id);
    openMenu(sourceRow);
    sourceRow.querySelector('[data-action=duplicate]').click();
    expect(names()[0]).toBe(`Copy of ${source.name} (2)`);
  });

  it('duplicate clears filters so the copy is visible', () => {
    setValue(q('[data-testid=ads-search]'), 'Skincare');
    expect(rows()).toHaveLength(1);
    openMenu(rows()[0]);
    rows()[0].querySelector('[data-action=duplicate]').click();
    expect(app.ui.filter).toEqual({ status: 'all', type: null, query: '' });
    expect(names()[0]).toBe('Copy of Skincare Bestsellers');
  });

  it('Archive hides the campaign from the default view, keeps its history, and can be undone', () => {
    q('[data-testid=ads-campaigns] .ads-pager__size').value = '20';
    q('[data-testid=ads-campaigns] .ads-pager__size').dispatchEvent(new Event('change', { bubbles: true }));
    const id = rows()[0].dataset.id;
    const name = names()[0];
    const before = app.store.getState().campaigns.find((c) => c.id === id);
    const count = rows().length;
    openMenu(rows()[0]);
    rows()[0].querySelector('[data-action=archive]').click();
    const after = app.store.getState().campaigns.find((c) => c.id === id);
    expect(after.status).toBe('archived');
    expect(after.performance).toEqual(before.performance);
    expect(rows()).toHaveLength(count - 1);
    expect(names()).not.toContain(name);
    expect(q('[data-testid=ads-campaigns] .ads-panel__hint').textContent).toContain('1 archived hidden');
    expect(toasts().at(-1)).toBe(`Archived “${name}”`);
    // Cards/chart follow the grid: the archived campaign's spend is no longer counted.
    const range = resolvePeriod({ preset: '30d' }, TODAY);
    const live = app.store.getState().campaigns.filter((c) => c.status !== 'archived');
    expect(q('[data-testid=ads-grid-total-spend]').textContent).toBe(formatCents(summarizeCampaigns(live, range).spend));

    // Undo restores the previous status.
    q('.ads-toast__action').click();
    expect(app.store.getState().campaigns.find((c) => c.id === id).status).toBe(before.status);
    expect(names()).toContain(name);
  });

  it('the Archived filter lists archived campaigns; Unarchive brings one back paused', () => {
    const id = rows()[0].dataset.id;
    const name = names()[0];
    openMenu(rows()[0]);
    rows()[0].querySelector('[data-action=archive]').click();
    q('#ads-status-archived').checked = true;
    q('#ads-status-archived').dispatchEvent(new Event('change', { bubbles: true }));
    expect(names()).toEqual([name]);
    expect(rows()[0].querySelector('.ads-badge').textContent).toBe('Archived');
    expect(rows()[0].querySelector('[data-action=toggle-status]')).toBeNull();
    rows()[0].querySelector('[data-action=unarchive]').click();
    expect(app.store.getState().campaigns.find((c) => c.id === id).status).toBe('paused');
    expect(toasts().at(-1)).toContain(`Unarchived “${name}”`);
    expect(rows()).toHaveLength(0); // no longer archived, and the Archived filter is still on
    expect(q('[data-testid=ads-campaigns] .ads-empty__title').textContent).toBe('No campaigns match these filters.');
  });

  it('archiving from the edit page follows the campaign into the Archived view', () => {
    const id = rows()[0].dataset.id;
    openEdit(0);
    const archived = q('#edit-campaign-status-archived');
    archived.checked = true;
    archived.dispatchEvent(new Event('change', { bubbles: true }));
    saveEdit();
    expect(app.ui.page).toBe('dashboard');
    expect(app.ui.filter.status).toBe('archived');
    expect(rows().map((tr) => tr.dataset.id)).toEqual([id]);
    expect(rows()[0].classList.contains('is-new')).toBe(true);
  });

  it('negative: failing duplicate / archive / unarchive show error toasts', () => {
    vi.spyOn(app.store, 'duplicateCampaign').mockImplementation(() => {
      throw new Error('Dup failed');
    });
    vi.spyOn(app.store, 'archiveCampaign').mockImplementation(() => {
      throw new Error('Archive failed');
    });
    vi.spyOn(app.store, 'unarchiveCampaign').mockImplementation(() => {
      throw new Error('Unarchive failed');
    });
    openMenu(rows()[0]);
    rows()[0].querySelector('[data-action=duplicate]').click();
    expect(toasts().at(-1)).toBe('Dup failed');
    openMenu(rows()[0]);
    rows()[0].querySelector('[data-action=archive]').click();
    expect(toasts().at(-1)).toBe('Archive failed');
    app.store.setStatus(rows()[0].dataset.id, 'archived');
    q('#ads-status-archived').checked = true;
    q('#ads-status-archived').dispatchEvent(new Event('change', { bubbles: true }));
    rows()[0].querySelector('[data-action=unarchive]').click();
    expect(toasts().at(-1)).toBe('Unarchive failed');
  });
});

describe('display currency', () => {
  it('defaults to USD and offers the supported currencies in the top bar', () => {
    const select = q('[data-testid=ads-currency]');
    expect(select.value).toBe('USD');
    expect([...select.options].map((o) => o.value)).toEqual(['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'BRL']);
    expect(summary('spend')).toBe('$0.00');
  });

  it('re-labels every amount — cards, chart totals, grid, budget field, product prices — without converting, and persists the choice', () => {
    sampleBtn().click();
    const spendBefore = q('[data-testid=ads-summary-spend]').title; // "$9,245.06"-style exact value
    const digits = (t) => t.replace(/[^0-9.,]/g, '');
    setValue(q('[data-testid=ads-currency]'), 'EUR');
    expect(app.store.getState().preferences.currency).toBe('EUR');
    expect(toasts().at(-1)).toBe('Showing amounts in Euro (€)');
    expect(q('[data-testid=ads-summary-spend]').title.startsWith('€')).toBe(true);
    expect(digits(q('[data-testid=ads-summary-spend]').title)).toBe(digits(spendBefore)); // same number, new label
    expect(q('[data-testid=ads-summary-spend-secondary]').textContent).toMatch(/^CPC €/);
    expect(q('[data-testid=ads-chart-total-spend]').textContent.startsWith('€')).toBe(true);
    expect(q('[data-testid=ads-grid-total-spend]').textContent.startsWith('€')).toBe(true);
    expect(rows()[0].querySelectorAll('td')[7].textContent.startsWith('€')).toBe(true); // daily budget
    expect(rows()[0].querySelectorAll('td')[11].textContent.startsWith('€')).toBe(true); // spend
    // Create page: prefix, hint and product prices.
    app.showPage('new');
    expect(q('[data-testid=ads-create] .ads-money__prefix').textContent).toBe('€');
    expect(q('#campaign-budget-hint').textContent).toBe('Spent per day at most. Minimum €1.00.');
    pickProducts('SKU-1001');
    expect(q('.ads-product-grid tbody td.is-numeric').textContent).toBe('€149.99');
    q('[data-testid=ads-add-products]').click();
    expect(q('.ads-product__price').textContent.startsWith('€')).toBe(true);
    q('[data-testid=ads-picker-confirm]').click();
    // Validation messages use it too.
    setValue(q('#campaign-name'), 'x');
    setValue(q('#campaign-budget'), '0.5');
    q('form.ads-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(q('#campaign-budget-error').textContent).toBe('Daily budget must be at least €1.00');
    // Edit page follows as well.
    app.showPage('dashboard');
    openEdit(0);
    expect(q('[data-testid=ads-edit] .ads-money__prefix').textContent).toBe('€');

    // Persisted under the app's own key and restored on reload.
    expect(JSON.parse(backend.getItem(STORAGE_KEY)).data.preferences).toEqual({ currency: 'EUR' });
    root.remove();
    mount();
    expect(q('[data-testid=ads-currency]').value).toBe('EUR');
    expect(q('[data-testid=ads-summary-spend]').textContent.startsWith('€')).toBe(true);
  });

  it('handles code-style and zero-decimal currencies', () => {
    sampleBtn().click();
    setValue(q('[data-testid=ads-currency]'), 'CHF');
    expect(q('[data-testid=ads-grid-total-spend]').textContent).toMatch(/^CHF\u00a0/);
    app.showPage('new');
    expect(q('[data-testid=ads-create] .ads-money__prefix').textContent).toBe('CHF');
    expect(q('#campaign-budget').classList.contains('ads-field__input--money-wide')).toBe(true);
    setValue(q('[data-testid=ads-currency]'), 'JPY');
    expect(q('[data-testid=ads-create] .ads-money__prefix').textContent).toBe('¥');
    expect(q('#campaign-budget').classList.contains('ads-field__input--money-wide')).toBe(false);
    expect(q('#campaign-budget-hint').textContent).toBe('Spent per day at most. Minimum ¥1.');
  });

  it('negative: an unknown value in the select is ignored', () => {
    const select = q('[data-testid=ads-currency]');
    const junk = document.createElement('option');
    junk.value = 'XXX';
    select.append(junk);
    setValue(select, 'XXX');
    expect(app.store.getState().preferences.currency).toBe('USD');
  });
});

describe('persistence', () => {
  it('campaigns survive a reload under the app’s own key', () => {
    createCampaign({ name: 'Persist me', budget: '30' });
    expect(JSON.parse(backend.getItem(STORAGE_KEY)).data.campaigns.map((c) => c.name)).toEqual(['Persist me']);
    root.remove();
    mount();
    expect(names()).toEqual(['Persist me']);
    expect(app.ui.page).toBe('dashboard');
  });

  it('keeps transient UI state (period, filters, page) out of storage', () => {
    dummyBtn().click();
    selectPreset('7d');
    q('[data-testid=ads-campaigns] [aria-label="Page 2"]').click();
    q('[data-testid=ads-campaigns] .ads-pager__size').value = '20';
    q('[data-testid=ads-campaigns] .ads-pager__size').dispatchEvent(new Event('change', { bubbles: true }));
    q('#ads-status-paused').checked = true;
    q('#ads-status-paused').dispatchEvent(new Event('change', { bubbles: true }));
    root.remove();
    mount();
    expect(app.ui.period).toEqual({ preset: '30d' });
    expect(app.ui.gridPage).toBe(1);
    expect(app.ui.gridPageSize).toBe(5);
    expect(app.ui.filter).toEqual({ status: 'all', type: null, query: '' });
    expect(JSON.parse(backend.getItem(STORAGE_KEY)).data).toEqual({ campaigns: expect.any(Array), preferences: { currency: 'USD' } });
  });

  it('shows a banner when saving fails', () => {
    const bad = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    root.remove();
    root = document.createElement('div');
    document.body.append(root);
    app = createAdsApp(root, { store: createStore({ storage: createStorage(bad), now: () => NOW }), now: () => NOW });
    expect(q('.ads-banner--warning').hidden).toBe(true);
    createCampaign({ name: 'Unsaved', budget: '10' });
    expect(q('.ads-banner--warning').hidden).toBe(false);
    expect(names()).toEqual(['Unsaved']); // still works in memory
  });
});

function formatCents(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
