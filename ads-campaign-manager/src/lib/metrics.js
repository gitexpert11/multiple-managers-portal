import { ARCHIVED_STATUS, getStatus } from '../data/campaignTypes.js';
import { eachDay } from './dates.js';
import { formatMoney, formatNumber, formatPercent } from './money.js';

/**
 * Campaign performance maths.
 *
 * Each campaign carries daily performance rows:
 *   { date: "YYYY-MM-DD", impressions, clicks, spend (cents), conversions, sales (cents) }
 * Everything else (CTR, CPC, ROAS, ...) is derived from the sums of those
 * five base counters, so derived metrics are always ratio-of-sums and never
 * an average of daily ratios.
 */

export const BASE_METRICS = ['impressions', 'clicks', 'spend', 'conversions', 'sales'];

/**
 * Every metric the dashboard can show. `kind` drives formatting:
 *   count | money | percent | ratio
 * `good` says which direction is an improvement (for the summary-card deltas).
 */
export const METRICS = [
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

export function getMetric(id) {
  return METRIC_BY_ID.get(id) || null;
}

export function isMetricId(id) {
  return METRIC_BY_ID.has(id);
}

export function emptyTotals() {
  return { impressions: 0, clicks: 0, spend: 0, conversions: 0, sales: 0 };
}

/** Sum the five base counters over a list of rows. */
export function sumRows(rows) {
  const out = emptyTotals();
  for (const r of rows || []) {
    for (const k of BASE_METRICS) out[k] += Number(r[k]) || 0;
  }
  return out;
}

/** Add every derived metric to a totals object (safe divisions: 0 when undefined). */
export function deriveMetrics(totals) {
  const t = { ...emptyTotals(), ...totals };
  const div = (a, b) => (b > 0 ? a / b : 0);
  return {
    ...t,
    ctr: div(t.clicks, t.impressions),
    cpc: div(t.spend, t.clicks),
    cvr: div(t.conversions, t.clicks),
    roas: div(t.sales, t.spend),
    acos: div(t.spend, t.sales),
  };
}

/** Rows whose date falls inside `range` (inclusive). */
export function rowsInRange(rows, range) {
  return (rows || []).filter((r) => r.date >= range.from && r.date <= range.to);
}

/** Totals + derived metrics for one campaign over a range. */
export function summarizeCampaign(campaign, range) {
  const rows = rowsInRange(campaign.performance, range);
  return { ...deriveMetrics(sumRows(rows)), days: rows.length };
}

/** Totals + derived metrics across many campaigns over a range. */
export function summarizeCampaigns(campaigns, range) {
  const totals = emptyTotals();
  let days = 0;
  for (const c of campaigns) {
    const rows = rowsInRange(c.performance, range);
    days += rows.length;
    const s = sumRows(rows);
    for (const k of BASE_METRICS) totals[k] += s[k];
  }
  return { ...deriveMetrics(totals), days };
}

/**
 * One point per day of the range (zero-filled where nothing was served),
 * summed across the given campaigns, with derived metrics per day.
 * @returns {{date: string, impressions, clicks, spend, conversions, sales, ctr, cpc, cvr, roas, acos}[]}
 */
export function dailySeries(campaigns, range) {
  const byDate = new Map(eachDay(range.from, range.to).map((d) => [d, emptyTotals()]));
  for (const c of campaigns) {
    for (const r of rowsInRange(c.performance, range)) {
      const acc = byDate.get(r.date);
      if (!acc) continue;
      for (const k of BASE_METRICS) acc[k] += Number(r[k]) || 0;
    }
  }
  return [...byDate].map(([date, totals]) => ({ date, ...deriveMetrics(totals) }));
}

/**
 * Relative change of a metric between two periods.
 * @returns {{delta: number, pct: number|null, direction: 'up'|'down'|'flat', tone: 'good'|'bad'|'neutral'}}
 *   `pct` is null when the previous value is 0 (no meaningful percentage).
 */
export function changeBetween(metricId, current, previous) {
  const metric = getMetric(metricId);
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const delta = cur - prev;
  const direction = Math.abs(delta) < 1e-9 ? 'flat' : delta > 0 ? 'up' : 'down';
  const pct = prev > 0 ? delta / prev : null;
  let tone = 'neutral';
  if (direction !== 'flat' && metric && metric.good !== 'neutral') {
    tone = (direction === 'up') === (metric.good === 'up') ? 'good' : 'bad';
  }
  return { delta, pct, direction, tone };
}

/**
 * Format a metric value for display.
 * `compact` abbreviates long figures (1.2M, $12.3K); `axis` is for chart
 * ticks, where cents are noise once amounts reach whole dollars.
 */
export function formatMetric(metricId, value, { locale = 'en-US', currency, compact = false, axis = false } = {}) {
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

function formatCompactCount(v, locale) {
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  } catch {
    return formatNumber(v, { locale });
  }
}

/**
 * Apply the dashboard filters to the campaign list. `status: 'all'` means
 * every live campaign (active or paused); archived campaigns only show up
 * when asked for explicitly.
 */
export function filterCampaigns(campaigns, { status = 'all', type = null, query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return campaigns.filter((c) => {
    if (status === 'all' ? c.status === ARCHIVED_STATUS : c.status !== status) return false;
    if (type && c.type !== type) return false;
    if (q && !c.name.toLowerCase().includes(q) && !c.products.some((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))) return false;
    return true;
  });
}

/** How many campaigns the default ("all") filter hides because they are archived. */
export function countArchived(campaigns) {
  return campaigns.filter((c) => c.status === ARCHIVED_STATUS).length;
}

/** Columns the grid can sort by, mapped to a value accessor over a grid row. */
const SORT_ACCESSORS = {
  name: (row) => row.campaign.name.toLowerCase(),
  status: (row) => getStatus(row.campaign.status)?.order ?? 99,
  type: (row) => row.campaign.type,
  budget: (row) => row.campaign.dailyBudget,
  startDate: (row) => row.campaign.startDate,
  endDate: (row) => row.campaign.endDate || '\uffff', // ongoing campaigns sort after every dated one (ascending)
  createdAt: (row) => row.campaign.createdAt,
  products: (row) => row.campaign.products.length,
};

/**
 * Sort grid rows (`{ campaign, metrics }`) by a column. Metric ids are valid
 * keys too. Ties fall back to newest-first so the order is stable.
 */
export function sortCampaignRows(rows, { key = 'createdAt', dir = 'desc' } = {}) {
  const accessor = SORT_ACCESSORS[key] || (isMetricId(key) ? (row) => row.metrics[key] : SORT_ACCESSORS.createdAt);
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    let cmp = 0;
    if (typeof va === 'string' || typeof vb === 'string') cmp = String(va).localeCompare(String(vb));
    else cmp = (Number(va) || 0) - (Number(vb) || 0);
    return cmp * sign || b.campaign.createdAt - a.campaign.createdAt;
  });
}
