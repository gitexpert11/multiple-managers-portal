import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveMetrics } from '../src/lib/metrics.js';
import { SUMMARY_CARDS, createSummaryCards, describeChange } from '../src/ui/summaryCards.js';

let host;
let cards;
const q = (sel) => host.querySelector(sel);
const totals = (over = {}) => deriveMetrics({ impressions: 125000, clicks: 1000, spend: 150000, conversions: 80, sales: 900000, ...over });

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  cards = createSummaryCards(host);
});
afterEach(() => host.remove());

describe('summary cards', () => {
  it('renders six cards in the documented order', () => {
    expect(SUMMARY_CARDS.map((c) => c.metric)).toEqual(['spend', 'sales', 'roas', 'impressions', 'clicks', 'conversions']);
    expect([...host.querySelectorAll('.ads-card__title')].map((t) => t.textContent)).toEqual(['Spend', 'Sales', 'ROAS', 'Impressions', 'Clicks', 'Orders']);
  });

  it('shows formatted values, secondary metrics and deltas vs the previous period', () => {
    cards.update({ totals: totals(), previous: totals({ spend: 100000, sales: 1000000, clicks: 1000 }) });
    expect(q('[data-testid=ads-summary-spend]').textContent).toBe('$1,500.00');
    expect(q('[data-testid=ads-summary-spend-secondary]').textContent).toBe('CPC $1.50');
    expect(q('[data-testid=ads-summary-spend-change]').textContent).toBe('+50.0% vs previous period');
    expect(q('[data-testid=ads-summary-spend-change]').dataset.tone).toBe('neutral');
    expect(q('[data-testid=ads-summary-sales]').textContent).toBe('$9,000.00');
    expect(q('[data-testid=ads-summary-sales-secondary]').textContent).toBe('ACOS 16.67%');
    expect(q('[data-testid=ads-summary-sales-change]').textContent).toBe('−10.0% vs previous period');
    expect(q('[data-testid=ads-summary-sales-change]').dataset.tone).toBe('bad');
    expect(q('[data-testid=ads-summary-roas]').textContent).toBe('6x');
    expect(q('[data-testid=ads-summary-roas-secondary]').hidden).toBe(true);
    expect(q('[data-testid=ads-summary-impressions]').textContent).toBe('125K');
    expect(q('[data-testid=ads-summary-impressions]').title).toBe('125,000');
    expect(q('[data-testid=ads-summary-clicks-secondary]').textContent).toBe('CTR 0.80%');
    expect(q('[data-testid=ads-summary-clicks-change]').textContent).toBe('No change vs previous period');
    expect(q('[data-testid=ads-summary-conversions-secondary]').textContent).toBe('CVR 8.00%');
  });

  it('money cards follow the display currency', () => {
    cards.update({ totals: totals(), previous: totals(), currency: 'INR' });
    expect(q('[data-testid=ads-summary-spend]').textContent).toBe('₹1,500.00');
    expect(q('[data-testid=ads-summary-spend-secondary]').textContent).toBe('CPC ₹1.50');
    expect(q('[data-testid=ads-summary-sales]').textContent).toBe('₹9,000.00');
    expect(q('[data-testid=ads-summary-clicks]').textContent).toBe('1,000');
  });

  it('edge: with no previous data the delta says so instead of showing a percentage', () => {
    cards.update({ totals: totals(), previous: deriveMetrics({}) });
    expect(q('[data-testid=ads-summary-spend-change]').textContent).toBe('New vs previous period');
    cards.update({ totals: deriveMetrics({}), previous: deriveMetrics({}) });
    expect(q('[data-testid=ads-summary-spend]').textContent).toBe('$0.00');
    expect(q('[data-testid=ads-summary-spend-change]').textContent).toBe('No data in previous period');
    cards.update({ totals: totals(), previous: undefined });
    expect(q('[data-testid=ads-summary-sales-change]').textContent).toBe('New vs previous period');
  });
});

describe('describeChange', () => {
  it('words every case', () => {
    expect(describeChange(null)).toBe('');
    expect(describeChange({ delta: 5, pct: 0.125, direction: 'up' })).toBe('+12.5% vs previous period');
    expect(describeChange({ delta: -5, pct: -0.125, direction: 'down' }, { previousLabel: 'last week' })).toBe('−12.5% vs last week');
    expect(describeChange({ delta: 0, pct: 0, direction: 'flat' })).toBe('No change vs previous period');
  });
});
