import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeCampaign, summarizeCampaigns } from '../src/lib/metrics.js';
import { COLUMNS, PAGE_SIZE, createCampaignGrid } from '../src/ui/campaignGrid.js';

const range = { from: '2025-03-10', to: '2025-03-15', days: 6, label: 'Mar 10 – Mar 15, 2025' };
const row = (date, over = {}) => ({ date, impressions: 1000, clicks: 10, spend: 500, conversions: 1, sales: 2500, ...over });
const alpha = { id: 'a', name: 'Alpha', type: 'sponsored_products', status: 'active', dailyBudget: 2500, bidStrategy: 'auto', startDate: '2025-03-01', endDate: '2025-04-30', createdAt: 1, products: [{ id: 'p1', sku: 'S1', name: 'One' }, { id: 'p2', sku: 'S2', name: 'Two' }], performance: [row('2025-03-12'), row('2025-03-13')] };
const beta = { id: 'b', name: 'Beta', type: 'sponsored_display', status: 'paused', dailyBudget: 1000, bidStrategy: 'auto', startDate: '2025-03-14', endDate: null, createdAt: 2, products: [{ id: 'p3', sku: 'S3', name: 'Three' }], performance: [] };

let host;
let handlers;
let grid;
const q = (sel) => host.querySelector(sel);
const rows = () => [...host.querySelectorAll('tbody tr')];
const props = (over = {}) => {
  const list = over.campaigns || [alpha, beta];
  return {
    rows: list.map((campaign) => ({ campaign, metrics: summarizeCampaign(campaign, range) })),
    sort: { key: 'createdAt', dir: 'desc' },
    filter: { status: 'all', type: null, query: '' },
    totals: summarizeCampaigns(list, range),
    range,
    today: '2025-03-15',
    hasAnyCampaigns: list.length > 0,
    ...over,
  };
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  handlers = { onSort: vi.fn(), onFilter: vi.fn(), onPage: vi.fn(), onPageSize: vi.fn(), onToggleStatus: vi.fn(), onDuplicate: vi.fn(), onArchive: vi.fn(), onUnarchive: vi.fn(), onDelete: vi.fn(), onCreate: vi.fn(), onEdit: vi.fn() };
  grid = createCampaignGrid(host, handlers);
});
afterEach(() => host.remove());

