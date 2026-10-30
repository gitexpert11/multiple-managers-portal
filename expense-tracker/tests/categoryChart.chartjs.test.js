/**
 * The doughnut's Chart.js wiring (tooltip, click, hover, dimming). jsdom has
 * no 2D canvas, so Chart.js is replaced by a fake that records its config and
 * lets the real callbacks be driven directly. The HTML legend behaviour is
 * covered in categoryChart.test.js.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const instances = [];
vi.mock('chart.js', () => {
  class FakeChart {
    constructor(ctx, config) {
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.update = vi.fn();
      this.destroy = vi.fn();
      instances.push(this);
    }
    static register() {}
  }
  return { Chart: FakeChart, DoughnutController: {}, ArcElement: {}, Tooltip: {} };
});

const { createCategoryChart } = await import('../src/ui/categoryChart.js');

const slices = [
  { categoryId: 'cat_food', name: 'Food & Dining', color: '#f97316', amount: 7500, share: 0.75 },
  { categoryId: 'cat_transport', name: 'Transport', color: '#0ea5e9', amount: 2500, share: 0.25 },
];
const props = (over = {}) => ({ slices, selectedCategoryId: null, currency: 'USD', locale: 'en-US', ...over });

let host;
let onSelect;
let chart;
let realGetContext;
const fake = () => instances.at(-1);

beforeEach(() => {
  instances.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  onSelect = vi.fn();
  realGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = () => ({ fake2d: true });
  chart = createCategoryChart(host, { type: 'expense', onSelect });
});

afterEach(() => {
  chart.destroy();
  host.remove();
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

describe('chart construction', () => {
  it('positive: builds one doughnut with amounts in major units and the category colours', () => {
    chart.update(props());
    expect(instances).toHaveLength(1);
    const c = fake();
    expect(c.config.type).toBe('doughnut');
    expect(c.options.cutout).toBe('68%');
    expect(c.options.plugins.legend.display).toBe(false);
    expect(c.data.labels).toEqual(['Food & Dining', 'Transport']);
    expect(c.data.datasets[0].data).toEqual([75, 25]);
    expect(c.data.datasets[0].backgroundColor).toEqual(['#f97316', '#0ea5e9']);
    expect(c.update).toHaveBeenCalledTimes(1);
  });

  it('positive: re-uses the same chart across updates and dims non-selected slices', () => {
    chart.update(props());
    chart.update(props({ selectedCategoryId: 'cat_transport' }));
    expect(instances).toHaveLength(1);
    expect(fake().data.datasets[0].backgroundColor).toEqual(['rgba(249, 115, 22, 0.25)', '#0ea5e9']);
    chart.update(props({ selectedCategoryId: null }));
    expect(fake().data.datasets[0].backgroundColor).toEqual(['#f97316', '#0ea5e9']);
  });

  it('negative: no chart is built while there is nothing to draw', () => {
    chart.update(props({ slices: [] }));
    expect(instances).toHaveLength(0);
  });

  it('edge: destroy() then update() builds a fresh chart', () => {
    chart.update(props());
    const first = fake();
    chart.destroy();
    expect(first.destroy).toHaveBeenCalledTimes(1);
    chart.update(props());
    expect(instances).toHaveLength(2);
  });
});

describe('hover tooltip', () => {
  it('positive: shows the formatted amount and share of the hovered slice', () => {
    chart.update(props());
    const { label } = fake().options.plugins.tooltip.callbacks;
    expect(label({ dataIndex: 0 })).toBe(' $75.00 · 75%');
    expect(label({ dataIndex: 1 })).toBe(' $25.00 · 25%');
  });

  it('positive: follows the configured currency', () => {
    chart.update(props({ currency: 'EUR', locale: 'de-DE' }));
    expect(fake().options.plugins.tooltip.callbacks.label({ dataIndex: 0 })).toContain('75,00');
  });

  it('edge: shares round rather than truncate', () => {
    chart.update(props({ slices: [{ ...slices[0], share: 2 / 3 }, { ...slices[1], share: 1 / 3 }] }));
    const { label } = fake().options.plugins.tooltip.callbacks;
    expect(label({ dataIndex: 0 })).toMatch(/67%$/);
    expect(label({ dataIndex: 1 })).toMatch(/33%$/);
  });
});

describe('click and hover on slices', () => {
  it('positive: clicking a slice selects its category; clicking the selected one clears', () => {
    chart.update(props());
    const { onClick } = fake().options;
    onClick({}, [{ index: 1 }]);
    expect(onSelect).toHaveBeenLastCalledWith('cat_transport');
    chart.update(props({ selectedCategoryId: 'cat_transport' }));
    onClick({}, [{ index: 1 }]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('negative: clicking empty canvas space selects nothing', () => {
    chart.update(props());
    fake().options.onClick({}, []);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('positive: the cursor becomes a pointer over a slice and reverts elsewhere', () => {
    chart.update(props());
    const target = document.createElement('canvas');
    fake().options.onHover({ native: { target } }, [{ index: 0 }]);
    expect(target.style.cursor).toBe('pointer');
    fake().options.onHover({ native: { target } }, []);
    expect(target.style.cursor).toBe('default');
  });

  it('negative: hover without a native target is harmless', () => {
    chart.update(props());
    expect(() => fake().options.onHover({}, [{ index: 0 }])).not.toThrow();
    expect(() => fake().options.onHover({ native: null }, [])).not.toThrow();
  });
});
