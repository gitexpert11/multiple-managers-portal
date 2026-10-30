import { describe, expect, it } from 'vitest';
import { BASE_METRICS, METRICS, changeBetween, countArchived, dailySeries, deriveMetrics, emptyTotals, filterCampaigns, formatMetric, getMetric, isMetricId, rowsInRange, sortCampaignRows, sumRows, summarizeCampaign, summarizeCampaigns } from '../src/lib/metrics.js';

const row = (date, over = {}) => ({ date, impressions: 1000, clicks: 10, spend: 500, conversions: 1, sales: 2500, ...over });
const range = { from: '2025-03-10', to: '2025-03-12', days: 3 };

const campaignA = { id: 'a', name: 'Alpha', type: 'sponsored_products', status: 'active', dailyBudget: 1000, startDate: '2025-03-01', createdAt: 1, products: [{ id: 'p1', sku: 'SKU-1', name: 'Headphones' }], performance: [row('2025-03-09'), row('2025-03-10'), row('2025-03-11', { clicks: 20, spend: 1000 })] };
const campaignB = { id: 'b', name: 'Beta', type: 'sponsored_brands', status: 'paused', dailyBudget: 2000, startDate: '2025-03-05', createdAt: 2, products: [{ id: 'p2', sku: 'SKU-2', name: 'Kettle' }], performance: [row('2025-03-12', { sales: 0, conversions: 0 })] };
const campaignC = { id: 'c', name: 'Gamma', type: 'sponsored_display', status: 'active', dailyBudget: 500, startDate: '2025-03-12', createdAt: 3, products: [], performance: [] };

describe('metric catalogue', () => {
  it('defines the five base counters plus derived metrics', () => {
    expect(BASE_METRICS).toEqual(['impressions', 'clicks', 'spend', 'conversions', 'sales']);
    expect(METRICS.map((m) => m.id)).toEqual(['impressions', 'clicks', 'ctr', 'spend', 'cpc', 'conversions', 'cvr', 'sales', 'roas', 'acos']);
    expect(getMetric('roas').kind).toBe('ratio');
    expect(getMetric('nope')).toBeNull();
    expect(isMetricId('ctr')).toBe(true);
    expect(isMetricId('name')).toBe(false);
  });
});

describe('sums and derived metrics', () => {
  it('sums base counters and ignores junk values', () => {
    expect(sumRows([row('x'), row('y', { spend: 'oops', clicks: undefined })])).toEqual({ impressions: 2000, clicks: 10, spend: 500, conversions: 2, sales: 5000 });
    expect(sumRows([])).toEqual(emptyTotals());
    expect(sumRows(null)).toEqual(emptyTotals());
  });

  it('derives ratios as ratio-of-sums', () => {
    const d = deriveMetrics({ impressions: 2000, clicks: 20, spend: 1000, conversions: 2, sales: 5000 });
    expect(d.ctr).toBeCloseTo(0.01);
    expect(d.cpc).toBe(50);
    expect(d.cvr).toBeCloseTo(0.1);
    expect(d.roas).toBe(5);
    expect(d.acos).toBe(0.2);
  });

  it('negative: never divides by zero', () => {
    const d = deriveMetrics(emptyTotals());
    expect(d).toMatchObject({ ctr: 0, cpc: 0, cvr: 0, roas: 0, acos: 0 });
    expect(deriveMetrics({ spend: 100 }).roas).toBe(0);
  });
});

