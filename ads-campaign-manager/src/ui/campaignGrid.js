import { getBidStrategy } from '../data/bidStrategies.js';
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, getCampaignType, getStatus, isArchived } from '../data/campaignTypes.js';
import { formatDay } from '../lib/dates.js';
import { formatMetric } from '../lib/metrics.js';
import { formatMoney } from '../lib/money.js';
import { DEFAULT_PAGE_SIZE, paginate } from '../lib/pagination.js';
import { h, icon, replaceChildren } from './dom.js';
import { createPager } from './pager.js';

/** Campaigns listed per page unless the user picks another size. */
export const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/** Grid columns. Metric columns use the metric id as their key so sorting is uniform. */
export const COLUMNS = [
  { key: 'name', label: 'Campaign', sortable: true, sticky: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'type', label: 'Type', sortable: true },
  { key: 'products', label: 'Products', sortable: true, numeric: true },
  { key: 'bid', label: 'Bid' },
  { key: 'startDate', label: 'Start', sortable: true },
  { key: 'endDate', label: 'End', sortable: true },
  { key: 'budget', label: 'Daily budget', sortable: true, numeric: true },
  { key: 'impressions', label: 'Impressions', sortable: true, numeric: true, metric: true },
  { key: 'clicks', label: 'Clicks', sortable: true, numeric: true, metric: true },
  { key: 'ctr', label: 'CTR', sortable: true, numeric: true, metric: true },
  { key: 'spend', label: 'Spend', sortable: true, numeric: true, metric: true },
  { key: 'cpc', label: 'CPC', sortable: true, numeric: true, metric: true },
  { key: 'conversions', label: 'Orders', sortable: true, numeric: true, metric: true },
  { key: 'sales', label: 'Sales', sortable: true, numeric: true, metric: true },
  { key: 'roas', label: 'ROAS', sortable: true, numeric: true, metric: true },
  { key: 'actions', label: 'Actions', srOnly: true },
];

/** "All" means every live (active or paused) campaign; archived ones have their own view. */
const STATUS_FILTERS = [{ id: 'all', label: 'All' }, ...CAMPAIGN_STATUSES];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Campaign grid: one row per campaign with its metadata (type, budget, bid
 * strategy, products, start date, status) and its performance over the
 * selected period. Sortable columns, search + status + type filters, a pager
 * with a rows-per-page choice (5 / 10 / 20), a totals footer covering every filtered row,
 * and per-row actions: edit (the campaign name opens the edit page too),
 * pause / resume (or unarchive), and a "More" menu with duplicate,
 * archive / unarchive and delete. Card layout on phones (CSS).
 *
 * @param {{onSort, onFilter, onPage, onPageSize, onToggleStatus, onDuplicate, onArchive, onUnarchive, onDelete, onCreate, onEdit}} opts
 */