describe('campaign grid', () => {
  it('has metadata and performance columns', () => {
    expect(COLUMNS.map((c) => c.key)).toEqual(['name', 'status', 'type', 'products', 'bid', 'startDate', 'endDate', 'budget', 'impressions', 'clicks', 'ctr', 'spend', 'cpc', 'conversions', 'sales', 'roas', 'actions']);
    grid.update(props());
    expect([...host.querySelectorAll('thead th')].map((th) => th.textContent.replace(/[↑↓↕]/g, '').trim())).toEqual(['Campaign', 'Status', 'Type', 'Products', 'Bid', 'Start', 'End', 'Daily budget', 'Impressions', 'Clicks', 'CTR', 'Spend', 'CPC', 'Orders', 'Sales', 'ROAS', 'Actions']);
    expect(host.querySelector('thead th:nth-child(5)').getAttribute('aria-sort')).toBeNull(); // Bid is not sortable
  });

  it('renders one row per campaign: one metadata column each (name, status, type, products, bid, start, end, budget) plus the period’s metrics', () => {
    grid.update(props());
    expect(rows()).toHaveLength(2);
    const a = rows()[0];
    expect(a.dataset.id).toBe('a');
    expect(a.querySelector('.ads-grid__name').textContent).toBe('Alpha');
    expect(a.querySelector('.ads-grid__name-btn').title).toBe('Alpha'); // full name for clipped cells
    expect(a.querySelector('.ads-badge').textContent).toBe('Active');
    const cells = [...a.querySelectorAll('td')].map((td) => td.textContent.trim());
    expect(cells.slice(2, 8)).toEqual(['Products', '2', 'Auto bid', 'Mar 1, 2025', 'Apr 30, 2025', '$25.00']);
    expect(a.querySelector('.ads-type-pill').title).toBe('Sponsored Products');
    expect(a.querySelectorAll('td')[3].title).toBe('One, Two');
    expect(cells.slice(8, 16)).toEqual(['2,000', '20', '1.00%', '$10.00', '$0.50', '2', '$50.00', '5x']);
    expect(a.querySelector('[data-action=toggle-status]').getAttribute('aria-label')).toBe('Pause "Alpha"');
    // The old combined cell is gone: nothing stacked under the name.
    expect(a.querySelector('.ads-grid__meta')).toBeNull();
  });

  it('shows dashes (with a tooltip) for campaigns with no data in the period, and "—" for no end date', () => {
    grid.update(props());
    const b = rows()[1];
    expect(b.dataset.served).toBe('false');
    expect(b.classList.contains('is-paused')).toBe(true);
    expect(b.querySelector('.ads-badge').textContent).toBe('Paused');
    const metricCells = [...b.querySelectorAll('td.is-numeric')].slice(2);
    expect(metricCells.every((td) => td.textContent === '—')).toBe(true);
    expect(metricCells[0].title).toBe('No performance data in this period');
    expect(b.querySelectorAll('td')[6].textContent).toBe('—');
    expect(b.querySelector('.ads-grid__note')).toBeNull();
    expect(b.querySelector('[data-action=toggle-status]').getAttribute('aria-label')).toBe('Resume "Beta"');
  });

  it('formats budgets, money metrics and totals in the given currency', () => {
    grid.update(props({ currency: 'GBP' }));
    const cells = [...rows()[0].querySelectorAll('td')].map((td) => td.textContent.trim());
    expect(cells[7]).toBe('£25.00');
    expect(cells[11]).toBe('£10.00');
    expect(cells[12]).toBe('£0.50');
    expect(cells[9]).toBe('20'); // counts untouched
    expect(q('[data-testid=ads-grid-total-spend]').textContent).toBe('£10.00');
    expect(q('tfoot td:nth-child(8)').textContent).toBe('£35.00');
  });

  it('marks an end date that has already passed', () => {
    const ended = { ...alpha, id: 'e', endDate: '2025-03-10' };
    grid.update(props({ campaigns: [ended], today: '2025-03-15' }));
    const cell = rows()[0].querySelectorAll('td')[6];
    expect(cell.textContent).toBe('Mar 10, 2025');
    expect(cell.querySelector('.ads-grid__ended')).not.toBeNull();
    grid.update(props({ campaigns: [ended], today: '2025-03-01' }));
    expect(rows()[0].querySelectorAll('td')[6].querySelector('.ads-grid__ended')).toBeNull();
  });

  it('renders a totals footer for the visible rows', () => {
    grid.update(props());
    expect(q('tfoot td').textContent).toBe('Total · 2 campaigns');
    expect(q('[data-testid=ads-grid-total-spend]').textContent).toBe('$10.00');
    expect(q('[data-testid=ads-grid-total-roas]').textContent).toBe('5x');
    expect(q('tfoot td:nth-child(4)').textContent).toBe('3'); // products
    expect(q('tfoot td:nth-child(8)').textContent).toBe('$35.00'); // daily budget
  });

  it('row actions call back with the campaign id', () => {
    grid.update(props());
    rows()[0].querySelector('[data-action=toggle-status]').click();
    expect(handlers.onToggleStatus).toHaveBeenCalledWith('a');
    rows()[1].querySelector('[data-action=more]').click();
    rows()[1].querySelector('[data-action=delete]').click();
    expect(handlers.onDelete).toHaveBeenCalledWith('b');
  });

  it('the "More" menu offers Duplicate, Archive and Delete; it opens one at a time and closes on outside click / Escape', () => {
    grid.update(props());
    const menu = (i) => rows()[i].querySelector('.ads-menu');
    const list = (i) => menu(i).querySelector('.ads-menu__list');
    const toggle = (i) => menu(i).querySelector('[data-action=more]');
    expect(list(0).hidden).toBe(true);
    expect(toggle(0).getAttribute('aria-label')).toBe('More actions for "Alpha"');
    toggle(0).click();
    expect(list(0).hidden).toBe(false);
    expect(toggle(0).getAttribute('aria-expanded')).toBe('true');
    expect([...list(0).querySelectorAll('[role=menuitem]')].map((b) => b.textContent)).toEqual(['Duplicate', 'Archive', 'Delete']);
    // Opening another closes the first.
    toggle(1).click();
    expect(list(0).hidden).toBe(true);
    expect(list(1).hidden).toBe(false);
    // Clicking the toggle again closes it.
    toggle(1).click();
    expect(list(1).hidden).toBe(true);
    toggle(1).click();
    document.body.click();
    expect(list(1).hidden).toBe(true);
    toggle(1).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(list(1).hidden).toBe(true);
    expect(toggle(1).getAttribute('aria-expanded')).toBe('false');

    toggle(0).click();
    list(0).querySelector('[data-action=duplicate]').click();
    expect(handlers.onDuplicate).toHaveBeenCalledWith('a');
    expect(list(0).hidden).toBe(true); // closed after choosing
    toggle(0).click();
    list(0).querySelector('[data-action=archive]').click();
    expect(handlers.onArchive).toHaveBeenCalledWith('a');
  });

  it('archived campaigns get an Archived badge, an Unarchive action instead of pause/resume, and Unarchive in the menu', () => {
    const archived = { ...beta, id: 'z', name: 'Zeta', status: 'archived' };
    grid.update(props({ campaigns: [alpha, archived], filter: { status: 'archived', type: null, query: '' } }));
    const row = rows()[1];
    expect(row.classList.contains('is-archived')).toBe(true);
    expect(row.querySelector('.ads-badge').textContent).toBe('Archived');
    expect(row.querySelector('[data-action=toggle-status]')).toBeNull();
    row.querySelector('[data-action=unarchive]').click();
    expect(handlers.onUnarchive).toHaveBeenCalledWith('z');
    row.querySelector('[data-action=more]').click();
    expect([...row.querySelectorAll('[role=menuitem]')].map((b) => b.textContent)).toEqual(['Duplicate', 'Unarchive', 'Delete']);
    row.querySelector('.ads-menu__list [data-action=unarchive]').click();
    expect(handlers.onUnarchive).toHaveBeenCalledTimes(2);
    expect(q('#ads-status-archived').checked).toBe(true);
  });

  it('notes how many archived campaigns the default filter hides', () => {
    grid.update(props({ archivedCount: 3 }));
    expect(q('.ads-panel__hint').textContent).toBe('2 campaigns · 3 archived hidden · performance for Mar 10 – Mar 15, 2025');
    grid.update(props({ archivedCount: 3, filter: { status: 'archived', type: null, query: '' } }));
    expect(q('.ads-panel__hint').textContent).not.toContain('hidden');
    grid.update(props({ archivedCount: 0 }));
    expect(q('.ads-panel__hint').textContent).not.toContain('hidden');
  });

  it('pages 5 rows at a time by default; the footer still totals every filtered row', () => {
    expect(PAGE_SIZE).toBe(5);
    const many = Array.from({ length: 23 }, (_, i) => ({ ...alpha, id: `c${i}`, name: `Campaign ${String(i).padStart(2, '0')}`, createdAt: 100 - i }));
    grid.update(props({ campaigns: many, page: 1 }));
    expect(rows()).toHaveLength(5);
    expect(rows()[0].dataset.id).toBe('c0');
    expect(q('.ads-pager__summary').textContent).toBe('Showing 1–5 of 23 campaigns');
    expect(q('.ads-pager__size').value).toBe('5');
    expect(q('tfoot td').textContent).toBe('Total · 23 campaigns');
    expect(q('[data-testid=ads-grid-total-spend]').textContent).toBe('$230.00'); // 23 × $10
    q('.ads-pager [aria-label="Page 3"]').click();
    expect(handlers.onPage).toHaveBeenCalledWith(3);
    grid.update(props({ campaigns: many, page: 5 }));
    expect(rows()).toHaveLength(3);
    expect(rows()[0].dataset.id).toBe('c20');
    expect(q('.ads-pager__summary').textContent).toBe('Showing 21–23 of 23 campaigns');
    // An out-of-range page is clamped rather than showing nothing.
    grid.update(props({ campaigns: many, page: 9 }));
    expect(rows()).toHaveLength(3);
    // A single page of ≤ 5 hides the pager.
    grid.update(props());
    expect(q('.ads-pager').hidden).toBe(true);
  });

  it('rows per page can be 5, 10 or 20; the choice is reported to the parent', () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ ...alpha, id: `c${i}`, createdAt: 100 - i }));
    grid.update(props({ campaigns: many, page: 1, pageSize: 10 }));
    expect(rows()).toHaveLength(10);
    expect(q('.ads-pager__size').value).toBe('10');
    expect(q('.ads-pager__summary').textContent).toBe('Showing 1–10 of 23 campaigns');
    grid.update(props({ campaigns: many, page: 2, pageSize: 20 }));
    expect(rows()).toHaveLength(3);
    expect(q('.ads-pager__summary').textContent).toBe('Showing 21–23 of 23 campaigns');
    const select = q('.ads-pager__size');
    select.value = '5';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handlers.onPageSize).toHaveBeenCalledWith(5);
  });

  it('each row has an Edit action, and the campaign name opens the editor too', () => {
    grid.update(props());
    const edit = rows()[0].querySelector('[data-action=edit]');
    expect(edit.getAttribute('aria-label')).toBe('Edit "Alpha"');
    edit.click();
    expect(handlers.onEdit).toHaveBeenCalledWith('a');
    rows()[1].querySelector('.ads-grid__name-btn').click();
    expect(handlers.onEdit).toHaveBeenLastCalledWith('b');
    expect(handlers.onEdit).toHaveBeenCalledTimes(2);
  });

  it('sorting: clicking a header toggles direction and is reflected in aria-sort', () => {
    grid.update(props({ sort: { key: 'spend', dir: 'desc' } }));
    expect(q('[data-sort=spend]').closest('th').getAttribute('aria-sort')).toBe('descending');
    expect(q('[data-sort=spend]').textContent).toContain('↓');
    q('[data-sort=spend]').click();
    expect(handlers.onSort).toHaveBeenCalledWith({ key: 'spend', dir: 'asc' });
    q('[data-sort=name]').click();
    expect(handlers.onSort).toHaveBeenCalledWith({ key: 'name', dir: 'desc' });
    expect(q('[data-sort=name]').closest('th').getAttribute('aria-sort')).toBe('none');
  });

  it('filters: search, status and type emit patches and reflect the current filter', () => {
    grid.update(props({ filter: { status: 'paused', type: 'sponsored_display', query: 'be' } }));
    expect(q('[data-testid=ads-search]').value).toBe('be');
    expect(q('#ads-status-paused').checked).toBe(true);
    expect(q('.ads-chip[data-type=sponsored_display]').getAttribute('aria-pressed')).toBe('true');
    expect(q('.ads-chip[data-type=""]').getAttribute('aria-pressed')).toBe('false');
    expect(q('.ads-panel__hint').textContent).toBe('2 campaigns matching your filters · performance for Mar 10 – Mar 15, 2025');

    q('[data-testid=ads-search]').value = 'alp';
    q('[data-testid=ads-search]').dispatchEvent(new Event('input', { bubbles: true }));
    expect(handlers.onFilter).toHaveBeenCalledWith({ query: 'alp' });
    q('#ads-status-active').checked = true;
    q('#ads-status-active').dispatchEvent(new Event('change', { bubbles: true }));
    expect(handlers.onFilter).toHaveBeenCalledWith({ status: 'active' });
    q('.ads-chip[data-type=sponsored_brands]').click();
    expect(handlers.onFilter).toHaveBeenCalledWith({ type: 'sponsored_brands' });
    q('.ads-chip[data-type=""]').click();
    expect(handlers.onFilter).toHaveBeenCalledWith({ type: null });
  });

  it('empty states: no campaigns at all vs. nothing matching the filters', () => {
    grid.update(props({ campaigns: [], hasAnyCampaigns: false }));
    expect(q('table').hidden).toBe(true);
    expect(q('.ads-empty__title').textContent).toBe('No campaigns yet.');
    q('[data-testid=ads-create-first]').click();
    expect(handlers.onCreate).toHaveBeenCalled();

    grid.update(props({ campaigns: [], hasAnyCampaigns: true, filter: { status: 'paused', type: null, query: '' } }));
    expect(q('.ads-empty__title').textContent).toBe('No campaigns match these filters.');
    q('.ads-empty .ads-btn').click();
    expect(handlers.onFilter).toHaveBeenCalledWith({ status: 'all', type: null, query: '' });
    expect(q('tfoot').children).toHaveLength(0);

    grid.update(props());
    expect(q('table').hidden).toBe(false);
    expect(q('.ads-empty').hidden).toBe(true);
  });

  it('highlights the newly created campaign and scrolls it into view', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    grid.update(props({ highlightId: 'b' }));
    expect(rows()[1].classList.contains('is-new')).toBe(true);
    expect(rows()[0].classList.contains('is-new')).toBe(false);
    expect(spy).toHaveBeenCalled();
    grid.update(props({ highlightId: null }));
    expect(host.querySelector('tr.is-new')).toBeNull();
    spy.mockRestore();
  });
});
