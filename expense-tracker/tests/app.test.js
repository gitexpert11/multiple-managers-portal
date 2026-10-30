/**
 * Integration tests: mount the real app in jsdom and drive it through the DOM.
 * Chart.js needs a 2D canvas, which jsdom doesn't provide; the chart component
 * degrades to its HTML legend, so the selection behaviour is still exercised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { generateMockTransactions, isMockTransaction } from '../src/data/mockData.js';
import { createMemoryBackend, createStorage } from '../src/store/storage.js';
import { createStore } from '../src/store/store.js';

const NOW = new Date(2025, 2, 15); // 15 March 2025

let root;
let app;
let backend;

function mount() {
  root = document.createElement('div');
  document.body.append(root);
  const store = createStore({ storage: createStorage(backend) });
  app = createApp(root, { store, now: () => NOW });
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

function submitForm() {
  q('form.tx-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function addTx({ type = 'expense', amount, category, description = '', date } = {}) {
  const radio = q(`#tx-type-${type}`);
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  if (category) setValue(q('#tx-category'), category);
  if (date) setValue(q('#tx-date'), date);
  setValue(q('#tx-description'), description);
  setValue(q('#tx-amount'), amount);
  submitForm();
}

// There is one chart and one grid per transaction type; scope queries to them.
const panel = (kind, type) => q(`[data-testid=${kind}-${type}]`);
const rows = (type = 'expense') => [...panel('grid', type).querySelectorAll('tbody tr.grid__row')];
const allRows = () => [...rows('expense'), ...rows('income')];
const legendItems = (type) => [...panel('chart', type).querySelectorAll('.chart-legend__item:not(.chart-legend__item--all)')];
const legendItem = (type, id) => panel('chart', type).querySelector(`.chart-legend__item[data-category-id="${id}"]`);
const legendAll = (type) => panel('chart', type).querySelector('.chart-legend__item--all');
const chip = (type) => panel('grid', type).querySelector('.filter-chip');
const footer = (type) => panel('grid', type).querySelector('tfoot').textContent;
const summary = (kind) => q(`[data-testid=summary-${kind}]`).textContent;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  backend = createMemoryBackend();
  mount();
});

afterEach(() => {
  root.remove();
  vi.useRealTimers();
});

describe('initial render', () => {
  it('opens on the current month with empty summary', () => {
    expect(q('.month-picker__label').textContent).toBe('March 2025');
    expect(summary('income')).toBe('$0.00');
    expect(summary('expenses')).toBe('$0.00');
    expect(summary('remaining')).toBe('$0.00');
    expect(panel('grid', 'expense').querySelector('.empty-state').hidden).toBe(false);
    expect(panel('grid', 'income').querySelector('.empty-state').hidden).toBe(false);
  });

  it('renders a chart and a grid for each transaction type', () => {
    expect(panel('chart', 'expense').querySelector('.panel__title').textContent).toBe('Spending by category');
    expect(panel('chart', 'income').querySelector('.panel__title').textContent).toBe('Income by category');
    expect(panel('grid', 'expense').querySelector('.panel__title').textContent).toBe('Expense transactions');
    expect(panel('grid', 'income').querySelector('.panel__title').textContent).toBe('Income transactions');
    // Expenses first, income second, in both the chart column and the grids.
    expect(panel('chart', 'expense').compareDocumentPosition(panel('chart', 'income')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel('grid', 'expense').compareDocumentPosition(panel('grid', 'income')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('pre-fills the form with today, expense type and the default category', () => {
    expect(q('#tx-date').value).toBe('2025-03-15');
    expect(q('#tx-type-expense').checked).toBe(true);
    expect(q('#tx-category').value).toBe('cat_food');
  });
});

describe('adding transactions', () => {
  it('adds an expense with just an amount (everything else defaulted)', () => {
    setValue(q('#tx-amount'), '12.50');
    submitForm();

    expect(summary('expenses')).toBe('$12.50');
    expect(summary('remaining')).toBe('-$12.50');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Food & Dining');
    expect(rows()[0].querySelector('.amount').textContent).toBe('-$12.50');
    // Form is ready for the next entry.
    expect(q('#tx-amount').value).toBe('');
    expect(document.activeElement).toBe(q('#tx-amount'));
  });

  it('adds income and updates all three cards', () => {
    addTx({ type: 'income', amount: '3000', category: 'cat_salary', description: 'Pay' });
    addTx({ type: 'expense', amount: '1000', category: 'cat_housing', description: 'Rent' });

    expect(summary('income')).toBe('$3,000.00');
    expect(summary('expenses')).toBe('$1,000.00');
    expect(summary('remaining')).toBe('$2,000.00');
    expect(q('.summary-card--remaining .summary-card__meta').textContent).toBe('33% of income spent');
    // Each entry lands in the grid for its own type.
    expect(rows('income')).toHaveLength(1);
    expect(rows('income')[0].textContent).toContain('Pay');
    expect(rows('expense')).toHaveLength(1);
    expect(rows('expense')[0].textContent).toContain('Rent');
  });

  it('shows a validation error for a bad amount and does not add', () => {
    setValue(q('#tx-amount'), 'abc');
    submitForm();
    expect(q('#tx-amount-error').textContent).toMatch(/positive amount/);
    expect(app.store.getState().transactions).toHaveLength(0);
  });

  it('remembers the last used category for the next entry', () => {
    addTx({ amount: '5', category: 'cat_transport' });
    expect(q('#tx-category').value).toBe('cat_transport');
    expect(app.store.getState().preferences.lastCategory.expense).toBe('cat_transport');
  });

  it('follows the transaction to its month when dated in an earlier month', () => {
    addTx({ amount: '9', date: '2025-01-05' });
    expect(q('.month-picker__label').textContent).toBe('January 2025');
    expect(rows()).toHaveLength(1);
  });

  it('rejects a future date so entries never land in an unreachable month', () => {
    expect(q('#tx-date').max).toBe('2025-03-15');
    addTx({ amount: '9', date: '2025-03-16' });
    expect(q('#tx-date-error').textContent).toBe('Date cannot be in the future');
    expect(app.store.getState().transactions).toHaveLength(0);
    expect(q('.month-picker__label').textContent).toBe('March 2025');

    // Today itself is fine, and the error clears.
    setValue(q('#tx-date'), '2025-03-15');
    submitForm();
    expect(q('#tx-date-error').textContent).toBe('');
    expect(app.store.getState().transactions).toHaveLength(1);
  });

  it('rejects a future date while editing too', () => {
    addTx({ amount: '9' });
    rows()[0].querySelector('[aria-label^="Edit"]').click();
    setValue(q('#tx-date'), '2025-04-01');
    submitForm();
    expect(q('#tx-date-error').textContent).toBe('Date cannot be in the future');
    expect(app.store.getState().transactions[0].date).toBe('2025-03-15');
  });

  it('persists to storage so a remount shows the same data', () => {
    addTx({ amount: '42', description: 'Persisted' });
    root.remove();
    mount();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Persisted');
  });

  it('creates a new category inline and selects it', () => {
    setValue(q('#tx-category'), '__new__');
    const input = q('.field__inline input');
    expect(q('.field__inline').hidden).toBe(false);
    setValue(input, 'Pets');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    const pets = app.store.getState().categories.find((c) => c.name === 'Pets');
    expect(pets).toBeTruthy();
    expect(q('#tx-category').value).toBe(pets.id);
    expect(q('.field__inline').hidden).toBe(true);
  });
});

describe('month picker', () => {
  beforeEach(() => {
    addTx({ amount: '10', date: '2025-03-01', description: 'March' });
    addTx({ amount: '20', date: '2025-02-01', description: 'Feb' });
    q('[aria-label="Next month"]').click(); // back to March after following Feb
  });

  it('navigates with prev/next and filters the grid and cards', () => {
    expect(q('.month-picker__label').textContent).toBe('March 2025');
    expect(summary('expenses')).toBe('$10.00');

    q('[aria-label="Previous month"]').click();
    expect(q('.month-picker__label').textContent).toBe('February 2025');
    expect(summary('expenses')).toBe('$20.00');
    expect(rows()[0].textContent).toContain('Feb');
  });

  it('jumps via the month and year selects', () => {
    setValue(q('select[aria-label=Year]'), '2024');
    expect(q('.month-picker__label').textContent).toBe('March 2024');
    setValue(q('select[aria-label=Month]'), '12');
    expect(q('.month-picker__label').textContent).toBe('December 2024');
    expect(rows()).toHaveLength(0);
  });

  it('offers a Today shortcut only when away from the current month', () => {
    const today = root.querySelector('.month-picker .btn');
    expect(today.hidden).toBe(true);
    q('[aria-label="Previous month"]').click();
    expect(today.hidden).toBe(false);
    today.click();
    expect(q('.month-picker__label').textContent).toBe('March 2025');
  });

  it('cannot navigate into a future month', () => {
    const next = q('[aria-label="Next month"]');
    expect(q('.month-picker__label').textContent).toBe('March 2025');
    expect(next.disabled).toBe(true);
    next.click();
    expect(q('.month-picker__label').textContent).toBe('March 2025');

    // Month select: April–December 2025 are disabled and a forced change is clamped.
    const disabled = [...q('select[aria-label=Month]').options].filter((o) => o.disabled).map((o) => Number(o.value));
    expect(disabled).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    setValue(q('select[aria-label=Month]'), '7');
    expect(q('.month-picker__label').textContent).toBe('March 2025');
    expect(app.ui.month).toBe('2025-03');

    // Year select: nothing after the current year.
    const years = [...q('select[aria-label=Year]').options].map((o) => Number(o.value));
    expect(Math.max(...years)).toBe(2025);
  });

  it('clamps when moving from a later month of a past year into the current year', () => {
    setValue(q('select[aria-label=Year]'), '2024');
    setValue(q('select[aria-label=Month]'), '11'); // November 2024
    expect(q('.month-picker__label').textContent).toBe('November 2024');
    setValue(q('select[aria-label=Year]'), '2025'); // November 2025 is in the future
    expect(q('.month-picker__label').textContent).toBe('March 2025');
    expect(q('[aria-label="Next month"]').disabled).toBe(true);
  });

  it('updates the default form date when the month changes', () => {
    q('[aria-label="Previous month"]').click();
    expect(q('#tx-date').value).toBe('2025-02-01');
    q('[aria-label="Next month"]').click();
    expect(q('#tx-date').value).toBe('2025-03-15');
  });
});

describe('expense chart & expense grid filtering', () => {
  beforeEach(() => {
    addTx({ amount: '30', category: 'cat_food', description: 'Lunch' });
    addTx({ amount: '70', category: 'cat_housing', description: 'Rent' });
    addTx({ type: 'income', amount: '500', category: 'cat_salary', description: 'Pay' });
  });

  it('lists expense categories sorted by spend with shares', () => {
    const items = legendItems('expense');
    expect(items.map((b) => b.querySelector('.chart-legend__name').textContent)).toEqual(['Housing & Rent', 'Food & Dining']);
    expect(items[0].querySelector('.chart-legend__share').textContent).toBe('70%');
    expect(panel('chart', 'expense').querySelector('.chart__center-caption').textContent).toBe('Total spent');
  });

  it('shows all expense transactions by default, and only expenses', () => {
    expect(rows('expense')).toHaveLength(2);
    expect(rows('expense').some((r) => r.textContent.includes('Pay'))).toBe(false);
    expect(chip('expense').hidden).toBe(true);
    expect(footer('expense')).toContain('Total expenses');
    expect(footer('expense')).toContain('-$100.00');
  });

  it('filters the expense grid when a category is selected and clears on second click', () => {
    legendItem('expense', 'cat_food').click();
    expect(rows('expense')).toHaveLength(1);
    expect(rows('expense')[0].textContent).toContain('Lunch');
    expect(legendItem('expense', 'cat_food').getAttribute('aria-pressed')).toBe('true');
    expect(chip('expense').textContent).toContain('Food & Dining');
    expect(footer('expense')).toContain('Total for Food & Dining');
    expect(app.ui.selectedCategory).toEqual({ expense: 'cat_food', income: null });

    legendItem('expense', 'cat_food').click();
    expect(rows('expense')).toHaveLength(2);
    expect(app.ui.selectedCategory.expense).toBeNull();
  });

  it('does not affect the income chart or grid', () => {
    legendItem('expense', 'cat_food').click();
    expect(rows('income')).toHaveLength(1);
    expect(chip('income').hidden).toBe(true);
    expect(legendAll('income').getAttribute('aria-pressed')).toBe('true');
  });

  it('clears the filter via the chip and via "All categories"', () => {
    legendItem('expense', 'cat_housing').click();
    expect(rows('expense')).toHaveLength(1);
    chip('expense').querySelector('.filter-chip__clear').click();
    expect(rows('expense')).toHaveLength(2);

    legendItem('expense', 'cat_housing').click();
    legendAll('expense').click();
    expect(rows('expense')).toHaveLength(2);
  });

  it('filters by clicking a category pill in the grid, toggling off on a second click', () => {
    rows('expense').find((r) => r.textContent.includes('Rent')).querySelector('.category-pill').click();
    expect(rows('expense')).toHaveLength(1);
    expect(chip('expense').textContent).toContain('Housing & Rent');
    rows('expense')[0].querySelector('.category-pill').click();
    expect(rows('expense')).toHaveLength(2);
  });

  it('resets the filter when the month changes', () => {
    legendItem('expense', 'cat_food').click();
    q('[aria-label="Previous month"]').click();
    q('[aria-label="Next month"]').click();
    expect(rows('expense')).toHaveLength(2);
  });
});

describe('income chart & income grid', () => {
  beforeEach(() => {
    addTx({ type: 'income', amount: '4000', category: 'cat_salary', description: 'March salary', date: '2025-03-01' });
    addTx({ type: 'income', amount: '800', category: 'cat_freelance', description: 'Logo design', date: '2025-03-10' });
    addTx({ type: 'income', amount: '200', category: 'cat_freelance', description: 'Consulting', date: '2025-03-12' });
    addTx({ type: 'expense', amount: '30', category: 'cat_food', description: 'Lunch' });
  });

  it('lists income categories sorted by amount with shares and an income caption', () => {
    const items = legendItems('income');
    expect(items.map((b) => b.querySelector('.chart-legend__name').textContent)).toEqual(['Salary', 'Freelance']);
    expect(items.map((b) => b.querySelector('.chart-legend__amount').textContent)).toEqual(['$4,000.00', '$1,000.00']);
    expect(items.map((b) => b.querySelector('.chart-legend__share').textContent)).toEqual(['80%', '20%']);
    expect(legendAll('income').querySelector('.chart-legend__amount').textContent).toBe('$5,000.00');
    expect(panel('chart', 'income').querySelector('.chart__center-value').textContent).toBe('$5,000.00');
    expect(panel('chart', 'income').querySelector('.chart__center-caption').textContent).toBe('Total earned');
  });

  it('never lists expense categories in the income chart (and vice versa)', () => {
    const incomeNames = legendItems('income').map((b) => b.querySelector('.chart-legend__name').textContent);
    expect(incomeNames).not.toContain('Food & Dining');
    const expenseNames = legendItems('expense').map((b) => b.querySelector('.chart-legend__name').textContent);
    expect(expenseNames).toEqual(['Food & Dining']);
  });

  it('shows all income transactions by default with positive amounts and an income total', () => {
    expect(rows('income')).toHaveLength(3);
    expect(rows('income').some((r) => r.textContent.includes('Lunch'))).toBe(false);
    for (const r of rows('income')) {
      expect(r.classList.contains('grid__row--income')).toBe(true);
      expect(r.querySelector('.amount').textContent.startsWith('+')).toBe(true);
      expect(r.querySelector('.amount').classList.contains('amount--income')).toBe(true);
    }
    expect(panel('grid', 'income').querySelector('.panel__hint').textContent).toBe('March 2025 · 3 entries');
    expect(footer('income')).toContain('Total income');
    expect(footer('income')).toContain('+$5,000.00');
    expect(chip('income').hidden).toBe(true);
  });

  it('filters the income grid from the income chart legend and updates the center label', () => {
    legendItem('income', 'cat_freelance').click();
    expect(rows('income')).toHaveLength(2);
    expect(rows('income').map((r) => r.querySelector('.grid__desc').textContent)).toEqual(['Consulting', 'Logo design']);
    expect(chip('income').hidden).toBe(false);
    expect(chip('income').textContent).toContain('Freelance');
    expect(footer('income')).toContain('Total for Freelance');
    expect(footer('income')).toContain('+$1,000.00');
    expect(legendItem('income', 'cat_freelance').getAttribute('aria-pressed')).toBe('true');
    expect(legendAll('income').getAttribute('aria-pressed')).toBe('false');
    expect(panel('chart', 'income').querySelector('.chart__center-value').textContent).toBe('$1,000.00');
    expect(panel('chart', 'income').querySelector('.chart__center-caption').textContent).toBe('Freelance');
    expect(app.ui.selectedCategory).toEqual({ expense: null, income: 'cat_freelance' });
  });

  it('toggles the income filter off on a second click, via the chip, and via "All categories"', () => {
    legendItem('income', 'cat_salary').click();
    expect(rows('income')).toHaveLength(1);
    legendItem('income', 'cat_salary').click();
    expect(rows('income')).toHaveLength(3);

    legendItem('income', 'cat_salary').click();
    chip('income').querySelector('.filter-chip__clear').click();
    expect(rows('income')).toHaveLength(3);
    expect(chip('income').hidden).toBe(true);

    legendItem('income', 'cat_salary').click();
    legendAll('income').click();
    expect(rows('income')).toHaveLength(3);
    expect(app.ui.selectedCategory.income).toBeNull();
  });

  it('filters by clicking a category pill inside the income grid', () => {
    rows('income').find((r) => r.textContent.includes('March salary')).querySelector('.category-pill').click();
    expect(rows('income')).toHaveLength(1);
    expect(chip('income').textContent).toContain('Salary');
    rows('income')[0].querySelector('.category-pill').click(); // toggle off
    expect(rows('income')).toHaveLength(3);
  });

  it('keeps the expense chart and grid untouched while an income filter is active', () => {
    legendItem('income', 'cat_freelance').click();
    expect(rows('expense')).toHaveLength(1);
    expect(chip('expense').hidden).toBe(true);
    expect(legendAll('expense').getAttribute('aria-pressed')).toBe('true');
  });

  it('supports independent filters on both grids at the same time', () => {
    addTx({ amount: '70', category: 'cat_housing', description: 'Rent' });
    legendItem('income', 'cat_freelance').click();
    legendItem('expense', 'cat_housing').click();
    expect(app.ui.selectedCategory).toEqual({ expense: 'cat_housing', income: 'cat_freelance' });
    expect(rows('income')).toHaveLength(2);
    expect(rows('expense')).toHaveLength(1);
    expect(chip('income').textContent).toContain('Freelance');
    expect(chip('expense').textContent).toContain('Housing & Rent');

    // Clearing one leaves the other in place.
    chip('expense').querySelector('.filter-chip__clear').click();
    expect(rows('expense')).toHaveLength(2);
    expect(rows('income')).toHaveLength(2);
    expect(chip('income').textContent).toContain('Freelance');
  });

  it('shows an income-specific empty state when a filtered category has no rows', () => {
    legendItem('income', 'cat_freelance').click();
    for (const r of rows('income')) if (r.textContent.includes('Consulting') || r.textContent.includes('Logo design')) r.querySelector('[aria-label^="Delete"]').click();
    const empty = panel('grid', 'income').querySelector('.empty-state');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('No Freelance income transactions in March 2025.');
    expect(panel('grid', 'income').querySelector('table').hidden).toBe(true);
  });

  it('shows an income empty state and hides the chart when a month has no income', () => {
    q('[aria-label="Previous month"]').click(); // February 2025: nothing
    const grid = panel('grid', 'income');
    expect(grid.querySelector('.empty-state').hidden).toBe(false);
    expect(grid.querySelector('.empty-state').textContent).toBe('No income transactions in February 2025. Add one using the form above.');
    const chart = panel('chart', 'income');
    expect(chart.querySelector('.empty-state').hidden).toBe(false);
    expect(chart.querySelector('.empty-state').textContent).toContain('No income this month yet');
    expect(chart.querySelector('.chart').hidden).toBe(true);
  });

  it('resets the income filter when the month changes', () => {
    legendItem('income', 'cat_freelance').click();
    q('[aria-label="Previous month"]').click();
    q('[aria-label="Next month"]').click();
    expect(rows('income')).toHaveLength(3);
    expect(app.ui.selectedCategory.income).toBeNull();
  });

  it('edits an income transaction from the income grid', () => {
    rows('income').find((r) => r.textContent.includes('Logo design')).querySelector('[aria-label^="Edit"]').click();
    expect(q('.tx-panel').classList.contains('tx-panel--editing')).toBe(true);
    expect(q('#tx-type-income').checked).toBe(true);
    expect(q('#tx-amount').value).toBe('800.00');
    expect(q('#tx-category').value).toBe('cat_freelance');
    expect(rows('income').find((r) => r.textContent.includes('Logo design')).classList.contains('is-editing')).toBe(true);

    setValue(q('#tx-amount'), '850');
    setValue(q('#tx-description'), 'Logo design (revised)');
    submitForm();

    expect(rows('income').map((r) => r.querySelector('.grid__desc').textContent)).toContain('Logo design (revised)');
    expect(summary('income')).toBe('$5,050.00');
    expect(legendItem('income', 'cat_freelance').querySelector('.chart-legend__amount').textContent).toBe('$1,050.00');
  });

  it('changing an income entry to an expense moves it between grids', () => {
    rows('income').find((r) => r.textContent.includes('Consulting')).querySelector('[aria-label^="Edit"]').click();
    const radio = q('#tx-type-expense');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    setValue(q('#tx-category'), 'cat_other_expense');
    submitForm();
    expect(rows('income')).toHaveLength(2);
    expect(rows('expense').some((r) => r.textContent.includes('Consulting'))).toBe(true);
    expect(summary('income')).toBe('$4,800.00');
    expect(summary('expenses')).toBe('$230.00');
  });

  it('deletes an income transaction with undo and keeps the chart in sync', () => {
    rows('income').find((r) => r.textContent.includes('March salary')).querySelector('[aria-label^="Delete"]').click();
    expect(rows('income')).toHaveLength(2);
    expect(summary('income')).toBe('$1,000.00');
    expect(legendItems('income').map((b) => b.querySelector('.chart-legend__name').textContent)).toEqual(['Freelance']);

    document.querySelector('.toast__action').click();
    expect(rows('income')).toHaveLength(3);
    expect(summary('income')).toBe('$5,000.00');
    expect(legendItems('income').map((b) => b.querySelector('.chart-legend__name').textContent)).toEqual(['Salary', 'Freelance']);
  });

  it('sorts the income grid and shares the sort preference with the expense grid', () => {
    const header = (type, label) => [...panel('grid', type).querySelectorAll('.grid__sort')].find((b) => b.textContent.startsWith(label));
    header('income', 'Amount').click(); // desc
    expect(rows('income').map((r) => r.querySelector('.grid__desc').textContent)).toEqual(['March salary', 'Logo design', 'Consulting']);
    header('income', 'Amount').click(); // asc
    expect(rows('income').map((r) => r.querySelector('.grid__desc').textContent)).toEqual(['Consulting', 'Logo design', 'March salary']);
    expect(app.store.getState().preferences.gridSort).toEqual({ key: 'amount', dir: 'asc' });
    expect(panel('grid', 'expense').querySelector('th[aria-sort="ascending"]').textContent).toContain('Amount');
  });

  it('a custom income category created inline appears in the income chart and grid', () => {
    const radio = q('#tx-type-income');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    setValue(q('#tx-category'), '__new__');
    const input = q('.field__inline input');
    setValue(input, 'Rental income');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    setValue(q('#tx-amount'), '1200');
    submitForm();

    expect(legendItems('income').map((b) => b.querySelector('.chart-legend__name').textContent)).toEqual(['Salary', 'Rental income', 'Freelance']);
    expect(rows('income')).toHaveLength(4);
    const created = app.store.getState().categories.find((c) => c.name === 'Rental income');
    expect(created.type).toBe('income');
    legendItem('income', created.id).click();
    expect(rows('income')).toHaveLength(1);
  });

  it('drops the income filter if the selected category is deleted', () => {
    const extra = app.store.addCategory({ name: 'Bonus', type: 'income' });
    app.render(); // the form's category list is refreshed on render
    addTx({ type: 'income', amount: '99', category: extra.id, description: 'Bonus' });
    legendItem('income', extra.id).click();
    expect(rows('income')).toHaveLength(1);
    app.store.deleteCategory(extra.id);
    app.render();
    expect(app.ui.selectedCategory.income).toBeNull();
    expect(rows('income')).toHaveLength(4);
    // The moved transaction is now in "Other Income".
    expect(rows('income').find((r) => r.textContent.includes('Bonus')).textContent).toContain('Other Income');
  });

  it('uses the income currency formatting in chart and grid when currency changes', () => {
    setValue(q('#pref-currency'), 'EUR');
    expect(legendAll('income').querySelector('.chart-legend__amount').textContent).toBe('€5,000.00');
    expect(rows('income')[0].querySelector('.amount').textContent).toBe('+€200.00');
    expect(footer('income')).toContain('+€5,000.00');
  });

  it('works with sample data: legend totals match the income grid total', () => {
    q('[data-testid=sample-data-toggle]').click();
    const monthIncome = app.store.getState().transactions.filter((t) => t.type === 'income' && t.date.startsWith('2025-03'));
    expect(rows('income')).toHaveLength(monthIncome.length);
    const expected = monthIncome.reduce((a, t) => a + t.amount, 0) / 100;
    expect(legendAll('income').querySelector('.chart-legend__amount').textContent).toBe(`$${expected.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  });
});

describe('editing and deleting', () => {
  beforeEach(() => {
    addTx({ amount: '30', category: 'cat_food', description: 'Lunch' });
  });

  it('edits a transaction through the form', () => {
    rows()[0].querySelector('[aria-label^="Edit"]').click();
    expect(q('.tx-panel').classList.contains('tx-panel--editing')).toBe(true);
    expect(q('#tx-amount').value).toBe('30.00');
    expect(q('#tx-description').value).toBe('Lunch');

    setValue(q('#tx-amount'), '35');
    setValue(q('#tx-description'), 'Dinner');
    submitForm();

    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Dinner');
    expect(summary('expenses')).toBe('$35.00');
    expect(q('.tx-panel').classList.contains('tx-panel--editing')).toBe(false);
  });

  it('cancels an edit without changes', () => {
    rows()[0].querySelector('[aria-label^="Edit"]').click();
    setValue(q('#tx-amount'), '999');
    root.querySelector('.tx-form__actions .btn--ghost').click();
    expect(summary('expenses')).toBe('$30.00');
    expect(q('#tx-amount').value).toBe('');
  });

  it('deletes with undo', () => {
    rows()[0].querySelector('[aria-label^="Delete"]').click();
    expect(rows()).toHaveLength(0);
    expect(summary('expenses')).toBe('$0.00');

    const undo = document.querySelector('.toast__action');
    expect(undo).toBeTruthy();
    undo.click();
    expect(rows()).toHaveLength(1);
    expect(summary('expenses')).toBe('$30.00');
  });

  it('auto-dismisses the toast', () => {
    rows()[0].querySelector('[aria-label^="Delete"]').click();
    expect(document.querySelector('.toast')).toBeTruthy();
    vi.advanceTimersByTime(7000);
    expect(document.querySelector('.toast')).toBeNull();
  });
});

describe('grid sorting', () => {
  beforeEach(() => {
    addTx({ amount: '5', description: 'small', date: '2025-03-02' });
    addTx({ amount: '50', description: 'big', date: '2025-03-01' });
  });

  it('sorts by amount and persists the preference', () => {
    // The header is re-rendered after each sort, so re-query it each time.
    const amountHeader = () => [...panel('grid', 'expense').querySelectorAll('.grid__sort')].find((b) => b.textContent.startsWith('Amount'));
    amountHeader().click(); // desc: +large first => -5 before -50
    expect(rows().map((r) => r.querySelector('.grid__desc').textContent)).toEqual(['small', 'big']);
    amountHeader().click(); // asc
    expect(rows().map((r) => r.querySelector('.grid__desc').textContent)).toEqual(['big', 'small']);
    expect(app.store.getState().preferences.gridSort).toEqual({ key: 'amount', dir: 'asc' });
    expect(panel('grid', 'expense').querySelector('th[aria-sort]').getAttribute('aria-sort')).toBe('none');
  });
});

describe('settings', () => {
  it('changes currency', () => {
    addTx({ amount: '10' });
    setValue(q('#pref-currency'), 'EUR');
    expect(summary('expenses')).toBe('€10.00');
    expect(q('.field__prefix').textContent).toBe('€');
  });

  it('no longer owns the theme: no theme control, and render() leaves <html data-theme> alone', () => {
    expect(root.querySelector('#pref-theme')).toBeNull();
    expect(q('#pref-currency')).not.toBeNull(); // the other settings are still here
    document.documentElement.setAttribute('data-theme', 'dark'); // as set by the workspace shell
    addTx({ amount: '10' }); // triggers a render
    app.render();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    document.documentElement.removeAttribute('data-theme');
  });

  it('keyboard shortcut N focuses the amount field', () => {
    q('#tx-amount').blur();
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    expect(document.activeElement).toBe(q('#tx-amount'));
  });
});

describe('sample data toggle', () => {
  const toggle = () => q('[data-testid=sample-data-toggle]');
  const mockCount = () => app.store.getState().transactions.filter(isMockTransaction).length;
  const EXPECTED = generateMockTransactions({ now: NOW });

  it('sits in the top-right actions next to settings and starts in "load" state', () => {
    const actions = q('.topbar__actions');
    expect(actions.contains(toggle())).toBe(true);
    expect(toggle().nextElementSibling.dataset.testid).toBe('export-open');
    expect(toggle().nextElementSibling.nextElementSibling.getAttribute('aria-label')).toBe('Open settings');
    expect(toggle().textContent).toBe('Load sample data');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Load sample data');
  });

  it('loads two years of sample data and switches to "remove" state', () => {
    toggle().click();
    expect(mockCount()).toBe(EXPECTED.length);
    expect(app.store.getState().transactions).toHaveLength(EXPECTED.length);
    expect(toggle().textContent).toBe('Remove sample data');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(toggle().classList.contains('is-active')).toBe(true);
    expect(document.querySelector('.toast').textContent).toContain(`Added ${EXPECTED.length} sample transactions`);
  });

  it('populates the current month dashboard: cards, chart legend and grid', () => {
    toggle().click();
    expect(q('.month-picker__label').textContent).toBe('March 2025');
    expect(summary('income')).not.toBe('$0.00');
    expect(summary('expenses')).not.toBe('$0.00');
    expect(legendItems('expense').length).toBeGreaterThan(2);
    expect(legendItems('income').length).toBeGreaterThanOrEqual(1);
    const inMonth = EXPECTED.filter((t) => t.date.startsWith('2025-03'));
    expect(rows('expense')).toHaveLength(inMonth.filter((t) => t.type === 'expense').length);
    expect(rows('income')).toHaveLength(inMonth.filter((t) => t.type === 'income').length);
  });

  it('makes the previous two years reachable in the month picker', () => {
    toggle().click();
    const years = [...q('select[aria-label=Year]').options].map((o) => Number(o.value));
    expect(years).toContain(2023);
    expect(years).toContain(2024);
    q('[aria-label="Previous month"]').click(); // February 2025
    expect(allRows().length).toBe(EXPECTED.filter((t) => t.date.startsWith('2025-02')).length);
    setValue(q('select[aria-label=Year]'), '2023');
    setValue(q('select[aria-label=Month]'), '4'); // April 2023 = oldest sample month
    expect(allRows().length).toBe(EXPECTED.filter((t) => t.date.startsWith('2023-04')).length);
    expect(allRows().length).toBeGreaterThan(0);
  });

  it('never loads anything dated after today', () => {
    toggle().click();
    for (const t of app.store.getState().transactions) expect(t.date <= '2025-03-15').toBe(true);
  });

  it('removes only the sample data and keeps user entries', () => {
    addTx({ amount: '7.77', description: 'Mine' });
    toggle().click();
    expect(app.store.getState().transactions).toHaveLength(EXPECTED.length + 1);

    toggle().click();
    expect(mockCount()).toBe(0);
    expect(app.store.getState().transactions).toHaveLength(1);
    expect(allRows()).toHaveLength(1);
    expect(rows('expense')[0].textContent).toContain('Mine');
    expect(toggle().textContent).toBe('Load sample data');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    const toasts = [...document.querySelectorAll('.toast')];
    expect(toasts.at(-1).textContent).toContain(`Removed ${EXPECTED.length} sample transactions`);
  });

  it('re-adds the same sample data on the next click (load → remove → load)', () => {
    toggle().click();
    const first = app.store.getState().transactions.filter(isMockTransaction);
    toggle().click();
    toggle().click();
    const second = app.store.getState().transactions.filter(isMockTransaction);
    expect(second).toEqual(first);
    expect(app.store.getState().transactions).toHaveLength(EXPECTED.length);
  });

  it('does not duplicate records if sample ids are already present', () => {
    toggle().click();
    // Simulate a partially-present state, e.g. user deleted a few sample rows.
    const some = app.store.getState().transactions.filter(isMockTransaction).slice(0, 5);
    for (const t of some) app.store.deleteTransaction(t.id);
    app.render();
    expect(toggle().textContent).toBe('Remove sample data'); // some still present
    toggle().click(); // removes the rest
    expect(mockCount()).toBe(0);
    toggle().click(); // full reload, including the 5 deleted ones
    expect(mockCount()).toBe(EXPECTED.length);
  });

  it('persists across a reload and restores the correct button state', () => {
    toggle().click();
    root.remove();
    mount();
    expect(toggle().textContent).toBe('Remove sample data');
    expect(mockCount()).toBe(EXPECTED.length);
    toggle().click();
    root.remove();
    mount();
    expect(toggle().textContent).toBe('Load sample data');
    expect(mockCount()).toBe(0);
  });

  it('an edited sample record is still recognised and removed', () => {
    toggle().click();
    const target = rows()[0];
    target.querySelector('[aria-label^="Edit"]').click();
    setValue(q('#tx-amount'), '1.23');
    setValue(q('#tx-description'), 'Edited sample');
    submitForm();
    const edited = app.store.getState().transactions.find((t) => t.description === 'Edited sample');
    expect(isMockTransaction(edited)).toBe(true);

    toggle().click();
    expect(app.store.getState().transactions.find((t) => t.description === 'Edited sample')).toBeUndefined();
    expect(app.store.getState().transactions).toHaveLength(0);
  });

  it('cancels an in-progress edit and clears both category filters when toggled', () => {
    toggle().click();
    legendItems('expense')[0].click();
    legendItems('income')[0].click();
    expect(chip('expense').hidden).toBe(false);
    expect(chip('income').hidden).toBe(false);
    rows('income')[0].querySelector('[aria-label^="Edit"]').click();
    expect(q('.tx-panel').classList.contains('tx-panel--editing')).toBe(true);

    toggle().click();
    expect(q('.tx-panel').classList.contains('tx-panel--editing')).toBe(false);
    expect(chip('expense').hidden).toBe(true);
    expect(chip('income').hidden).toBe(true);
    expect(app.ui.selectedCategory).toEqual({ expense: null, income: null });
    expect(app.ui.editingId).toBeNull();
  });

  it('does not change the user\'s last-used category or other preferences', () => {
    const before = JSON.stringify(app.store.getState().preferences);
    toggle().click();
    expect(JSON.stringify(app.store.getState().preferences)).toBe(before);
    toggle().click();
    expect(JSON.stringify(app.store.getState().preferences)).toBe(before);
  });

  it('sample data is included in export and survives import', () => {
    toggle().click();
    const snapshot = JSON.parse(JSON.stringify(app.store.exportData()));
    toggle().click();
    expect(mockCount()).toBe(0);
    app.store.importData(snapshot);
    app.render();
    expect(mockCount()).toBe(EXPECTED.length);
    expect(toggle().textContent).toBe('Remove sample data');
  });

  it('"Delete all data" also clears sample data and resets the button', () => {
    toggle().click();
    app.store.clearAll();
    app.render();
    expect(mockCount()).toBe(0);
    expect(toggle().textContent).toBe('Load sample data');
  });

  it('shows an error toast and leaves data untouched if loading fails', () => {
    const spy = vi.spyOn(app.store, 'addTransactions').mockImplementation(() => {
      throw new Error('Storage exploded');
    });
    toggle().click();
    expect(document.querySelector('.toast--error').textContent).toContain('Storage exploded');
    expect(app.store.getState().transactions).toHaveLength(0);
    expect(toggle().textContent).toBe('Load sample data');
    spy.mockRestore();
  });
});

describe('export flow', () => {
  const open = () => q('[data-testid=export-open]');
  const dialog = () => q('[data-testid=export-dialog]');
  const preview = () => q('[data-testid=export-preview]').textContent;
  const download = () => q('[data-testid=export-download]');
  const submitExport = () => q('form.export-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const choose = (id) => {
    const el = q(`#${id}`);
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let anchorClicks;
  let created;

  beforeEach(() => {
    anchorClicks = [];
    created = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      anchorClicks.push({ href: this.getAttribute('href'), download: this.getAttribute('download') });
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      created.push(blob);
      return `blob:mock/${created.length}`;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('has an Export button in the top-right actions, between sample data and settings', () => {
    const actions = q('.topbar__actions');
    const children = [...actions.children];
    expect(children.indexOf(open())).toBeGreaterThan(children.indexOf(q('[data-testid=sample-data-toggle]')));
    expect(children.indexOf(open())).toBeLessThan(children.indexOf(q('[aria-label="Open settings"]')));
    expect(open().textContent).toBe('Export');
    expect(dialog().open).toBe(false);
  });

  it('opens the dialog on the dashboard month with a live preview of current data', () => {
    addTx({ amount: '12.50', description: 'Lunch' });
    addTx({ type: 'income', amount: '3000', category: 'cat_salary', description: 'Pay' });
    open().click();
    expect(dialog().open).toBe(true);
    expect(q('#export-start-month').value).toBe('3');
    expect(q('#export-end-year').value).toBe('2025');
    expect(preview()).toBe('2 transactions · income $3,000.00 · expenses $12.50');
  });

  it('follows the dashboard month: navigating back then exporting defaults to that month', () => {
    addTx({ amount: '20', date: '2025-02-03', description: 'Feb' });
    q('[aria-label="Next month"]').click(); // back to March (the add followed to February)
    q('[aria-label="Previous month"]').click(); // February
    open().click();
    expect(q('#export-start-month').value).toBe('2');
    expect(preview()).toBe('1 transaction · income $0.00 · expenses $20.00');
  });

  it('downloads an Excel file and shows a toast', () => {
    addTx({ amount: '12.50' });
    open().click();
    submitExport();
    expect(anchorClicks).toHaveLength(1);
    expect(anchorClicks[0].download).toBe('expense-tracker_2025-03_all.xlsx');
    expect(anchorClicks[0].href).toBe('blob:mock/1');
    expect(created[0].type).toContain('spreadsheetml');
    expect(created[0].size).toBeGreaterThan(500);
    expect(dialog().open).toBe(false);
    expect([...document.querySelectorAll('.toast')].at(-1).textContent).toContain('Exported 1 transactions as Excel');
  });

  it('downloads a PDF of income only for a preset range', () => {
    q('[data-testid=sample-data-toggle]').click();
    open().click();
    q('[data-preset=last-3]').click();
    choose('export-type-income');
    choose('export-format-pdf');
    submitExport();
    expect(anchorClicks[0].download).toBe('expense-tracker_2025-01_to_2025-03_income.pdf');
    expect(created[0].type).toBe('application/pdf');
    const expected = app.store.getState().transactions.filter((t) => t.type === 'income' && t.date >= '2025-01' && t.date < '2025-04').length;
    expect([...document.querySelectorAll('.toast')].at(-1).textContent).toContain(`Exported ${expected} transactions as PDF`);
  });

  it('"All data" covers the whole sample range in one workbook', () => {
    q('[data-testid=sample-data-toggle]').click();
    open().click();
    q('[data-preset=all]').click();
    expect(q('#export-start-year').value).toBe('2023');
    expect(q('#export-start-month').value).toBe('4');
    submitExport();
    expect(anchorClicks[0].download).toBe('expense-tracker_2023-04_to_2025-03_all.xlsx');
    expect([...document.querySelectorAll('.toast')].at(-1).textContent).toContain(`Exported ${app.store.getState().transactions.length} transactions`);
  });

  it('blocks an invalid range and an empty range', () => {
    open().click();
    expect(preview()).toBe('No transactions in this range.');
    expect(download().disabled).toBe(true);
    submitExport();
    expect(anchorClicks).toHaveLength(0);

    addTx({ amount: '5' });
    open().click();
    const endYear = q('#export-end-year');
    endYear.value = '2024';
    endYear.dispatchEvent(new Event('change', { bubbles: true }));
    expect(q('#export-error').textContent).toMatch(/after the start/);
    expect(download().disabled).toBe(true);
    submitExport();
    expect(anchorClicks).toHaveLength(0);
    expect(dialog().open).toBe(true);
  });

  it('cannot select a future month in the export range', () => {
    open().click();
    const disabled = [...q('#export-end-month').options].filter((o) => o.disabled).map((o) => Number(o.value));
    expect(disabled).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([...q('#export-end-year').options].map((o) => Number(o.value)).at(-1)).toBe(2025);
  });

  it('uses the configured currency in the preview and file name is unaffected', () => {
    addTx({ amount: '10' });
    setValue(q('#pref-currency'), 'INR');
    open().click();
    expect(preview()).toBe('1 transaction · income ₹0.00 · expenses ₹10.00');
    submitExport();
    expect(anchorClicks[0].download).toBe('expense-tracker_2025-03_all.xlsx');
  });

  it('reflects edits made after opening once the dialog is re-opened', () => {
    addTx({ amount: '10' });
    open().click();
    expect(preview()).toBe('1 transaction · income $0.00 · expenses $10.00');
    dialog().close();
    rows('expense')[0].querySelector('[aria-label^="Delete"]').click();
    open().click();
    expect(preview()).toBe('No transactions in this range.');
  });
});

// ---------------------------------------------------------------------------
// Settings flows driven through the dialog UI (the component itself is covered
// in settings.test.js; these check what the app does with the callbacks).

if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

describe('settings dialog flows (end to end)', () => {
  const dataBtn = (label) => [...root.querySelectorAll('.dialog__actions .btn')].find((b) => b.textContent === label);
  const toastText = () => [...root.querySelectorAll('.toast')].map((t) => t.querySelector('.toast__message').textContent);
  const categoryItem = (name) => [...root.querySelectorAll('.category-list__item')].find((li) => li.querySelector('.category-list__name').textContent === name);
  const importFile = async (content) => {
    const input = q('input[type=file]');
    Object.defineProperty(input, 'files', { value: [new File([content], 'backup.json')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(input.value).toBe(''));
    await vi.advanceTimersByTimeAsync(0);
  };

  afterEach(() => vi.restoreAllMocks());

  it('positive: Export JSON downloads a full snapshot with a dated file name', () => {
    addTx({ amount: '12.50', description: 'Lunch' });
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:json');
    const clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(this.download);
    };
    try {
      dataBtn('Export JSON').click();
      expect(createUrl).toHaveBeenCalledTimes(1);
      const blob = createUrl.mock.calls[0][0];
      expect(blob.type).toBe('application/json');
      expect(clicks).toEqual(['expense-tracker-2025-03-15.json']);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('positive: importing a backup replaces the data, clears selections and edit state, and confirms with a toast', async () => {
    addTx({ amount: '5', description: 'Old' });
    legendItem('expense', 'cat_food').click(); // an active filter
    expect(chip('expense').hidden).toBe(false);
    rows()[0].querySelector('[aria-label^="Edit"]').click(); // and an edit in progress
    expect(app.ui.editingId).not.toBeNull();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const snapshot = {
      transactions: [
        { id: 'imp1', type: 'income', amount: 100000, categoryId: 'cat_salary', description: 'Imported pay', date: '2025-03-01', createdAt: 1, updatedAt: 1 },
        { id: 'imp2', type: 'expense', amount: 2000, categoryId: 'cat_transport', description: 'Imported bus', date: '2025-03-02', createdAt: 2, updatedAt: 2 },
      ],
      categories: [],
      preferences: { currency: 'EUR' },
    };
    await importFile(JSON.stringify(snapshot));

    expect(window.confirm).toHaveBeenCalledWith('Import 2 transactions? This replaces your current data.');
    expect(allRows().map((r) => r.querySelector('.grid__desc').textContent)).toEqual(['Imported bus', 'Imported pay']);
    expect(summary('income')).toBe('€1,000.00'); // imported preference applied
    expect(app.ui.selectedCategory).toEqual({ expense: null, income: null });
    expect(app.ui.editingId).toBeNull();
    expect(q('.tx-panel .panel__title').textContent).toBe('Add transaction');
    expect(toastText()).toContain('Imported 2 transactions');
  });

  it('negative: declining the import confirmation leaves everything untouched', async () => {
    addTx({ amount: '5', description: 'Keep me' });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await importFile(JSON.stringify({ transactions: [] }));
    expect(rows()[0].textContent).toContain('Keep me');
    expect(toastText()).not.toContain('Imported 0 transactions');
  });

  it('negative: a file that is not JSON, or JSON without transactions, shows an error toast and changes nothing', async () => {
    addTx({ amount: '5', description: 'Keep me' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await importFile('{not json');
    expect(toastText()).toContain('That file is not valid JSON');
    await importFile(JSON.stringify({ hello: 'world' }));
    expect(toastText()).toContain('Unrecognised file format');
    expect(rows()[0].textContent).toContain('Keep me');
    expect(app.store.getState().transactions).toHaveLength(1);
  });

  it('positive: Delete all data wipes transactions, custom categories, selections and storage, with a toast', () => {
    addTx({ amount: '5', description: 'Gone' });
    app.store.addCategory({ name: 'Pets', type: 'expense' });
    app.render();
    legendItem('expense', 'cat_food').click();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    dataBtn('Delete all data').click();
    expect(allRows()).toHaveLength(0);
    expect(app.store.getState().categories.some((c) => c.name === 'Pets')).toBe(false);
    expect(app.ui.selectedCategory).toEqual({ expense: null, income: null });
    expect(backend.getItem('expense-tracker-ng')).not.toContain('Gone');
    expect(toastText()).toContain('All data deleted');
  });

  it('positive: renaming a category updates the grid, the chart legend and the form', () => {
    addTx({ amount: '5', category: 'cat_food', description: 'Pizza' });
    vi.spyOn(window, 'prompt').mockReturnValue('Eating out');
    categoryItem('Food & Dining').querySelector('[aria-label="Rename Food & Dining"]').click();
    expect(rows()[0].querySelector('.category-pill').textContent).toBe('Eating out');
    expect(legendItem('expense', 'cat_food').querySelector('.chart-legend__name').textContent).toBe('Eating out');
    expect([...q('#tx-category').options].map((o) => o.textContent)).toContain('Eating out');
    expect(categoryItem('Eating out')).toBeDefined();
  });

  it('positive: deleting a custom category moves its transactions to "Other" and clears a filter on it', () => {
    const pets = app.store.addCategory({ name: 'Pets', type: 'expense' });
    app.render();
    addTx({ amount: '9', category: pets.id, description: 'Dog food' });
    legendItem('expense', pets.id).click();
    expect(app.ui.selectedCategory.expense).toBe(pets.id);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    categoryItem('Pets').querySelector('[aria-label="Delete Pets"]').click();
    expect(app.ui.selectedCategory.expense).toBeNull();
    expect(rows()[0].querySelector('.category-pill').textContent).toBe('Other');
    expect(legendItem('expense', pets.id)).toBeNull();
    expect(categoryItem('Pets')).toBeUndefined();
  });
});

describe('error handling', () => {
  const toastText = () => [...root.querySelectorAll('.toast')].map((t) => t.querySelector('.toast__message').textContent);

  it('negative: a store failure while adding shows an error toast and keeps the typed values', () => {
    const spy = vi.spyOn(app.store, 'addTransaction').mockImplementation(() => {
      throw new Error('Disk on fire');
    });
    setValue(q('#tx-description'), 'Lunch');
    setValue(q('#tx-amount'), '12.50');
    submitForm();
    expect(toastText()).toContain('Disk on fire');
    expect(q('#tx-amount').value).toBe('12.50');
    expect(q('#tx-description').value).toBe('Lunch');
    expect(rows()).toHaveLength(0);
    spy.mockRestore();
  });

  it('negative: a store failure while updating shows an error toast and stays in edit mode', () => {
    addTx({ amount: '5', description: 'Edit me' });
    rows()[0].querySelector('[aria-label^="Edit"]').click();
    const spy = vi.spyOn(app.store, 'updateTransaction').mockImplementation(() => {
      throw new Error('Nope');
    });
    submitForm();
    expect(toastText()).toContain('Nope');
    expect(app.ui.editingId).not.toBeNull();
    spy.mockRestore();
  });

  it('negative: a rejected inline category shows an error toast and restores the previous category', () => {
    const spy = vi.spyOn(app.store, 'addCategory').mockImplementation(() => {
      throw new Error('Category name is required');
    });
    setValue(q('#tx-category'), '__new__');
    q('[aria-label="New category name"]').value = 'X';
    q('[aria-label="New category name"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(toastText()).toContain('Category name is required');
    expect(q('#tx-category').value).toBe('cat_food');
    expect(q('.field__inline').hidden).toBe(true);
    spy.mockRestore();
  });

  it('edge: the storage warning banner appears when a write fails and clears once writes succeed again', () => {
    expect(q('.banner--warning').hidden).toBe(true);
    const original = backend.setItem;
    backend.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    addTx({ amount: '5' });
    expect(q('.banner--warning').hidden).toBe(false);
    backend.setItem = original;
    addTx({ amount: '6' });
    expect(q('.banner--warning').hidden).toBe(true);
  });
});
