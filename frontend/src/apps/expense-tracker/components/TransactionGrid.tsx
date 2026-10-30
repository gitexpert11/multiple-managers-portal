import { Icon } from '@shared/ui/Icon';
import { formatDay, monthLabel } from '../lib/dates';
import { formatMoney } from '../lib/money';
import type { Category, GridSort, GridSortKey, Transaction, TxType } from '../types';

interface Column {
  key: GridSortKey | 'actions';
  label: string;
  sortable?: boolean;
  numeric?: boolean;
  srOnly?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'date', label: 'Date', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  { key: 'description', label: 'Description', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true, numeric: true },
  { key: 'actions', label: 'Actions', srOnly: true },
];

const COPY: Record<TxType, { title: string; noun: string; total: string }> = {
  expense: { title: 'Expense transactions', noun: 'expense', total: 'Total expenses' },
  income: { title: 'Income transactions', noun: 'income', total: 'Total income' },
};

interface TransactionGridProps {
  type: TxType;
  transactions: Transaction[];
  categories: Category[];
  month: string;
  selectedCategory: Category | null;
  sort: GridSort;
  currency: string;
  locale: string;
  editingId?: string | null;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSort: (sort: GridSort) => void;
  onSelectCategory: (categoryId: string | null) => void;
}

/**
 * Grid of one transaction type for the selected month, optionally filtered to
 * one category. Supports column sorting, inline edit/delete, and a responsive
 * card layout on narrow screens (pure CSS, see components.css).
 */
export function TransactionGrid({ type, transactions, categories, month, selectedCategory, sort, currency, locale, editingId = null, onEdit, onDelete, onSort, onSelectCategory }: TransactionGridProps) {
  const copy = COPY[type];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const fmt = (cents: number, signed: boolean) => formatMoney(cents, { currency, locale, signed });
  const total = transactions.reduce((a, t) => a + t.amount, 0);

  return (
    <section className={`panel grid-panel grid-panel--${type}`} data-testid={`grid-${type}`}>
      <div className="panel__head">
        <div>
          <h2 className="panel__title">{copy.title}</h2>
          <p className="panel__hint">
            {monthLabel(month)} · {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        {selectedCategory && (
          <div className="filter-chip">
            <span className="swatch" style={{ background: selectedCategory.color }} />
            <span>{selectedCategory.name}</span>
            <button type="button" className="filter-chip__clear" aria-label="Show all categories" onClick={() => onSelectCategory(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>

      {transactions.length === 0 ? (
        <p className="empty-state">
          {selectedCategory ? `No ${selectedCategory.name} ${copy.noun} transactions in ${monthLabel(month)}.` : `No ${copy.noun} transactions in ${monthLabel(month)}. Add one using the form above.`}
        </p>
      ) : (
        <div className="grid-scroll">
          <table className="grid" aria-label={copy.title}>
            <thead>
              <tr>
                {COLUMNS.map((col) => {
                  const active = sort.key === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className={[col.numeric && 'is-numeric', col.srOnly && 'sr-only-head'].filter(Boolean).join(' ')}
                      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : undefined}
                    >
                      {col.sortable ? (
                        <button type="button" className={`grid__sort${active ? ' is-active' : ''}`} onClick={() => onSort({ key: col.key as GridSortKey, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}>
                          {col.label}
                          <span className="grid__sort-arrow" aria-hidden="true">
                            {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      ) : (
                        <span className={col.srOnly ? 'sr-only' : ''}>{col.label}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const cat = catById.get(t.categoryId);
                const isIncome = t.type === 'income';
                return (
                  <tr key={t.id} className={`grid__row grid__row--${t.type}${t.id === editingId ? ' is-editing' : ''}`} data-id={t.id}>
                    <td data-label="Date">
                      <time dateTime={t.date}>{formatDay(t.date, locale)}</time>
                    </td>
                    <td data-label="Category">
                      <button type="button" className="category-pill" title={`Filter by ${cat ? cat.name : 'Uncategorized'}`} onClick={() => onSelectCategory(t.categoryId)}>
                        <span className="swatch" style={{ background: cat ? cat.color : '#9ca3af' }} />
                        {cat ? cat.name : 'Uncategorized'}
                      </button>
                    </td>
                    <td data-label="Description" className="grid__desc">
                      {t.description || <span className="muted">—</span>}
                    </td>
                    <td data-label="Amount" className={`is-numeric amount amount--${t.type}`}>
                      {fmt(isIncome ? t.amount : -t.amount, true)}
                    </td>
                    <td className="grid__actions">
                      <button type="button" className="icon-btn icon-btn--sm" aria-label={`Edit ${t.description || 'transaction'}`} onClick={() => onEdit(t.id)}>
                        <Icon name="edit" size={16} />
                      </button>
                      <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" aria-label={`Delete ${t.description || 'transaction'}`} onClick={() => onDelete(t.id)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{selectedCategory ? `Total for ${selectedCategory.name}` : copy.total}</td>
                <td className={`is-numeric amount amount--${type}`}>{fmt(type === 'income' ? total : -total, true)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
