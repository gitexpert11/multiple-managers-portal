import { CategoryScale, Chart, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import { formatDay } from '../lib/dates.js';
import { METRICS, formatMetric, getMetric } from '../lib/metrics.js';
import { h, icon, replaceChildren } from './dom.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

/** How many metrics can be plotted at once (one per y-axis). */
export const MAX_CHART_METRICS = 2;
export const DEFAULT_CHART_METRICS = ['spend', 'sales'];

/** Colour of the n-th plotted metric; the first follows the theme's primary colour. */
const SERIES_COLORS = [null, '#ec4899'];

/**
 * Next selection after clicking a metric chip: toggles the metric, keeps at
 * least one selected and at most MAX_CHART_METRICS (the oldest is dropped).
 */
export function toggleMetric(selected, metricId) {
  if (selected.includes(metricId)) {
    return selected.length > 1 ? selected.filter((m) => m !== metricId) : selected;
  }
  return [...selected, metricId].slice(-MAX_CHART_METRICS);
}

/** Tooltip title: the full date of the hovered point. */
export function tooltipTitle(series, index, locale = 'en-US') {
  const point = series[index];
  return point ? formatDay(point.date, locale) : '';
}

/** Tooltip body: "Spend: $123.45". */
export function tooltipLabel(metricId, value, locale = 'en-US', currency) {
  return `${getMetric(metricId)?.label || metricId}: ${formatMetric(metricId, value, { locale, currency })}`;
}

/**
 * Daily line chart of the selected period. Up to two metrics at once, each on
 * its own y-axis; the chips above the chart choose which.
 *
 * @param {{onMetricsChange: (metrics: string[]) => void}} opts
 */
export function createPerformanceChart(container, { onMetricsChange }) {
  let chart = null;
  let series = [];
  let metrics = [...DEFAULT_CHART_METRICS];
  let locale = 'en-US';
  let currency;

  const canvas = h('canvas', { role: 'img', 'aria-label': 'Campaign performance over time' });
  const canvasWrap = h('div', { class: 'ads-chart__canvas-wrap' }, canvas);
  const empty = h('p', { class: 'ads-empty ads-empty--compact', hidden: true });
  const subtitle = h('p', { class: 'ads-panel__hint' });
  const chips = h('div', { class: 'ads-chip-row', role: 'group', 'aria-label': 'Metrics to chart' });
  const summaryList = h('dl', { class: 'ads-chart__totals', 'data-testid': 'ads-chart-totals' });

  const root = h(
    'section',
    { class: 'ads-panel ads-chart-panel', 'data-testid': 'ads-chart' },
    h('div', { class: 'ads-panel__head' }, h('div', {}, h('h2', { class: 'ads-panel__title' }, 'Performance over time'), subtitle), summaryList),
    chips,
    canvasWrap,
    empty,
  );
  container.append(root);

  // --- chips ------------------------------------------------------------------
  function renderChips() {
    replaceChildren(
      chips,
      ...METRICS.map((m) => {
        const position = metrics.indexOf(m.id);
        const active = position >= 0;
        return h(
          'button',
          {
            type: 'button',
            class: `ads-chip${active ? ' is-active' : ''}`,
            'data-metric': m.id,
            'aria-pressed': active ? 'true' : 'false',
            title: m.description,
            style: active ? { '--chip-color': seriesColor(position) } : null,
            onclick: () => onMetricsChange(toggleMetric(metrics, m.id)),
          },
          active ? h('span', { class: 'ads-chip__dot', 'aria-hidden': 'true' }) : null,
          m.short,
        );
      }),
    );
  }

  function seriesColor(position) {
    return SERIES_COLORS[position] || cssVar('--primary', '#4f46e5');
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    return v || fallback;
  }

  // --- Chart.js -----------------------------------------------------------------
  function ensureChart() {
    if (chart) return chart;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null; // e.g. jsdom — chips and totals still work on their own
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => tooltipTitle(series, items[0]?.dataIndex, locale),
              label: (item) => tooltipLabel(item.dataset.metricId, item.parsed.y, locale, currency),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { position: 'left', beginAtZero: true, ticks: { callback: (v) => formatMetric(metrics[0], v, { locale, currency, compact: true, axis: true }) } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: (v) => formatMetric(metrics[1], v, { locale, currency, compact: true, axis: true }) } },
        },
      },
    });
    return chart;
  }

  function datasetFor(metricId, position) {
    const color = seriesColor(position);
    return {
      metricId,
      label: getMetric(metricId)?.label || metricId,
      data: series.map((p) => p[metricId]),
      yAxisID: position === 0 ? 'y' : 'y1',
      borderColor: color,
      backgroundColor: withAlpha(color, 0.12),
      fill: position === 0,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: series.length > 45 ? 0 : 3,
      pointHoverRadius: 5,
      pointBackgroundColor: color,
    };
  }

  function renderTotals() {
    replaceChildren(
      summaryList,
      ...metrics.map((id, i) => {
        const total = chartTotal(series, id);
        return h(
          'div',
          { class: 'ads-chart__total', style: { '--chip-color': seriesColor(i) } },
          h('dt', {}, h('span', { class: 'ads-chip__dot', 'aria-hidden': 'true' }), getMetric(id)?.label || id),
          h('dd', { 'data-testid': `ads-chart-total-${id}` }, formatMetric(id, total, { locale, currency })),
        );
      }),
    );
  }

  return {
    root,
    /**
     * @param {{series: object[], metrics: string[], range: {label: string, days: number}, hasCampaigns: boolean, locale?: string, currency?: string}} props
     *   `series` has one point per day (see dailySeries()); `metrics` are the
     *   metric ids to plot, in order (first = left axis, second = right axis).
     */
    update(props) {
      series = Array.isArray(props.series) ? props.series : [];
      metrics = (props.metrics || DEFAULT_CHART_METRICS).filter(getMetric).slice(0, MAX_CHART_METRICS);
      if (!metrics.length) metrics = [...DEFAULT_CHART_METRICS];
      locale = props.locale || locale;
      currency = props.currency || currency;
      const hasData = series.some((p) => p.impressions > 0 || p.spend > 0 || p.sales > 0 || p.clicks > 0);

      subtitle.textContent = `${props.range?.label || ''} · daily · ${metrics.map((m) => getMetric(m).label).join(' and ')}`;
      renderChips();
      renderTotals();

      empty.hidden = hasData;
      canvasWrap.hidden = !hasData;
      if (!hasData) {
        empty.textContent = props.hasCampaigns ? 'No performance data in this period yet.' : 'Create a campaign (or load sample data) to see performance here.';
        return;
      }

      const c = ensureChart();
      if (!c) return;
      c.data.labels = series.map((p) => formatDay(p.date, locale, { year: false }));
      c.data.datasets = metrics.map(datasetFor);
      c.options.scales.y1.display = metrics.length > 1;
      const muted = cssVar('--text-muted', '#626a85');
      const border = cssVar('--border', '#e3e6ef');
      for (const axis of Object.values(c.options.scales)) {
        axis.ticks = { ...axis.ticks, color: muted };
        axis.grid = { ...axis.grid, color: border };
      }
      c.update();
    },
    /** Exposed for tests / hosts. */
    get metrics() {
      return [...metrics];
    },
    destroy() {
      chart?.destroy();
      chart = null;
    },
  };
}

/** Sum of a base metric over the series, or the ratio-of-sums for derived ones. */
export function chartTotal(series, metricId) {
  const sum = (k) => series.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const div = (a, b) => (b > 0 ? a / b : 0);
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
      return sum(metricId);
  }
}

export function withAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
