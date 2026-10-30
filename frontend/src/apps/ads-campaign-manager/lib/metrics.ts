import type { BaseMetricId, MetricId, Metrics, SeriesPoint } from '../types';
import { formatMoney, formatNumber, formatPercent } from './money';

/**
 * Metric catalogue and presentation helpers. The sums and derived ratios
 * themselves are computed by the API (ratio-of-sums, never averages of daily
 * ratios); the UI only formats, compares and charts them.
 */

export const BASE_METRICS: BaseMetricId[] = ['impressions', 'clicks', 'spend', 'conversions', 'sales'];

export type MetricKind = 'count' | 'money' | 'percent' | 'ratio';
export type GoodDirection = 'up' | 'down' | 'neutral';

export interface MetricDef {
  id: MetricId;
  label: string;
  short: string;
  kind: MetricKind;
  /** Which direction is an improvement (for the summary-card deltas). */
  good: GoodDirection;
  description: string;
}

export const METRICS: MetricDef[] = [
  { id: 'impressions', label: 'Impressions', short: 'Impr.', kind: 'count', good: 'up', description: 'How often your ads were shown' },
  { id: 'clicks', label: 'Clicks', short: 'Clicks', kind: 'count', good: 'up', description: 'Ad clicks' },
  { id: 'ctr', label: 'Click-through rate', short: 'CTR', kind: 'percent', good: 'up', description: 'Clicks ÷ impressions' },
  { id: 'spend', label: 'Spend', short: 'Spend', kind: 'money', good: 'neutral', description: 'Total ad spend' },
  { id: 'cpc', label: 'Cost per click', short: 'CPC', kind: 'money', good: 'down', description: 'Spend ÷ clicks' },
  { id: 'conversions', label: 'Orders', short: 'Orders', kind: 'count', good: 'up', description: 'Orders attributed to ad clicks' },
  { id: 'cvr', label: 'Conversion rate', short: 'CVR', kind: 'percent', good: 'up', description: 'Orders ÷ clicks' },
  { id: 'sales', label: 'Sales', short: 'Sales', kind: 'money', good: 'up', description: 'Revenue attributed to ads' },
  { id: 'roas', label: 'Return on ad spend', short: 'ROAS', kind: 'ratio', good: 'up', description: 'Sales ÷ spend' },
  { id: 'acos', label: 'Advertising cost of sales', short: 'ACOS', kind: 'percent', good: 'down', description: 'Spend ÷ sales' },
];

const METRIC_BY_ID = new Map(METRICS.map((m) => [m.id, m]));

export function getMetric(id: string): MetricDef | null {
  return METRIC_BY_ID.get(id as MetricId) || null;
}

export function isMetricId(id: unknown): id is MetricId {
  return typeof id === 'string' && METRIC_BY_ID.has(id as MetricId);
}

export function emptyMetrics(): Metrics {
  return { impressions: 0, clicks: 0, spend: 0, conversions: 0, sales: 0, ctr: 0, cpc: 0, cvr: 0, roas: 0, acos: 0, days: 0 };
}

export interface Change {
  delta: number;
  /** null when the previous value is 0 (no meaningful percentage). */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
  tone: 'good' | 'bad' | 'neutral';
}

/** Relative change of a metric between two periods. */
export function changeBetween(metricId: string, current: number | undefined, previous: number | undefined): Change {
  const metric = getMetric(metricId);
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const delta = cur - prev;
  const direction: Change['direction'] = Math.abs(delta) < 1e-9 ? 'flat' : delta > 0 ? 'up' : 'down';
  const pct = prev > 0 ? delta / prev : null;
  let tone: Change['tone'] = 'neutral';
  if (direction !== 'flat' && metric && metric.good !== 'neutral') {
    tone = (direction === 'up') === (metric.good === 'up') ? 'good' : 'bad';
  }
  return { delta, pct, direction, tone };
}

export interface MetricFormatOptions {
  locale?: string;
  currency?: string;
  /** Abbreviate long figures (1.2M, $12.3K). */
  compact?: boolean;
  /** For chart ticks, where cents are noise once amounts reach whole dollars. */
  axis?: boolean;
}

export function formatMetric(metricId: string, value: number | undefined, { locale = 'en-US', currency, compact = false, axis = false }: MetricFormatOptions = {}): string {
  const metric = getMetric(metricId);
  const v = Number(value) || 0;
  switch (metric?.kind) {
    case 'money':
      // Compact only once the figure is long enough to need it (10,000+ units).
      return formatMoney(v, { locale, currency, compact: compact && Math.abs(v) >= 1_000_000, wholeUnits: axis && Number.isInteger(v / 100) });
    case 'percent':
      return formatPercent(v, { locale });
    case 'ratio':
      return `${formatNumber(v, { locale, maximumFractionDigits: 2 })}x`;
    default:
      return compact && v >= 10_000 ? formatCompactCount(v, locale) : formatNumber(v, { locale });
  }
}

function formatCompactCount(v: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  } catch {
    return formatNumber(v, { locale });
  }
}

/** Sum of a base metric over the series, or the ratio-of-sums for derived ones. */
export function chartTotal(series: SeriesPoint[], metricId: string): number {
  const sum = (k: BaseMetricId) => series.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);
  switch (metricId) {
    case 'ctr':
      return div(sum('clicks'), sum('impressions'));
    case 'cpc':
      return div(sum('spend'), sum('clicks'));
    case 'cvr':
      return div(sum('conversions'), sum('clicks'));
    case 'roas':
      return div(sum('sales'), sum('spend'));
    case 'acos':
      return div(sum('spend'), sum('sales'));
    default:
      return isMetricId(metricId) ? sum(metricId as BaseMetricId) : 0;
  }
}
