import { describe, expect, it } from 'vitest';
import { toggleMetric, tooltipLabel, tooltipTitle } from '../components/PerformanceChart';
import { describeChange } from '../components/SummaryCards';
import type { SeriesPoint } from '../types';
import { dayKeyOfTimestamp, daysBetween, eachDay, formatDayRange, shiftDay, todayKey } from './dates';
import { changeBetween, chartTotal, emptyMetrics, formatMetric, getMetric, isMetricId, METRICS } from './metrics';
import { centsToInput, currencySymbol, formatMoney, formatNumber, formatPercent, isCurrency, parseAmount } from './money';
import { clampPage, pageAfterResize, pageBounds, pageNumbers, pageOfIndex, paginate } from './pagination';
import { canShiftForward, previousPeriod, resolvePeriod, shiftRange } from './periods';

const TODAY = '2025-03-15';

describe('dates', () => {
  it('shifts days across month / DST boundaries and enumerates ranges', () => {
    expect(shiftDay('2025-03-01', -1)).toBe('2025-02-28');
    expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDay('2025-03-30', 1)).toBe('2025-03-31');
    expect(daysBetween('2025-03-01', '2025-03-15')).toBe(14);
    expect(eachDay('2025-03-13', TODAY)).toEqual(['2025-03-13', '2025-03-14', TODAY]);
    expect(eachDay(TODAY, '2025-03-13')).toEqual([]);
    expect(formatDayRange('2025-03-01', TODAY)).toBe('Mar 1 – Mar 15, 2025');
    expect(formatDayRange('2024-12-20', '2025-01-05')).toBe('Dec 20, 2024 – Jan 5, 2025');
    expect(formatDayRange(TODAY, TODAY)).toBe('Mar 15, 2025');
    expect(todayKey(new Date(2025, 2, 15))).toBe(TODAY);
    expect(dayKeyOfTimestamp('2025-03-15T10:00:00+00:00')).toMatch(/^2025-03-1[56]$/);
    expect(dayKeyOfTimestamp('garbage')).toBe('garbage');
  });
});

describe('periods', () => {
  it('resolves presets relative to today, including today', () => {
    expect(resolvePeriod({ preset: '7d' }, TODAY)).toMatchObject({ from: '2025-03-09', to: TODAY, days: 7 });
    expect(resolvePeriod({ preset: '30d' }, TODAY)).toMatchObject({ from: '2025-02-14', to: TODAY, days: 30, label: 'Feb 14 – Mar 15, 2025' });
    expect(resolvePeriod({ preset: 'thisMonth' }, TODAY)).toMatchObject({ from: '2025-03-01', to: TODAY, days: 15 });
    expect(resolvePeriod({ preset: 'lastMonth' }, TODAY)).toMatchObject({ from: '2025-02-01', to: '2025-02-28', days: 28 });
    expect(resolvePeriod({ preset: 'bogus' }, TODAY).preset).toBe('30d');
    expect(resolvePeriod(null, TODAY).preset).toBe('30d');
  });

  it('validates, clamps and caps custom ranges', () => {
    expect(resolvePeriod({ preset: 'custom', from: '2025-03-01', to: '2025-03-10' }, TODAY)).toMatchObject({ from: '2025-03-01', to: '2025-03-10', days: 10 });
    expect(resolvePeriod({ preset: 'custom', from: '2025-03-01', to: '2025-04-10' }, TODAY).to).toBe(TODAY); // never past today
    expect(resolvePeriod({ preset: 'custom', from: '2025-03-12', to: '2025-03-10' }, TODAY)).toMatchObject({ from: '2025-03-10', to: '2025-03-10' }); // reversed → single day
    expect(resolvePeriod({ preset: 'custom', from: 'nope', to: TODAY }, TODAY).from).toBe('2025-02-14');
    expect(resolvePeriod({ preset: 'custom', from: '2020-01-01', to: TODAY }, TODAY).days).toBe(731);
  });

  it('computes the previous period and slides ranges', () => {
    const range = resolvePeriod({ preset: '7d' }, TODAY);
    expect(previousPeriod(range)).toMatchObject({ from: '2025-03-02', to: '2025-03-08', days: 7 });
    expect(shiftRange(range, -1, TODAY)).toEqual({ preset: 'custom', from: '2025-03-02', to: '2025-03-08' });
    expect(shiftRange(range, 1, TODAY)).toEqual({ preset: 'custom', from: '2025-03-09', to: TODAY }); // cannot pass today
    expect(canShiftForward(range, TODAY)).toBe(false);
    expect(canShiftForward({ to: '2025-03-01' }, TODAY)).toBe(true);
  });
});