describe('range scoping', () => {
  it('rowsInRange is inclusive on both ends', () => {
    expect(rowsInRange(campaignA.performance, range).map((r) => r.date)).toEqual(['2025-03-10', '2025-03-11']);
    expect(rowsInRange(undefined, range)).toEqual([]);
  });

  it('summarizeCampaign reports totals, derived metrics and the number of served days', () => {
    const s = summarizeCampaign(campaignA, range);
    expect(s).toMatchObject({ impressions: 2000, clicks: 30, spend: 1500, conversions: 2, sales: 5000, days: 2 });
    expect(s.cpc).toBe(50);
    expect(summarizeCampaign(campaignC, range)).toMatchObject({ ...emptyTotals(), days: 0 });
  });

  it('summarizeCampaigns aggregates across campaigns', () => {
    const s = summarizeCampaigns([campaignA, campaignB, campaignC], range);
    expect(s).toMatchObject({ impressions: 3000, clicks: 40, spend: 2000, conversions: 2, sales: 5000, days: 3 });
    expect(s.roas).toBe(2.5);
    expect(summarizeCampaigns([], range)).toMatchObject({ ...emptyTotals(), days: 0 });
  });

  it('dailySeries has one zero-filled point per day with per-day derived metrics', () => {
    const s = dailySeries([campaignA, campaignB], range);
    expect(s.map((p) => p.date)).toEqual(['2025-03-10', '2025-03-11', '2025-03-12']);
    expect(s[0]).toMatchObject({ impressions: 1000, clicks: 10, spend: 500, sales: 2500, roas: 5 });
    expect(s[1]).toMatchObject({ clicks: 20, spend: 1000, cpc: 50 });
    expect(s[2]).toMatchObject({ impressions: 1000, sales: 0, roas: 0 });
    expect(dailySeries([], range).every((p) => p.spend === 0 && p.ctr === 0)).toBe(true);
    expect(dailySeries([campaignA], { from: '2025-03-12', to: '2025-03-11' })).toEqual([]);
  });
});

describe('changeBetween', () => {
  it('reports direction, percentage and whether the move is good', () => {
    expect(changeBetween('sales', 120, 100)).toEqual({ delta: 20, pct: 0.2, direction: 'up', tone: 'good' });
    expect(changeBetween('sales', 80, 100)).toMatchObject({ direction: 'down', tone: 'bad', pct: -0.2 });
    expect(changeBetween('cpc', 80, 100)).toMatchObject({ direction: 'down', tone: 'good' });
    expect(changeBetween('acos', 0.3, 0.2)).toMatchObject({ direction: 'up', tone: 'bad' });
    expect(changeBetween('spend', 120, 100)).toMatchObject({ direction: 'up', tone: 'neutral' });
  });

  it('edge: flat and no-previous-data cases', () => {
    expect(changeBetween('sales', 100, 100)).toMatchObject({ direction: 'flat', tone: 'neutral', pct: 0 });
    expect(changeBetween('sales', 100, 0)).toMatchObject({ direction: 'up', pct: null, tone: 'good' });
    expect(changeBetween('sales', 0, 0)).toMatchObject({ direction: 'flat', pct: null });
    expect(changeBetween('unknown', 5, 1)).toMatchObject({ direction: 'up', tone: 'neutral' });
  });
});

describe('formatMetric', () => {
  it('formats by kind', () => {
    expect(formatMetric('spend', 123456)).toBe('$1,234.56');
    expect(formatMetric('impressions', 1234567)).toBe('1,234,567');
    expect(formatMetric('ctr', 0.0123)).toBe('1.23%');
    expect(formatMetric('roas', 4.256)).toBe('4.26x');
    expect(formatMetric('conversions', undefined)).toBe('0');
  });

  it('money metrics follow the display currency', () => {
    expect(formatMetric('spend', 123456, { currency: 'EUR' })).toBe('€1,234.56');
    expect(formatMetric('cpc', 80, { currency: 'INR' })).toBe('₹0.80');
    expect(formatMetric('sales', 1234567, { currency: 'GBP', compact: true })).toBe('£12.3K');
    expect(formatMetric('spend', 200000, { currency: 'JPY', axis: true })).toBe('¥2,000');
    expect(formatMetric('impressions', 1234, { currency: 'EUR' })).toBe('1,234'); // counts are unaffected
  });

  it('compact mode abbreviates only long figures', () => {
    expect(formatMetric('impressions', 1234567, { compact: true })).toBe('1.2M');
    expect(formatMetric('impressions', 9999, { compact: true })).toBe('9,999');
    expect(formatMetric('spend', 1234567, { compact: true })).toBe('$12.3K');
    expect(formatMetric('spend', 80, { compact: true })).toBe('$0.80');
    expect(formatMetric('cpc', 80, { compact: true })).toBe('$0.80');
  });

  it('axis mode drops cents for whole-dollar ticks', () => {
    expect(formatMetric('spend', 200000, { axis: true })).toBe('$2,000');
    expect(formatMetric('spend', 5000, { axis: true })).toBe('$50');
    expect(formatMetric('spend', 0, { axis: true })).toBe('$0');
    expect(formatMetric('spend', 5050, { axis: true })).toBe('$50.50');
    expect(formatMetric('spend', 250, { axis: true })).toBe('$2.50');
  });
});

