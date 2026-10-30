import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransactionGrid } from '../src/ui/transactionGrid.js';

const categories = [
  { id: 'cat_salary', name: 'Salary', type: 'income', color: '#22c55e' },
  { id: 'cat_freelance', name: 'Freelance', type: 'income', color: '#10b981' },
];

const tx = (over) => ({ id: 'x', type: 'income', amount: 100000, categoryId: 'cat_salary', description: '', date: '2025-03-10', createdAt: 1, ...over });
const list = [
  tx({ id: 'a', description: 'March salary', amount: 400000, date: '2025-03-01' }),
  tx({ id: 'b', description: 'Logo design', amount: 80000, categoryId: 'cat_freelance', date: '2025-03-10' }),
  tx({ id: 'c', description: '', amount: 20000, categoryId: 'ghost', date: '2025-03-12' }),
];

const base = { transactions: list, categories, month: '2025-03', selectedCategory: null, sort: { key: 'date', dir: 'desc' }, currency: 'USD', locale: 'en-US' };

let host;
let handlers;
let grid;
const rows = () => [...host.querySelectorAll('tbody tr.grid__row')];

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onSort: vi.fn(), onSelectCategory: vi.fn() };
  grid = createTransactionGrid(host, { type: 'income', ...handlers });
});

afterEach(() => host.remove());