describe('metrics', () => {
  it('knows the catalogue and formats each kind', () => {
    expect(METRICS.map((m) => m.id)).toEqual(['impressions', 'clicks', 'ctr', 'spend', 'cpc', 'conversions', 'cvr', 'sales', 'roas', 'acos']);
    expect(isMetricId('roas')).toBe(true);
    expect(getMetric('nope')).toBeNull();
    expect(formatMetric('spend', 123456, { currency: 'USD' })).toBe('$1,234.56');
    expect(formatMetric('spend', 123456789, { currency: 'USD', compact: true })).toBe('$1.2M');
    expect(formatMetric('spend', 120000, { currency: 'USD', axis: true })).toBe('$1,200');
    expect(formatMetric('ctr', 0.01234)).toBe('1.23%');
    expect(formatMetric('roas', 4.5)).toBe('4.5x');
    expect(formatMetric('impressions', 12345, { compact: true })).toBe('12.3K');
    expect(formatMetric('impressions', 1234)).toBe('1,234');
    expect(emptyMetrics().days).toBe(0);
  });

  it('describes changes with the right tone', () => {
    expect(changeBetween('sales', 200, 100)).toEqual({ delta: 100, pct: 1, direction: 'up', tone: 'good' });
    expect(changeBetween('cpc', 2, 1).tone).toBe('bad');
    expect(changeBetween('acos', 0.1, 0.2).tone).toBe('good');
    expect(changeBetween('spend', 200, 100).tone).toBe('neutral');
    expect(changeBetween('sales', 100, 100).direction).toBe('flat');
    expect(changeBetween('sales', 100, 0).pct).toBeNull();
    expect(describeChange(changeBetween('sales', 150, 100))).toBe('+50.0% vs previous period');
    expect(describeChange(changeBetween('sales', 50, 100))).toBe('−50.0% vs previous period');
    expect(describeChange(changeBetween('sales', 100, 0))).toBe('New vs previous period');
    expect(describeChange(changeBetween('sales', 0, 0))).toBe('No data in previous period');
    expect(describeChange(changeBetween('sales', 5, 5))).toBe('No change vs previous period');
  });

  it('totals a series as sums or ratios of sums', () => {
    const series: SeriesPoint[] = [
      { date: '2025-03-01', ...emptyMetrics(), impressions: 100, clicks: 10, spend: 1000, conversions: 1, sales: 2000 },
      { date: '2025-03-02', ...emptyMetrics(), impressions: 300, clicks: 10, spend: 1000, conversions: 3, sales: 6000 },
    ];
    expect(chartTotal(series, 'spend')).toBe(2000);
    expect(chartTotal(series, 'ctr')).toBe(0.05);
    expect(chartTotal(series, 'cpc')).toBe(100);
    expect(chartTotal(series, 'roas')).toBe(4);
    expect(chartTotal(series, 'acos')).toBe(0.25);
    expect(chartTotal(series, 'cvr')).toBe(0.2);
    expect(chartTotal([], 'roas')).toBe(0);
  });
});

describe('chart helpers', () => {
  it('toggles metrics keeping 1..2 selected', () => {
    expect(toggleMetric(['spend', 'sales'], 'clicks')).toEqual(['sales', 'clicks']);
    expect(toggleMetric(['spend', 'sales'], 'spend')).toEqual(['sales']);
    expect(toggleMetric(['spend'], 'spend')).toEqual(['spend']);
    expect(toggleMetric(['spend'], 'roas')).toEqual(['spend', 'roas']);
  });

  it('formats tooltips', () => {
    const series = [{ date: '2025-03-01', ...emptyMetrics() }];
    expect(tooltipTitle(series, 0)).toBe('Mar 1, 2025');
    expect(tooltipTitle(series, 5)).toBe('');
    expect(tooltipLabel('spend', 1234, 'en-US', 'EUR')).toBe('Spend: €12.34');
  });
});

describe('money', () => {
  it('parses, formats and validates currencies', () => {
    expect(parseAmount('$1,234.5')).toBe(123450);
    expect(parseAmount('.5')).toBe(50);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(centsToInput(2500)).toBe('25.00');
    expect(formatMoney(123456, { currency: 'EUR' })).toBe('€1,234.56');
    expect(formatMoney(1234567, { compact: true })).toBe('$12.3K');
    expect(formatMoney(120000, { wholeUnits: true })).toBe('$1,200');
    expect(formatNumber(1234.567, { maximumFractionDigits: 1 })).toBe('1,234.6');
    expect(formatPercent(0.1234)).toBe('12.34%');
    expect(isCurrency('INR')).toBe(true);
    expect(isCurrency('XXX')).toBe(false);
    expect(currencySymbol('GBP')).toBe('£');
  });
});

describe('pagination', () => {
  it('slices, clamps and computes bounds', () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(paginate(items, 1, 5)).toMatchObject({ items: [0, 1, 2, 3, 4], page: 1, pageCount: 3, total: 12, from: 1, to: 5 });
    expect(paginate(items, 9, 5)).toMatchObject({ page: 3, items: [10, 11], from: 11, to: 12 });
    expect(paginate([], 1, 5)).toMatchObject({ items: [], page: 1, pageCount: 1, from: 0, to: 0 });
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(2.7, 3)).toBe(2);
    expect(pageOfIndex(12, 5)).toBe(3);
    expect(pageAfterResize(3, 5, 10)).toBe(2); // first row of page 3 (index 10) sits on page 2 of 10
    expect(pageAfterResize(2, 10, 5)).toBe(3);
    expect(pageBounds(2, 5, 12)).toEqual({ from: 6, to: 10 });
    expect(pageBounds(1, 5, 0)).toEqual({ from: 0, to: 0 });
  });

  it('lists page numbers with ellipses', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, 4, null, 20]);
    expect(pageNumbers(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pageNumbers(20, 20)).toEqual([1, null, 17, 18, 19, 20]);
  });
});