describe('filterCampaigns', () => {
  const all = [campaignA, campaignB, campaignC];
  it('filters by status, type and search text (name, product name, SKU)', () => {
    expect(filterCampaigns(all, {}).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(filterCampaigns(all, { status: 'paused' }).map((c) => c.id)).toEqual(['b']);
    expect(filterCampaigns(all, { type: 'sponsored_display' }).map((c) => c.id)).toEqual(['c']);
    expect(filterCampaigns(all, { query: 'ALPHA' }).map((c) => c.id)).toEqual(['a']);
    expect(filterCampaigns(all, { query: 'kettle' }).map((c) => c.id)).toEqual(['b']);
    expect(filterCampaigns(all, { query: 'sku-1' }).map((c) => c.id)).toEqual(['a']);
    expect(filterCampaigns(all, { status: 'active', type: 'sponsored_products', query: 'alp' }).map((c) => c.id)).toEqual(['a']);
    expect(filterCampaigns(all, { query: '   ' })).toHaveLength(3);
  });

  it('"all" hides archived campaigns; the Archived filter shows only them', () => {
    const archived = { ...campaignC, id: 'd', name: 'Delta', status: 'archived' };
    const list = [...all, archived];
    expect(filterCampaigns(list, { status: 'all' }).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(filterCampaigns(list, {}).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(filterCampaigns(list, { status: 'archived' }).map((c) => c.id)).toEqual(['d']);
    expect(filterCampaigns(list, { status: 'archived', query: 'delta' }).map((c) => c.id)).toEqual(['d']);
    expect(filterCampaigns(list, { status: 'active' }).map((c) => c.id)).toEqual(['a', 'c']);
    expect(countArchived(list)).toBe(1);
    expect(countArchived(all)).toBe(0);
  });
});

describe('sortCampaignRows', () => {
  const rows = [campaignA, campaignB, campaignC].map((campaign) => ({ campaign, metrics: summarizeCampaign(campaign, range) }));

  it('sorts by metadata columns in either direction', () => {
    expect(sortCampaignRows(rows, { key: 'name', dir: 'asc' }).map((r) => r.campaign.id)).toEqual(['a', 'b', 'c']);
    expect(sortCampaignRows(rows, { key: 'name', dir: 'desc' }).map((r) => r.campaign.id)).toEqual(['c', 'b', 'a']);
    expect(sortCampaignRows(rows, { key: 'budget', dir: 'desc' }).map((r) => r.campaign.id)).toEqual(['b', 'a', 'c']);
    expect(sortCampaignRows(rows, { key: 'status', dir: 'asc' }).map((r) => r.campaign.id)).toEqual(['c', 'a', 'b']); // active first, ties newest first
    const withArchived = [...rows, { campaign: { ...campaignA, id: 'z', status: 'archived', createdAt: 9 }, metrics: rows[0].metrics }];
    expect(sortCampaignRows(withArchived, { key: 'status', dir: 'asc' }).map((r) => r.campaign.id)).toEqual(['c', 'a', 'b', 'z']); // archived last
    expect(sortCampaignRows([...rows, { campaign: { ...campaignA, id: 'w', status: 'weird', createdAt: 9 }, metrics: rows[0].metrics }], { key: 'status', dir: 'asc' }).at(-1).campaign.id).toBe('w'); // unknown status sorts after
    expect(sortCampaignRows(rows, { key: 'startDate', dir: 'asc' }).map((r) => r.campaign.id)).toEqual(['a', 'b', 'c']);
    expect(sortCampaignRows(rows, { key: 'products', dir: 'desc' }).map((r) => r.campaign.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by any metric, defaulting to newest first', () => {
    expect(sortCampaignRows(rows, { key: 'spend', dir: 'desc' }).map((r) => r.campaign.id)).toEqual(['a', 'b', 'c']);
    expect(sortCampaignRows(rows, { key: 'roas', dir: 'asc' }).map((r) => r.campaign.id)).toEqual(['c', 'b', 'a']);
    expect(sortCampaignRows(rows).map((r) => r.campaign.id)).toEqual(['c', 'b', 'a']);
    expect(sortCampaignRows(rows, { key: 'bogus', dir: 'asc' }).map((r) => r.campaign.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    const copy = [...rows];
    sortCampaignRows(rows, { key: 'name', dir: 'desc' });
    expect(rows).toEqual(copy);
  });
});
