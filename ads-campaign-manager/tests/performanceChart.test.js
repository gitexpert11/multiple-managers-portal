/**
 * jsdom has no 2D canvas, so Chart.js is replaced with a small fake that
 * records its config. That lets the tests assert what the chart would draw
 * (datasets, axes, colours) and drive the real tooltip callbacks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const instances = [];
vi.mock('chart.js', () => {
  class FakeChart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.update = vi.fn();
      this.destroy = vi.fn();
      instances.push(this);
    }
    static register() {}
  }
  return { Chart: FakeChart, LineController: {}, LineElement: {}, PointElement: {}, LinearScale: {}, CategoryScale: {}, Tooltip: {}, Legend: {}, Filler: {} };
});

const { DEFAULT_CHART_METRICS, MAX_CHART_METRICS, chartTotal, createPerformanceChart, toggleMetric, tooltipLabel, tooltipTitle, withAlpha } = await import('../src/ui/performanceChart.js');
const { dailySeries } = await import('../src/lib/metrics.js');

const range = { from: '2025-03-13', to: '2025-03-15', days: 3, label: 'Mar 13 – Mar 15, 2025' };
const campaign = {
  performance: [
    { date: '2025-03-13', impressions: 1000, clicks: 10, spend: 500, conversions: 1, sales: 2500 },
    { date: '2025-03-14', impressions: 2000, clicks: 30, spend: 900, conversions: 2, sales: 4000 },
  ],
};
const series = dailySeries([campaign], range);

let host;
let onMetricsChange;
let chart;
let realGetContext;
const fake = () => instances.at(-1);
const q = (sel) => host.querySelector(sel);
const chip = (id) => q(`.ads-chip[data-metric=${id}]`);

beforeEach(() => {
  instances.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  onMetricsChange = vi.fn();
  realGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = () => ({ fake2d: true });
  chart = createPerformanceChart(host, { onMetricsChange });
});

afterEach(() => {
  chart.destroy();
  host.remove();
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

describe('toggleMetric', () => {
  it('adds, removes, keeps at least one and at most two (dropping the oldest)', () => {
    expect(MAX_CHART_METRICS).toBe(2);
    expect(toggleMetric(['spend'], 'sales')).toEqual(['spend', 'sales']);
    expect(toggleMetric(['spend', 'sales'], 'spend')).toEqual(['sales']);
    expect(toggleMetric(['spend'], 'spend')).toEqual(['spend']);
    expect(toggleMetric(['spend', 'sales'], 'roas')).toEqual(['sales', 'roas']);
  });
});

describe('chart rendering', () => {
  it('builds one line chart with a dataset per selected metric on separate axes', () => {
    chart.update({ series, metrics: DEFAULT_CHART_METRICS, range, hasCampaigns: true });
    expect(instances).toHaveLength(1);
    const c = fake();
    expect(c.config.type).toBe('line');
    expect(c.data.labels).toEqual(['Mar 13', 'Mar 14', 'Mar 15']);
    expect(c.data.datasets.map((d) => d.metricId)).toEqual(['spend', 'sales']);
    expect(c.data.datasets[0].data).toEqual([500, 900, 0]);
    expect(c.data.datasets[1].data).toEqual([2500, 4000, 0]);
    expect(c.data.datasets.map((d) => d.yAxisID)).toEqual(['y', 'y1']);
    expect(c.data.datasets[0].fill).toBe(true);
    expect(c.data.datasets[1].fill).toBe(false);
    expect(c.options.scales.y1.display).toBe(true);
    expect(c.update).toHaveBeenCalledTimes(1);
    expect(c.options.interaction).toEqual({ mode: 'index', intersect: false });
  });

  it('a single metric hides the right axis; the chart instance is reused', () => {
    chart.update({ series, metrics: ['spend', 'sales'], range, hasCampaigns: true });
    chart.update({ series, metrics: ['clicks'], range, hasCampaigns: true });
    expect(instances).toHaveLength(1);
    const c = fake();
    expect(c.data.datasets.map((d) => d.metricId)).toEqual(['clicks']);
    expect(c.options.scales.y1.display).toBe(false);
    expect(chart.metrics).toEqual(['clicks']);
  });

  it('hides the points on long ranges', () => {
    const long = Array.from({ length: 60 }, (_, i) => ({ date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`, impressions: 1, clicks: 0, spend: 1, conversions: 0, sales: 0 }));
    chart.update({ series: long, metrics: ['spend'], range, hasCampaigns: true });
    expect(fake().data.datasets[0].pointRadius).toBe(0);
  });

  it('axis tick callbacks format in the metric’s unit', () => {
    chart.update({ series, metrics: ['spend', 'ctr'], range, hasCampaigns: true });
    const { y, y1 } = fake().options.scales;
    expect(y.ticks.callback(200000)).toBe('$2,000');
    expect(y1.ticks.callback(0.0125)).toBe('1.25%');
  });

  it('axis ticks, tooltips and totals follow the display currency', () => {
    chart.update({ series, metrics: ['spend', 'sales'], range, hasCampaigns: true, currency: 'EUR' });
    const { y } = fake().options.scales;
    expect(y.ticks.callback(200000)).toBe('€2,000');
    expect(fake().options.plugins.tooltip.callbacks.label({ dataset: { metricId: 'sales' }, parsed: { y: 4000 } })).toBe('Sales: €40.00');
    expect(q('[data-testid=ads-chart-total-spend]').textContent).toBe('€14.00');
    expect(tooltipLabel('cpc', 250, 'en-US', 'INR')).toBe('Cost per click: ₹2.50');
  });

  it('tooltip callbacks show the full date and labelled values', () => {
    chart.update({ series, metrics: ['spend', 'sales'], range, hasCampaigns: true });
    const { title, label } = fake().options.plugins.tooltip.callbacks;
    expect(title([{ dataIndex: 1 }])).toBe('Mar 14, 2025');
    expect(title([])).toBe('');
    expect(label({ dataset: { metricId: 'sales' }, parsed: { y: 4000 } })).toBe('Sales: $40.00');
    expect(tooltipTitle(series, 0)).toBe('Mar 13, 2025');
    expect(tooltipLabel('roas', 4.5)).toBe('Return on ad spend: 4.5x');
    expect(tooltipLabel('bogus', 1)).toBe('bogus: 1');
  });

  it('shows an empty state (and builds no chart) when nothing was served', () => {
    chart.update({ series: dailySeries([], range), metrics: ['spend'], range, hasCampaigns: true });
    expect(instances).toHaveLength(0);
    expect(q('.ads-chart__canvas-wrap').hidden).toBe(true);
    expect(q('.ads-empty').hidden).toBe(false);
    expect(q('.ads-empty').textContent).toMatch(/No performance data in this period/);
    chart.update({ series: [], metrics: ['spend'], range, hasCampaigns: false });
    expect(q('.ads-empty').textContent).toMatch(/Create a campaign/);
  });

  it('negative: without a canvas context the chips and totals still work', () => {
    HTMLCanvasElement.prototype.getContext = () => null;
    const c2 = createPerformanceChart(host, { onMetricsChange });
    c2.update({ series, metrics: ['spend'], range, hasCampaigns: true });
    expect(instances).toHaveLength(0);
    expect(host.querySelectorAll('[data-testid=ads-chart-total-spend]')).toHaveLength(1);
    c2.destroy();
  });

  it('negative: unknown metric ids are dropped, an empty list falls back to the default', () => {
    chart.update({ series, metrics: ['bogus'], range, hasCampaigns: true });
    expect(chart.metrics).toEqual(DEFAULT_CHART_METRICS);
    chart.update({ series, metrics: ['bogus', 'clicks', 'ctr', 'roas'], range, hasCampaigns: true });
    expect(chart.metrics).toEqual(['clicks', 'ctr']);
  });
});

describe('chips and totals', () => {
  it('renders a chip per metric, marks the selected ones and emits the toggled selection', () => {
    chart.update({ series, metrics: ['spend', 'sales'], range, hasCampaigns: true });
    expect(host.querySelectorAll('.ads-chip[data-metric]')).toHaveLength(10);
    expect(chip('spend').getAttribute('aria-pressed')).toBe('true');
    expect(chip('sales').classList.contains('is-active')).toBe(true);
    expect(chip('roas').getAttribute('aria-pressed')).toBe('false');
    chip('roas').click();
    expect(onMetricsChange).toHaveBeenCalledWith(['sales', 'roas']);
    chip('spend').click();
    expect(onMetricsChange).toHaveBeenLastCalledWith(['sales']);
  });

  it('shows a period total per plotted metric (ratio-of-sums for derived ones)', () => {
    chart.update({ series, metrics: ['spend', 'ctr'], range, hasCampaigns: true });
    expect(q('[data-testid=ads-chart-total-spend]').textContent).toBe('$14.00');
    expect(q('[data-testid=ads-chart-total-ctr]').textContent).toBe('1.33%');
    expect(q('.ads-panel__hint').textContent).toBe('Mar 13 – Mar 15, 2025 · daily · Spend and Click-through rate');
  });

  it('chartTotal covers every derived metric', () => {
    expect(chartTotal(series, 'spend')).toBe(1400);
    expect(chartTotal(series, 'cpc')).toBe(35);
    expect(chartTotal(series, 'cvr')).toBeCloseTo(0.075);
    expect(chartTotal(series, 'roas')).toBeCloseTo(6500 / 1400);
    expect(chartTotal(series, 'acos')).toBeCloseTo(1400 / 6500);
    expect(chartTotal([], 'roas')).toBe(0);
  });

  it('withAlpha converts hex colours and leaves others alone', () => {
    expect(withAlpha('#4f46e5', 0.2)).toBe('rgba(79, 70, 229, 0.2)');
    expect(withAlpha(' #4F46E5 ', 1)).toBe('rgba(79, 70, 229, 1)');
    expect(withAlpha('red', 0.2)).toBe('red');
  });
});
