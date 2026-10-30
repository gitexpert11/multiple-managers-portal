import { CategoryScale, Chart, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip, type ChartData, type ChartOptions } from 'chart.js';
import { useMemo } from 'react';
import { useChart } from '@shared/hooks/useChart';
import { cssToken, withAlpha } from '@shared/lib/color';
import { formatDay } from '../lib/dates';
import { METRICS, chartTotal, formatMetric, getMetric } from '../lib/metrics';
import type { MetricId, SeriesPoint } from '../types';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

/** How many metrics can be plotted at once (one per y-axis). */
export const MAX_CHART_METRICS = 2;
export const DEFAULT_CHART_METRICS: MetricId[] = ['spend', 'sales'];

/** Colour of the n-th plotted metric; the first follows the theme's primary colour. */
const SERIES_COLORS: Array<string | null> = [null, '#ec4899'];

/**
 * Next selection after clicking a metric chip: toggles the metric, keeps at
 * least one selected and at most MAX_CHART_METRICS (the oldest is dropped).
 */
export function toggleMetric(selected: MetricId[], metricId: MetricId): MetricId[] {
  if (selected.includes(metricId)) {
    return selected.length > 1 ? selected.filter((m) => m !== metricId) : selected;
  }
  return [...selected, metricId].slice(-MAX_CHART_METRICS);
}

/** Tooltip title: the full date of the hovered point. */
export function tooltipTitle(series: SeriesPoint[], index: number | undefined, locale = 'en-US'): string {
  const point = index == null ? undefined : series[index];
  return point ? formatDay(point.date, locale) : '';
}

/** Tooltip body: "Spend: $123.45". */
export function tooltipLabel(metricId: string, value: number, locale = 'en-US', currency?: string): string {
  return `${getMetric(metricId)?.label || metricId}: ${formatMetric(metricId, value, { locale, currency })}`;
}

interface PerformanceChartProps {
  series: SeriesPoint[];
  metrics: MetricId[];
  range: { label: string; days: number };
  hasCampaigns: boolean;
  currency: string;
  locale?: string;
  theme?: string;
  onMetricsChange: (metrics: MetricId[]) => void;
}

/**
 * Daily line chart of the selected period. Up to two metrics at once, each on
 * its own y-axis; the chips above the chart choose which.
 */
export function PerformanceChart({ series, metrics: requested, range, hasCampaigns, currency, locale = 'en-US', theme, onMetricsChange }: PerformanceChartProps) {
  const metrics = useMemo(() => {
    const valid = requested.filter((m) => getMetric(m)).slice(0, MAX_CHART_METRICS);
    return valid.length ? valid : [...DEFAULT_CHART_METRICS];
  }, [requested]);
  const hasData = series.some((p) => p.impressions > 0 || p.spend > 0 || p.sales > 0 || p.clicks > 0);

  const seriesColor = (position: number) => SERIES_COLORS[position] || cssToken('--primary', '#4f46e5');

  const data = useMemo<ChartData<'line'>>(
    () => ({
      labels: series.map((p) => formatDay(p.date, locale, { year: false })),
      datasets: metrics.map((metricId, position) => {
        const color = seriesColor(position);
        return {
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
      }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, metrics, locale, theme],
  );

  const options = useMemo<ChartOptions<'line'>>(() => {
    const muted = cssToken('--text-muted', '#626a85');
    const border = cssToken('--border', '#e3e6ef');
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => tooltipTitle(series, items[0]?.dataIndex, locale),
            label: (item) => tooltipLabel(metrics[item.datasetIndex] as string, item.parsed.y as number, locale, currency),
          },
        },
      },
      scales: {
        x: { grid: { display: false, color: border }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, color: muted } },
        y: { position: 'left', beginAtZero: true, grid: { color: border }, ticks: { color: muted, callback: (v) => formatMetric(metrics[0] as string, Number(v), { locale, currency, compact: true, axis: true }) } },
        y1: {
          position: 'right',
          beginAtZero: true,
          display: metrics.length > 1,
          grid: { drawOnChartArea: false, color: border },
          ticks: { color: muted, callback: (v) => formatMetric(metrics[1] as string, Number(v), { locale, currency, compact: true, axis: true }) },
        },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, metrics, locale, currency, theme]);

  const { canvasRef } = useChart('line', data, options);

  return (
    <section className="ads-panel ads-chart-panel" data-testid="ads-chart">
      <div className="ads-panel__head">
        <div>
          <h2 className="ads-panel__title">Performance over time</h2>
          <p className="ads-panel__hint">
            {range.label} · daily · {metrics.map((m) => getMetric(m)?.label).join(' and ')}
          </p>
        </div>
        <dl className="ads-chart__totals" data-testid="ads-chart-totals">
          {metrics.map((id, i) => (
            <div key={id} className="ads-chart__total" style={{ '--chip-color': seriesColor(i) } as React.CSSProperties}>
              <dt>
                <span className="ads-chip__dot" aria-hidden="true" />
                {getMetric(id)?.label || id}
              </dt>
              <dd data-testid={`ads-chart-total-${id}`}>{formatMetric(id, chartTotal(series, id), { locale, currency })}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="ads-chip-row" role="group" aria-label="Metrics to chart">
        {METRICS.map((m) => {
          const position = metrics.indexOf(m.id);
          const active = position >= 0;
          return (
            <button
              key={m.id}
              type="button"
              className={`ads-chip${active ? ' is-active' : ''}`}
              data-metric={m.id}
              aria-pressed={active ? 'true' : 'false'}
              title={m.description}
              style={active ? ({ '--chip-color': seriesColor(position) } as React.CSSProperties) : undefined}
              onClick={() => onMetricsChange(toggleMetric(metrics, m.id))}
            >
              {active && <span className="ads-chip__dot" aria-hidden="true" />}
              {m.short}
            </button>
          );
        })}
      </div>
      <div className="ads-chart__canvas-wrap" hidden={!hasData}>
        <canvas ref={canvasRef} role="img" aria-label="Campaign performance over time" />
      </div>
      <p className="ads-empty ads-empty--compact" hidden={hasData}>
        {hasCampaigns ? 'No performance data in this period yet.' : 'Create a campaign (or load sample data) to see performance here.'}
      </p>
    </section>
  );
}
