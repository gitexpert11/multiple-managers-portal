import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCategoryChart } from '../src/ui/categoryChart.js';

const slices = [
  { categoryId: 'cat_salary', name: 'Salary', color: '#22c55e', amount: 400000, share: 0.8 },
  { categoryId: 'cat_freelance', name: 'Freelance', color: '#10b981', amount: 100000, share: 0.2 },
];

let host;
let onSelect;

const items = () => [...host.querySelectorAll('.chart-legend__item:not(.chart-legend__item--all)')];
const all = () => host.querySelector('.chart-legend__item--all');

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  onSelect = vi.fn();
});

afterEach(() => host.remove());

describe('income category chart component', () => {
  let chart;
  beforeEach(() => {
    chart = createCategoryChart(host, { type: 'income', onSelect });
  });

  it('renders income-specific copy and test hooks', () => {
    expect(host.querySelector('[data-testid=chart-income]')).toBeTruthy();
    expect(host.querySelector('.chart-panel--income')).toBeTruthy();
    expect(host.querySelector('.panel__title').textContent).toBe('Income by category');
    expect(host.querySelector('canvas').getAttribute('aria-label')).toBe('Income by category');
    expect(host.querySelector('.chart-legend').getAttribute('aria-label')).toBe('Income categories');
  });

  it('shows an income empty state when there are no slices', () => {
    chart.update({ slices: [], selectedCategoryId: null, currency: 'USD', locale: 'en-US' });
    const empty = host.querySelector('.empty-state');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain('No income this month yet');
    expect(host.querySelector('.chart').hidden).toBe(true);
    expect(items()).toHaveLength(0);
  });

  it('renders a legend with amounts, shares and an "All categories" total', () => {
    chart.update({ slices, selectedCategoryId: null, currency: 'USD', locale: 'en-US' });
    expect(host.querySelector('.empty-state').hidden).toBe(true);
    expect(host.querySelector('.chart').hidden).toBe(false);
    expect(items().map((b) => b.querySelector('.chart-legend__name').textContent)).toEqual(['Salary', 'Freelance']);
    expect(items().map((b) => b.querySelector('.chart-legend__amount').textContent)).toEqual(['$4,000.00', '$1,000.00']);
    expect(items().map((b) => b.querySelector('.chart-legend__share').textContent)).toEqual(['80%', '20%']);
    expect(all().querySelector('.chart-legend__amount').textContent).toBe('$5,000.00');
    expect(all().getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.chart__center-value').textContent).toBe('$5,000.00');
    expect(host.querySelector('.chart__center-caption').textContent).toBe('Total earned');
    expect(items()[0].querySelector('.swatch').style.background).toContain('rgb(34, 197, 94)');
  });

  it('emits the category id on click and null when clicking the selected one again', () => {
    chart.update({ slices, selectedCategoryId: null, currency: 'USD', locale: 'en-US' });
    items()[1].click();
    expect(onSelect).toHaveBeenLastCalledWith('cat_freelance');

    chart.update({ slices, selectedCategoryId: 'cat_freelance', currency: 'USD', locale: 'en-US' });
    items()[1].click();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('reflects the selection in the legend and center label', () => {
    chart.update({ slices, selectedCategoryId: 'cat_freelance', currency: 'USD', locale: 'en-US' });
    expect(items()[1].classList.contains('is-active')).toBe(true);
    expect(items()[1].getAttribute('aria-pressed')).toBe('true');
    expect(items()[0].getAttribute('aria-pressed')).toBe('false');
    expect(all().getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.chart__center-value').textContent).toBe('$1,000.00');
    expect(host.querySelector('.chart__center-caption').textContent).toBe('Freelance');
  });

  it('"All categories" always emits null', () => {
    chart.update({ slices, selectedCategoryId: 'cat_salary', currency: 'USD', locale: 'en-US' });
    all().click();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('formats amounts in the requested currency', () => {
    chart.update({ slices, selectedCategoryId: null, currency: 'INR', locale: 'en-IN' });
    expect(all().querySelector('.chart-legend__amount').textContent).toBe('₹5,000.00');
  });

  it('handles a single 100% slice', () => {
    chart.update({ slices: [{ ...slices[0], share: 1 }], selectedCategoryId: null, currency: 'USD', locale: 'en-US' });
    expect(items()).toHaveLength(1);
    expect(items()[0].querySelector('.chart-legend__share').textContent).toBe('100%');
  });

  it('can go from data back to the empty state', () => {
    chart.update({ slices, selectedCategoryId: null, currency: 'USD', locale: 'en-US' });
    chart.update({ slices: [], selectedCategoryId: null, currency: 'USD', locale: 'en-US' });
    expect(host.querySelector('.empty-state').hidden).toBe(false);
    expect(host.querySelector('.chart').hidden).toBe(true);
  });

  it('destroy() is safe without a real canvas context', () => {
    expect(() => chart.destroy()).not.toThrow();
  });
});

describe('chart type handling', () => {
  it('defaults to the expense variant', () => {
    createCategoryChart(host, { onSelect });
    expect(host.querySelector('[data-testid=chart-expense]')).toBeTruthy();
    expect(host.querySelector('.panel__title').textContent).toBe('Spending by category');
  });

  it('rejects an unknown type', () => {
    expect(() => createCategoryChart(host, { type: 'transfer', onSelect })).toThrow(/type/);
  });
});
