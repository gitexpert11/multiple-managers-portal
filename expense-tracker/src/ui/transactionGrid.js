import { formatDay, monthLabel } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import { h, icon, replaceChildren } from './dom.js';

const COLUMNS = [
  { key: 'date', label: 'Date', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  { key: 'description', label: 'Description', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true, numeric: true },
  { key: 'actions', label: 'Actions', srOnly: true },
];

const COPY = {
  expense: { title: 'Expense transactions', noun: 'expense', total: 'Total expenses' },
  income: { title: 'Income transactions', noun: 'income', total: 'Total income' },
};

/**
 * Grid of one transaction type for the selected month, optionally filtered to
 * one category. Supports column sorting, inline edit/delete, and a responsive
 * card layout on narrow screens (pure CSS, see components.css).
 *
 * @param {{type: 'expense'|'income', onEdit, onDelete, onSort, onSelectCategory}} opts
 */
export function createTransactionGrid(container, { type = 'expense', onEdit, onDelete, onSort, onSelectCategory }) {
  const copy = COPY[type];
  if (!copy) throw new Error('type must be "expense" or "income"');
  let sort = { key: 'date', dir: 'desc' };

  const title = h('h2', { class: 'panel__title' }, copy.title);
  const subtitle = h('p', { class: 'panel__hint' });
  const filterChip = h('div', { class: 'filter-chip', hidden: true });
  const thead = h('thead', {});
  const tbody = h('tbody', {});
  const tfoot = h('tfoot', {});
  const table = h('table', { class: 'grid', 'aria-label': copy.title }, thead, tbody, tfoot);
  const empty = h('p', { class: 'empty-state', hidden: true });

  const root = h(
    'section',
    { class: `panel grid-panel grid-panel--${type}`, 'data-testid': `grid-${type}` },
    h('div', { class: 'panel__head' }, h('div', {}, title, subtitle), filterChip),
    h('div', { class: 'grid-scroll' }, table),
    empty,
  );
  container.append(root);

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
            class: [col.numeric && 'is-numeric', col.srOnly && 'sr-only-head'].filter(Boolean).join(' '),
            'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : null,
          });
          if (col.sortable) {
            th.append(
              h(
                'button',
                {
                  type: 'button',
                  class: `grid__sort${active ? ' is-active' : ''}`,
                  onclick: () => onSort({ key: col.key, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' }),
                },
                col.label,
                h('span', { class: 'grid__sort-arrow', 'aria-hidden': 'true' }, active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'),
              ),
            );
          } else {
            th.append(h('span', { class: col.srOnly ? 'sr-only' : '' }, col.label));
          }
          return th;
        }),
      ),
    );
  }

  return {
    root,
    /**
     * @param {{transactions: object[], categories: object[], month: string,
     *          selectedCategory: object|null, sort: object, currency: string, locale: string,
     *          editingId?: string|null}} props
     */
    update({ transactions, categories, month, selectedCategory, sort: nextSort, currency, locale, editingId = null }) {
      sort = nextSort;
      const catById = new Map(categories.map((c) => [c.id, c]));
      const fmt = (cents, signed) => formatMoney(cents, { currency, locale, signed });

      subtitle.textContent = `${monthLabel(month)} · ${transactions.length} ${transactions.length === 1 ? 'entry' : 'entries'}`;

      if (selectedCategory) {
        filterChip.hidden = false;
        replaceChildren(
          filterChip,
          h('span', { class: 'swatch', style: { background: selectedCategory.color } }),
          h('span', {}, selectedCategory.name),
          h('button', { type: 'button', class: 'filter-chip__clear', 'aria-label': 'Show all categories', onclick: () => onSelectCategory(null) }, icon('x', 14)),
        );
      } else {
        filterChip.hidden = true;
      }

      renderHead();

      if (!transactions.length) {
        table.hidden = true;
        empty.hidden = false;
        empty.textContent = selectedCategory
          ? `No ${selectedCategory.name} ${copy.noun} transactions in ${monthLabel(month)}.`
          : `No ${copy.noun} transactions in ${monthLabel(month)}. Add one using the form above.`;
        replaceChildren(tbody);
        replaceChildren(tfoot);
        return;
      }
      table.hidden = false;
      empty.hidden = true;

      replaceChildren(
        tbody,
        ...transactions.map((t) => {
          const cat = catById.get(t.categoryId);
          const isIncome = t.type === 'income';
          return h(
            'tr',
            { class: `grid__row grid__row--${t.type}${t.id === editingId ? ' is-editing' : ''}`, 'data-id': t.id },
            h('td', { 'data-label': 'Date' }, h('time', { datetime: t.date }, formatDay(t.date, locale))),
            h(
              'td',
              { 'data-label': 'Category' },
              h(
                'button',
                {
                  type: 'button',
                  class: 'category-pill',
                  title: `Filter by ${cat ? cat.name : 'Uncategorized'}`,
                  onclick: () => onSelectCategory(t.categoryId),
                },
                h('span', { class: 'swatch', style: { background: cat ? cat.color : '#9ca3af' } }),
                cat ? cat.name : 'Uncategorized',
              ),
            ),
            h('td', { 'data-label': 'Description', class: 'grid__desc' }, t.description || h('span', { class: 'muted' }, '—')),
            h('td', { 'data-label': 'Amount', class: `is-numeric amount amount--${t.type}` }, fmt(isIncome ? t.amount : -t.amount, true)),
            h(
              'td',
              { class: 'grid__actions' },
              h('button', { type: 'button', class: 'icon-btn icon-btn--sm', 'aria-label': `Edit ${t.description || 'transaction'}`, onclick: () => onEdit(t.id) }, icon('edit', 16)),
              h('button', { type: 'button', class: 'icon-btn icon-btn--sm icon-btn--danger', 'aria-label': `Delete ${t.description || 'transaction'}`, onclick: () => onDelete(t.id) }, icon('trash', 16)),
            ),
          );
        }),
      );

      const total = transactions.reduce((a, t) => a + t.amount, 0);
      replaceChildren(
        tfoot,
        h(
          'tr',
          {},
          h('td', { colspan: 3 }, selectedCategory ? `Total for ${selectedCategory.name}` : copy.total),
          h('td', { class: `is-numeric amount amount--${type}` }, fmt(type === 'income' ? total : -total, true)),
          h('td', {}),
        ),
      );
    },
  };
}