export function createCampaignGrid(container, { onSort, onFilter, onPage, onPageSize, onToggleStatus, onDuplicate, onArchive, onUnarchive, onDelete, onCreate, onEdit }) {
  let sort = { key: 'createdAt', dir: 'desc' };
  let highlighted = null;
  let openMenu = null;

  // --- filters ----------------------------------------------------------------
  const searchInput = h('input', {
    type: 'search',
    class: 'ads-search__input',
    placeholder: 'Search campaigns or products',
    'aria-label': 'Search campaigns',
    'data-testid': 'ads-search',
    autocomplete: 'off',
    oninput: () => onFilter({ query: searchInput.value }),
  });
  const statusInputs = STATUS_FILTERS.map((s) =>
    h('input', { type: 'radio', name: 'ads-status-filter', id: `ads-status-${s.id}`, value: s.id, class: 'ads-segmented__input', checked: s.id === 'all', onchange: () => onFilter({ status: s.id }) }),
  );
  const statusGroup = h(
    'div',
    { class: 'ads-segmented', role: 'radiogroup', 'aria-label': 'Filter by status' },
    ...STATUS_FILTERS.flatMap((s, i) => [statusInputs[i], h('label', { for: `ads-status-${s.id}`, class: 'ads-segmented__label' }, s.label)]),
  );
  const typeChips = [chip(null, 'All types', null), ...CAMPAIGN_TYPES.map((t) => chip(t.id, t.label, t))];
  function chip(id, label, type) {
    return h(
      'button',
      { type: 'button', class: 'ads-chip', 'data-type': id ?? '', 'aria-pressed': 'false', style: type ? { '--chip-color': type.color } : null, onclick: () => onFilter({ type: id }) },
      type ? h('span', { class: 'ads-chip__dot', 'aria-hidden': 'true' }) : null,
      label,
    );
  }
  const typeRow = h('div', { class: 'ads-chip-row', role: 'group', 'aria-label': 'Filter by campaign type' }, ...typeChips);

  // --- table ------------------------------------------------------------------
  const subtitle = h('p', { class: 'ads-panel__hint' });
  const thead = h('thead', {});
  const tbody = h('tbody', {});
  const tfoot = h('tfoot', {});
  const table = h('table', { class: 'ads-grid', 'aria-label': 'Campaigns' }, thead, tbody, tfoot);
  const empty = h('div', { class: 'ads-empty', hidden: true });
  const pagerHost = h('div', {});
  const pager = createPager(pagerHost, { label: 'Campaign pages', onPage: (page) => onPage?.(page), onPageSize: (size) => onPageSize?.(size) });
  const root = h(
    'section',
    { class: 'ads-panel ads-grid-panel', 'data-testid': 'ads-campaigns' },
    h('div', { class: 'ads-panel__head' }, h('div', {}, h('h2', { class: 'ads-panel__title' }, 'Campaigns'), subtitle)),
    h('div', { class: 'ads-filters' }, h('label', { class: 'ads-search' }, icon('search', 15), searchInput), statusGroup, typeRow),
    h('div', { class: 'ads-grid-scroll' }, table),
    pagerHost,
    empty,
  );
  container.append(root);

  // --- row "More" menu ----------------------------------------------------------
  const doc = container.ownerDocument;
  function closeMenu() {
    if (!openMenu) return;
    openMenu.classList.remove('is-open');
    openMenu.querySelector('.ads-menu__list').hidden = true;
    openMenu.querySelector('.ads-menu__toggle').setAttribute('aria-expanded', 'false');
    openMenu = null;
  }
  doc.addEventListener('click', (e) => {
    if (openMenu && !openMenu.contains(e.target)) closeMenu();
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  function menu(c) {
    const items = [
      { action: 'duplicate', label: 'Duplicate', icon: 'copy', onclick: () => onDuplicate?.(c.id) },
      isArchived(c)
        ? { action: 'unarchive', label: 'Unarchive', icon: 'archiveRestore', onclick: () => onUnarchive?.(c.id) }
        : { action: 'archive', label: 'Archive', icon: 'archive', onclick: () => onArchive?.(c.id) },
      { action: 'delete', label: 'Delete', icon: 'trash', danger: true, onclick: () => onDelete(c.id) },
    ];
    const list = h(
      'div',
      { class: 'ads-menu__list', role: 'menu', hidden: true },
      ...items.map((item) =>
        h(
          'button',
          {
            type: 'button',
            role: 'menuitem',
            class: `ads-menu__item${item.danger ? ' ads-menu__item--danger' : ''}`,
            'data-action': item.action,
            onclick: () => {
              closeMenu();
              item.onclick();
            },
          },
          icon(item.icon, 15),
          item.label,
        ),
      ),
    );
    const toggle = h(
      'button',
      {
        type: 'button',
        class: 'ads-icon-btn ads-menu__toggle',
        'data-action': 'more',
        'aria-label': `More actions for "${c.name}"`,
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        title: 'More actions',
        onclick: () => {
          const wasOpen = openMenu === wrap;
          closeMenu();
          if (!wasOpen) {
            openMenu = wrap;
            wrap.classList.add('is-open');
            list.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
          }
        },
      },
      icon('more', 16),
    );
    const wrap = h('div', { class: 'ads-menu' }, toggle, list);
    return wrap;
  }

  function renderHead() {
    replaceChildren(
      thead,
      h(
        'tr',
        {},
        ...COLUMNS.map((col) => {
          const active = sort.key === col.key;
          const th = h('th', {
            scope: 'col',
            class: [col.numeric && 'is-numeric', col.sticky && 'is-sticky', col.srOnly && 'sr-only-head'].filter(Boolean).join(' '),
            'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : null,
          });
          if (col.sortable) {
            th.append(
              h(
                'button',
                { type: 'button', class: `ads-grid__sort${active ? ' is-active' : ''}`, 'data-sort': col.key, onclick: () => onSort({ key: col.key, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' }) },
                col.label,
                h('span', { class: 'ads-grid__sort-arrow', 'aria-hidden': 'true' }, active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'),
              ),
            );
          } else th.append(h('span', { class: col.srOnly ? 'sr-only' : '' }, col.label));
          return th;
        }),
      ),
    );
  }

  function renderRow({ campaign: c, metrics }, locale, today, currency) {
    const type = getCampaignType(c.type);
    const archived = isArchived(c);
    const served = metrics.days > 0;
    const cell = (key, content, extra = {}) => h('td', { 'data-label': COLUMNS.find((col) => col.key === key)?.label, ...extra }, content);
    const metricCell = (key) => cell(key, served ? formatMetric(key, metrics[key], { locale, currency }) : '—', { class: 'is-numeric', title: served ? null : 'No performance data in this period' });
    const ended = Boolean(c.endDate && today && c.endDate < today);

    return h(
      'tr',
      { class: `ads-grid__row${highlighted === c.id ? ' is-new' : ''}${c.status !== 'active' ? ' is-paused' : ''}${archived ? ' is-archived' : ''}`, 'data-id': c.id, 'data-status': c.status, 'data-served': served ? 'true' : 'false' },
      h(
        'td',
        { class: 'is-sticky ads-grid__campaign', 'data-label': 'Campaign' },
        h('span', { class: 'ads-grid__name' }, h('button', { type: 'button', class: 'ads-grid__name-btn', 'data-action': 'open', title: c.name, onclick: () => onEdit?.(c.id) }, c.name)),
      ),
      cell('status', h('span', { class: `ads-badge ads-badge--${c.status}` }, getStatus(c.status)?.label || c.status)),
      cell('type', h('span', { class: 'ads-type-pill', style: { '--type-color': type?.color || '#9ca3af' }, title: type?.label || c.type }, icon(type?.icon || 'tag', 12), type?.short || type?.label || c.type)),
      cell('products', String(c.products.length), { class: 'is-numeric', title: c.products.map((p) => p.name).join(', ') }),
      cell('bid', getBidStrategy(c.bidStrategy)?.label || c.bidStrategy),
      cell('startDate', formatDay(c.startDate, locale), { class: 'ads-grid__date' }),
      cell('endDate', c.endDate ? h('span', { class: ended ? 'ads-grid__ended' : null, title: ended ? 'Ended' : null }, formatDay(c.endDate, locale)) : h('span', { class: 'ads-grid__muted' }, '—'), { class: 'ads-grid__date' }),
      cell('budget', formatMoney(c.dailyBudget, { locale, currency }), { class: 'is-numeric' }),
      metricCell('impressions'),
      metricCell('clicks'),
      metricCell('ctr'),
      metricCell('spend'),
      metricCell('cpc'),
      metricCell('conversions'),
      metricCell('sales'),
      metricCell('roas'),
      h(
        'td',
        { class: 'ads-grid__actions' },
        h('button', { type: 'button', class: 'ads-icon-btn', 'data-action': 'edit', 'aria-label': `Edit "${c.name}"`, title: 'Edit campaign', onclick: () => onEdit?.(c.id) }, icon('edit', 15)),
        archived
          ? h('button', { type: 'button', class: 'ads-icon-btn', 'data-action': 'unarchive', 'aria-label': `Unarchive "${c.name}"`, title: 'Unarchive campaign', onclick: () => onUnarchive?.(c.id) }, icon('archiveRestore', 15))
          : h(
              'button',
              {
                type: 'button',
                class: 'ads-icon-btn',
                'data-action': 'toggle-status',
                'aria-label': c.status === 'active' ? `Pause "${c.name}"` : `Resume "${c.name}"`,
                title: c.status === 'active' ? 'Pause campaign' : 'Resume campaign',
                onclick: () => onToggleStatus(c.id),
              },
              icon(c.status === 'active' ? 'pause' : 'play', 15),
            ),
        menu(c),
      ),
    );
  }

  function renderFoot(rows, totals, locale, currency) {
    if (!rows.length) return replaceChildren(tfoot);
    const budget = rows.reduce((a, r) => a + r.campaign.dailyBudget, 0);
    replaceChildren(
      tfoot,
      h(
        'tr',
        {},
        h('td', { class: 'is-sticky' }, `Total · ${plural(rows.length, 'campaign')}`),
        h('td', {}, ''),
        h('td', {}, ''),
        h('td', { class: 'is-numeric', 'data-label': 'Products' }, String(rows.reduce((a, r) => a + r.campaign.products.length, 0))),
        h('td', {}, ''),
        h('td', {}, ''),
        h('td', {}, ''),
        h('td', { class: 'is-numeric', 'data-label': 'Daily budget' }, formatMoney(budget, { locale, currency })),
        ...COLUMNS.filter((c) => c.metric).map((c) => h('td', { class: 'is-numeric', 'data-label': c.label, 'data-testid': `ads-grid-total-${c.key}` }, formatMetric(c.key, totals[c.key], { locale, currency }))),
        h('td', {}, ''),
      ),
    );
  }

  return {
    root,
    /**
     * @param {{rows: {campaign: object, metrics: object}[], sort: {key: string, dir: string}, filter: object, page?: number, pageSize?: number,
     *          totals: object, range: {label: string}, today?: string, highlightId?: string|null, hasAnyCampaigns: boolean,
     *          archivedCount?: number, locale?: string, currency?: string}} props
     *   `rows` are already filtered and sorted (every page); the grid shows
     *   `page` of them, `pageSize` at a time. `totals` covers all of `rows`.
     *   `archivedCount` is how many campaigns the default filter is hiding.
     */
    update({ rows, sort: nextSort, filter, page = 1, pageSize = PAGE_SIZE, totals, range, today = '', highlightId = null, hasAnyCampaigns, archivedCount = 0, locale = 'en-US', currency }) {
      sort = nextSort || sort;
      highlighted = highlightId;
      closeMenu();
      renderHead();

      if (searchInput.value !== (filter.query || '')) searchInput.value = filter.query || '';
      statusInputs.forEach((i) => (i.checked = i.value === (filter.status || 'all')));
      for (const c of typeChips) {
        const active = (c.dataset.type || null) === (filter.type || null);
        c.setAttribute('aria-pressed', active ? 'true' : 'false');
        c.classList.toggle('is-active', active);
      }
      const filtered = Boolean(filter.query || filter.type || (filter.status && filter.status !== 'all'));
      const hiddenArchived = filter.status === 'all' && archivedCount > 0 ? ` · ${archivedCount} archived hidden` : '';
      subtitle.textContent = `${plural(rows.length, 'campaign')}${filtered ? ' matching your filters' : ''}${hiddenArchived} · performance for ${range.label}`;

      if (!rows.length) {
        table.hidden = true;
        empty.hidden = false;
        replaceChildren(
          empty,
          h('p', { class: 'ads-empty__title' }, hasAnyCampaigns ? 'No campaigns match these filters.' : 'No campaigns yet.'),
          hasAnyCampaigns
            ? h('button', { type: 'button', class: 'ads-btn ads-btn--ghost', onclick: () => onFilter({ status: 'all', type: null, query: '' }) }, 'Clear filters')
            : h('button', { type: 'button', class: 'ads-btn ads-btn--primary', 'data-testid': 'ads-create-first', onclick: () => onCreate() }, icon('plus', 16), h('span', {}, 'Create your first campaign')),
        );
        replaceChildren(tbody);
        replaceChildren(tfoot);
        pager.update({ page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
        return;
      }
      table.hidden = false;
      empty.hidden = true;
      const paged = paginate(rows, page, pageSize);
      pager.update({ ...paged, noun: 'campaigns' });
      replaceChildren(tbody, ...paged.items.map((r) => renderRow(r, locale, today, currency)));
      renderFoot(rows, totals, locale, currency);
      if (highlighted) tbody.querySelector('tr.is-new')?.scrollIntoView?.({ block: 'nearest' });
    },
  };
}