describe('income transaction grid component', () => {
  it('renders income-specific title, label and test hooks', () => {
    expect(host.querySelector('[data-testid=grid-income]')).toBeTruthy();
    expect(host.querySelector('.grid-panel--income')).toBeTruthy();
    expect(host.querySelector('.panel__title').textContent).toBe('Income transactions');
    expect(host.querySelector('table').getAttribute('aria-label')).toBe('Income transactions');
  });

  it('renders rows with positive signed amounts and income styling', () => {
    grid.update(base);
    expect(rows()).toHaveLength(3);
    expect(host.querySelector('.panel__hint').textContent).toBe('March 2025 · 3 entries');
    const first = rows()[0];
    expect(first.classList.contains('grid__row--income')).toBe(true);
    // The grid is a pure renderer: rows appear in the order supplied (the app sorts).
    expect(rows().map((r) => r.dataset.id)).toEqual(['a', 'b', 'c']);
    expect(rows().map((r) => r.querySelector('.amount').textContent)).toEqual(['+$4,000.00', '+$800.00', '+$200.00']);
    for (const r of rows()) expect(r.querySelector('.amount').classList.contains('amount--income')).toBe(true);
    expect(first.querySelector('time').getAttribute('datetime')).toBe('2025-03-01');
    expect(first.querySelector('time').textContent).toBe('Mar 1');
  });

  it('shows a dash for an empty description and "Uncategorized" for an unknown category', () => {
    grid.update(base);
    const ghost = rows().find((r) => r.dataset.id === 'c');
    expect(ghost.querySelector('.grid__desc').textContent).toBe('—');
    expect(ghost.querySelector('.category-pill').textContent).toBe('Uncategorized');
  });

  it('shows "Total income" in the footer with the summed amount', () => {
    grid.update(base);
    const foot = host.querySelector('tfoot');
    expect(foot.textContent).toContain('Total income');
    expect(foot.querySelector('.amount').textContent).toBe('+$5,000.00');
    expect(foot.querySelector('.amount').classList.contains('amount--income')).toBe(true);
  });

  it('renders the filter chip and per-category total when a category is selected', () => {
    grid.update({ ...base, transactions: [list[1]], selectedCategory: categories[1] });
    const chip = host.querySelector('.filter-chip');
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toContain('Freelance');
    expect(host.querySelector('tfoot').textContent).toContain('Total for Freelance');
    expect(host.querySelector('tfoot .amount').textContent).toBe('+$800.00');

    chip.querySelector('.filter-chip__clear').click();
    expect(handlers.onSelectCategory).toHaveBeenCalledWith(null);
  });

  it('shows income-specific empty states', () => {
    grid.update({ ...base, transactions: [] });
    const empty = host.querySelector('.empty-state');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('No income transactions in March 2025. Add one using the form above.');
    expect(host.querySelector('table').hidden).toBe(true);
    expect(host.querySelector('tbody').children).toHaveLength(0);

    grid.update({ ...base, transactions: [], selectedCategory: categories[0] });
    expect(empty.textContent).toBe('No Salary income transactions in March 2025.');
  });

  it('recovers from the empty state when data arrives', () => {
    grid.update({ ...base, transactions: [] });
    grid.update(base);
    expect(host.querySelector('table').hidden).toBe(false);
    expect(host.querySelector('.empty-state').hidden).toBe(true);
    expect(rows()).toHaveLength(3);
  });

  it('wires edit, delete and category-pill actions with the right ids', () => {
    grid.update(base);
    const row = rows().find((r) => r.dataset.id === 'b');
    row.querySelector('[aria-label="Edit Logo design"]').click();
    expect(handlers.onEdit).toHaveBeenCalledWith('b');
    row.querySelector('[aria-label="Delete Logo design"]').click();
    expect(handlers.onDelete).toHaveBeenCalledWith('b');
    row.querySelector('.category-pill').click();
    expect(handlers.onSelectCategory).toHaveBeenCalledWith('cat_freelance');
    // Accessible names fall back when there is no description.
    const ghost = rows().find((r) => r.dataset.id === 'c');
    expect(ghost.querySelector('[aria-label="Edit transaction"]')).toBeTruthy();
    expect(ghost.querySelector('[aria-label="Delete transaction"]')).toBeTruthy();
  });

  it('highlights the row being edited', () => {
    grid.update({ ...base, editingId: 'a' });
    expect(rows().find((r) => r.dataset.id === 'a').classList.contains('is-editing')).toBe(true);
    expect(rows().filter((r) => r.classList.contains('is-editing'))).toHaveLength(1);
  });

  it('renders sortable headers reflecting the current sort and requests the next direction', () => {
    grid.update(base);
    const dateTh = host.querySelector('th[aria-sort="descending"]');
    expect(dateTh.textContent).toContain('Date');
    const amountBtn = [...host.querySelectorAll('.grid__sort')].find((b) => b.textContent.startsWith('Amount'));
    amountBtn.click();
    expect(handlers.onSort).toHaveBeenCalledWith({ key: 'amount', dir: 'desc' });

    grid.update({ ...base, sort: { key: 'amount', dir: 'desc' } });
    [...host.querySelectorAll('.grid__sort')].find((b) => b.textContent.startsWith('Amount')).click();
    expect(handlers.onSort).toHaveBeenLastCalledWith({ key: 'amount', dir: 'asc' });
    expect(host.querySelector('th[aria-sort="descending"]').textContent).toContain('Amount');
  });

  it('formats amounts in the requested currency', () => {
    grid.update({ ...base, currency: 'EUR' });
    expect(rows()[0].querySelector('.amount').textContent).toBe('+€4,000.00');
    expect(host.querySelector('tfoot .amount').textContent).toBe('+€5,000.00');
  });

  it('uses singular "entry" for one row', () => {
    grid.update({ ...base, transactions: [list[0]] });
    expect(host.querySelector('.panel__hint').textContent).toBe('March 2025 · 1 entry');
  });
});

describe('grid type handling', () => {
  it('defaults to the expense variant with negative amounts and an expense total', () => {
    host.innerHTML = '';
    const g = createTransactionGrid(host, handlers);
    g.update({ ...base, transactions: [tx({ type: 'expense', amount: 1250, categoryId: 'cat_food' })], categories: [{ id: 'cat_food', name: 'Food', type: 'expense', color: '#f00' }] });
    expect(host.querySelector('[data-testid=grid-expense]')).toBeTruthy();
    expect(host.querySelector('.panel__title').textContent).toBe('Expense transactions');
    expect(rows()[0].querySelector('.amount').textContent).toBe('-$12.50');
    expect(host.querySelector('tfoot').textContent).toContain('Total expenses');
    expect(host.querySelector('tfoot .amount').textContent).toBe('-$12.50');
  });

  it('rejects an unknown type', () => {
    expect(() => createTransactionGrid(host, { type: 'transfer', ...handlers })).toThrow(/type/);
  });
});
