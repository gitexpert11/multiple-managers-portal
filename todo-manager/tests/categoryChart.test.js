/**
 * Category doughnut tests.
 *
 * jsdom has no 2D canvas, so Chart.js is replaced with a small fake that
 * records the config it was built with. That lets the tests drive the real
 * hover / tooltip / click callbacks the component wires up, and assert what
 * the chart would draw (data, colours, dimming) — without a canvas.
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
      this.setActiveElements = vi.fn();
      this.tooltip = { setActiveElements: vi.fn() };
      instances.push(this);
    }
    static register() {}
  }
  return { Chart: FakeChart, DoughnutController: {}, ArcElement: {}, Tooltip: {} };
});

const { createCategoryChart, legendMeta, tooltipLines, tooltipTitle, withAlpha } = await import('../src/ui/categoryChart.js');

const slices = [
  { categoryId: 'office', label: 'Office', color: '#4f46e5', icon: 'briefcase', count: 3, open: 2, completed: 1, overdue: 1, dueToday: 1, share: 0.5 },
  { categoryId: 'home', label: 'Home', color: '#f97316', icon: 'home', count: 2, open: 0, completed: 2, overdue: 0, dueToday: 0, share: 1 / 3 },
  { categoryId: 'travel', label: 'Travel', color: '#0ea5e9', icon: 'plane', count: 1, open: 1, completed: 0, overdue: 0, dueToday: 0, share: 1 / 6 },
];

let host;
let onSelect;
let chart;
let realGetContext;

const q = (sel) => host.querySelector(sel);
const items = () => [...host.querySelectorAll('.todo-chart-legend__item[data-category-id]')];
const item = (id) => host.querySelector(`.todo-chart-legend__item[data-category-id="${id}"]`);
const all = () => host.querySelector('.todo-chart-legend__item--all');
const fake = () => instances.at(-1);
const render = (over = {}) => chart.update({ slices, selectedCategoryId: null, month: '2025-03', ...over });

beforeEach(() => {
  instances.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  onSelect = vi.fn();
  realGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = () => ({ fake2d: true }); // lets the component construct the (fake) chart
  chart = createCategoryChart(host, { onSelect });
});

afterEach(() => {
  chart.destroy();
  host.remove();
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

// ---------------------------------------------------------------------------
describe('tooltip text (pure helpers)', () => {
  it('positive: title is the category label; lines give count, share, split and attention counts', () => {
    expect(tooltipTitle(slices[0])).toBe('Office');
    expect(tooltipLines(slices[0])).toEqual(['3 tasks · 50% of the month', '2 open · 1 completed', '1 overdue · 1 due today']);
  });

  it('edge: omits the attention line when nothing is overdue or due today, and uses singular forms', () => {
    expect(tooltipLines(slices[2])).toEqual(['1 task · 17% of the month', '1 open · 0 completed']);
    expect(tooltipLines(slices[1])).toEqual(['2 tasks · 33% of the month', '0 open · 2 completed']);
    expect(tooltipLines({ ...slices[0], overdue: 2, dueToday: 0 })[2]).toBe('2 overdue');
    expect(tooltipLines({ ...slices[0], overdue: 0, dueToday: 1 })[2]).toBe('1 due today');
  });

  it('negative: tolerates a missing slice and junk shares', () => {
    expect(tooltipTitle(undefined)).toBe('');
    expect(tooltipLines(null)).toEqual([]);
    expect(tooltipLines({ ...slices[2], share: NaN })[0]).toBe('1 task · 0% of the month');
    expect(tooltipLines({ ...slices[2], share: 'abc' })[0]).toBe('1 task · 0% of the month');
  });

  it('legendMeta summarises open/done and adds overdue only when present', () => {
    expect(legendMeta(slices[0])).toBe('2 open · 1 done · 1 overdue');
    expect(legendMeta(slices[1])).toBe('0 open · 2 done');
  });

  it('withAlpha converts 6-digit hex and leaves anything else untouched', () => {
    expect(withAlpha('#4f46e5', 0.25)).toBe('rgba(79, 70, 229, 0.25)');
    expect(withAlpha('4f46e5', 1)).toBe('rgba(79, 70, 229, 1)');
    expect(withAlpha('red', 0.5)).toBe('red');
    expect(withAlpha('#fff', 0.5)).toBe('#fff');
    expect(withAlpha(undefined, 0.5)).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
describe('rendering', () => {
  it('positive: renders the panel, an accessible canvas and a legend with counts, shares and meta', () => {
    render();
    expect(q('[data-testid=todo-chart] .todo-panel__title').textContent).toBe('Tasks by category');
    expect(q('canvas').getAttribute('aria-label')).toBe('Tasks by category');
    expect(q('.todo-chart-legend').getAttribute('aria-label')).toBe('Task categories');
    expect(q('.todo-panel__hint').textContent).toBe('March 2025 · All tasks · hover a section for details, click to filter the list');

    expect(items().map((b) => b.querySelector('.todo-chart-legend__name').textContent)).toEqual(['Office', 'Home', 'Travel']);
    expect(items().map((b) => b.querySelector('.todo-chart-legend__count').textContent)).toEqual(['3 tasks', '2 tasks', '1 task']);
    expect(items().map((b) => b.querySelector('.todo-chart-legend__share').textContent)).toEqual(['50%', '33%', '17%']);
    expect(items().map((b) => b.querySelector('.todo-chart-legend__meta').textContent)).toEqual(['2 open · 1 done · 1 overdue', '0 open · 2 done', '1 open · 0 done']);
    expect(items()[0].querySelector('.todo-chart-legend__swatch').style.getPropertyValue('--cat-color')).toBe('#4f46e5');
    expect(items()[0].title).toBe('3 tasks · 50% of the month\n2 open · 1 completed\n1 overdue · 1 due today'); // native tooltip on the legend too

    expect(all().querySelector('.todo-chart-legend__count').textContent).toBe('6 tasks');
    expect(all().querySelector('.todo-chart-legend__share').textContent).toBe('100%');
    expect(all().getAttribute('aria-pressed')).toBe('true');
    expect(q('.todo-chart__center-value').textContent).toBe('6');
    expect(q('.todo-chart__center-caption').textContent).toBe('tasks');
    expect(q('.todo-empty').hidden).toBe(true);
    expect(q('.todo-chart').hidden).toBe(false);
  });

  it('positive: builds a doughnut with the slice counts and colours, and re-uses one chart across updates', () => {
    render();
    expect(instances).toHaveLength(1);
    const c = fake();
    expect(c.config.type).toBe('doughnut');
    expect(c.options.cutout).toBe('68%');
    expect(c.options.plugins.legend.display).toBe(false);
    expect(c.data.labels).toEqual(['Office', 'Home', 'Travel']);
    expect(c.data.datasets[0].data).toEqual([3, 2, 1]);
    expect(c.data.datasets[0].backgroundColor).toEqual(['#4f46e5', '#f97316', '#0ea5e9']);
    expect(c.update).toHaveBeenCalledTimes(1);

    render({ slices: slices.slice(0, 1) });
    expect(instances).toHaveLength(1);
    expect(c.data.datasets[0].data).toEqual([3]);
    expect(c.update).toHaveBeenCalledTimes(2);
  });

  it('negative: shows an empty state and no legend when there are no slices', () => {
    render({ slices: [] });
    expect(q('.todo-empty').hidden).toBe(false);
    expect(q('.todo-empty').textContent).toBe('No tasks due in March 2025 to chart.');
    expect(q('.todo-chart').hidden).toBe(true);
    expect(items()).toHaveLength(0);
    expect(instances).toHaveLength(0); // nothing to draw, so no chart is constructed

    render({ slices: [], scopeLabel: 'Open tasks' });
    expect(q('.todo-empty').textContent).toBe('No open tasks due in March 2025 to chart.');
  });

  it('negative: tolerates junk props (non-array slices, missing month)', () => {
    expect(() => chart.update({ slices: null, month: '' })).not.toThrow();
    expect(q('.todo-empty').textContent).toBe('No tasks to chart.');
    expect(() => chart.update({ slices: 'nope', month: '2025-03' })).not.toThrow();
    expect(q('.todo-chart').hidden).toBe(true);
  });

  it('edge: a single category fills the whole doughnut', () => {
    render({ slices: [{ ...slices[2], share: 1 }] });
    expect(items()).toHaveLength(1);
    expect(items()[0].querySelector('.todo-chart-legend__share').textContent).toBe('100%');
    expect(q('.todo-chart__center-value').textContent).toBe('1');
    expect(q('.todo-chart__center-caption').textContent).toBe('task');
    expect(fake().data.datasets[0].data).toEqual([1]);
  });

  it('edge: shares that do not divide evenly are rounded, not truncated', () => {
    render({ slices: [{ ...slices[0], share: 2 / 3 }, { ...slices[1], share: 1 / 3 }] });
    expect(items().map((b) => b.querySelector('.todo-chart-legend__share').textContent)).toEqual(['67%', '33%']);
  });

  it('edge: still renders the legend when no 2D context is available (e.g. jsdom, old browsers)', () => {
    HTMLCanvasElement.prototype.getContext = () => null;
    const host2 = document.createElement('div');
    document.body.append(host2);
    const plain = createCategoryChart(host2, { onSelect });
    plain.update({ slices, selectedCategoryId: null, month: '2025-03' });
    expect(instances).toHaveLength(0);
    expect(host2.querySelectorAll('.todo-chart-legend__item[data-category-id]')).toHaveLength(3);
    host2.querySelector('.todo-chart-legend__item[data-category-id="home"]').click();
    expect(onSelect).toHaveBeenCalledWith('home');
    // Hovering the legend must not blow up without a chart to highlight.
    expect(() => host2.querySelector('.todo-chart-legend__item[data-category-id="home"]').dispatchEvent(new Event('mouseenter'))).not.toThrow();
    plain.destroy();
    host2.remove();
  });
});

// ---------------------------------------------------------------------------
describe('selection', () => {
  it('positive: clicking a legend entry selects it; clicking the selected one again, or "All", clears', () => {
    render();
    item('home').click();
    expect(onSelect).toHaveBeenLastCalledWith('home');

    render({ selectedCategoryId: 'home' });
    expect(item('home').classList.contains('is-active')).toBe(true);
    expect(item('home').getAttribute('aria-pressed')).toBe('true');
    expect(item('office').getAttribute('aria-pressed')).toBe('false');
    expect(all().getAttribute('aria-pressed')).toBe('false');
    expect(q('.todo-chart__center-value').textContent).toBe('2');
    expect(q('.todo-chart__center-caption').textContent).toBe('Home');

    item('home').click();
    expect(onSelect).toHaveBeenLastCalledWith(null);
    all().click();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('positive: dims the non-selected sections on the chart itself', () => {
    render({ selectedCategoryId: 'travel' });
    expect(fake().data.datasets[0].backgroundColor).toEqual(['rgba(79, 70, 229, 0.25)', 'rgba(249, 115, 22, 0.25)', '#0ea5e9']);
    render({ selectedCategoryId: null });
    expect(fake().data.datasets[0].backgroundColor).toEqual(['#4f46e5', '#f97316', '#0ea5e9']);
  });

  it('positive: clicking a section of the doughnut toggles that category', () => {
    render();
    const { onClick } = fake().options;
    onClick({}, [{ index: 1 }]);
    expect(onSelect).toHaveBeenLastCalledWith('home');
    render({ selectedCategoryId: 'home' });
    onClick({}, [{ index: 1 }]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('negative: clicking empty canvas space, or an index that has no slice, selects nothing', () => {
    render();
    const { onClick } = fake().options;
    onClick({}, []);
    onClick({}, [{ index: 99 }]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('edge: a selected category that is not on the chart is treated as no selection', () => {
    render({ selectedCategoryId: 'personal' }); // no Personal slice this month
    expect(all().getAttribute('aria-pressed')).toBe('true');
    expect(items().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(q('.todo-chart__center-value').textContent).toBe('6');
    expect(fake().data.datasets[0].backgroundColor).toEqual(['#4f46e5', '#f97316', '#0ea5e9']); // nothing dimmed
  });
});

// ---------------------------------------------------------------------------
describe('hover', () => {
  it('positive: hovering a section yields a tooltip with the category details', () => {
    render();
    const { title, label } = fake().options.plugins.tooltip.callbacks;
    expect(title([{ dataIndex: 0 }])).toBe('Office');
    expect(label({ dataIndex: 0 })).toEqual(['3 tasks · 50% of the month', '2 open · 1 completed', '1 overdue · 1 due today']);
    expect(title([{ dataIndex: 2 }])).toBe('Travel');
    expect(label({ dataIndex: 2 })).toEqual(['1 task · 17% of the month', '1 open · 0 completed']);
  });

  it('negative: tooltip callbacks never throw for out-of-range or empty items', () => {
    render();
    const { title, label } = fake().options.plugins.tooltip.callbacks;
    expect(title([])).toBe('');
    expect(title([{ dataIndex: 42 }])).toBe('');
    expect(label({ dataIndex: 42 })).toEqual([]);
  });

  it('positive: hovering a section highlights its legend row and shows a pointer cursor', () => {
    render();
    const { onHover } = fake().options;
    const target = document.createElement('canvas');
    onHover({ native: { target } }, [{ index: 1 }]);
    expect(target.style.cursor).toBe('pointer');
    expect(item('home').classList.contains('is-hover')).toBe(true);
    expect(item('office').classList.contains('is-hover')).toBe(false);

    onHover({ native: { target } }, []);
    expect(target.style.cursor).toBe('default');
    expect(items().some((b) => b.classList.contains('is-hover'))).toBe(false);
  });

  it('negative: hover without a native event target, or an unknown index, is harmless', () => {
    render();
    const { onHover } = fake().options;
    expect(() => onHover({}, [{ index: 0 }])).not.toThrow();
    expect(() => onHover(undefined, [])).not.toThrow();
    expect(() => onHover({ native: {} }, [{ index: 99 }])).not.toThrow();
    expect(items().some((b) => b.classList.contains('is-hover'))).toBe(false);
  });

  it('positive: hovering (or focusing) a legend row highlights the matching section and its tooltip; leaving clears it', () => {
    render();
    const c = fake();
    item('travel').dispatchEvent(new Event('mouseenter'));
    expect(c.setActiveElements).toHaveBeenLastCalledWith([{ datasetIndex: 0, index: 2 }]);
    expect(c.tooltip.setActiveElements).toHaveBeenLastCalledWith([{ datasetIndex: 0, index: 2 }], { x: 0, y: 0 });
    expect(c.update).toHaveBeenCalled();

    item('travel').dispatchEvent(new Event('mouseleave'));
    expect(c.setActiveElements).toHaveBeenLastCalledWith([]);
    expect(c.tooltip.setActiveElements).toHaveBeenLastCalledWith([], { x: 0, y: 0 });

    item('office').dispatchEvent(new Event('focus'));
    expect(c.setActiveElements).toHaveBeenLastCalledWith([{ datasetIndex: 0, index: 0 }]);
    item('office').dispatchEvent(new Event('blur'));
    expect(c.setActiveElements).toHaveBeenLastCalledWith([]);
  });

  it('edge: the hover highlight is cleared when the chart becomes empty', () => {
    render();
    fake().options.onHover({ native: { target: document.createElement('canvas') } }, [{ index: 0 }]);
    expect(item('office').classList.contains('is-hover')).toBe(true);
    render({ slices: [] });
    expect(items()).toHaveLength(0);
    expect(q('.todo-chart').hidden).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('lifecycle', () => {
  it('destroy() tears the chart down and a later update builds a fresh one', () => {
    render();
    const first = fake();
    chart.destroy();
    expect(first.destroy).toHaveBeenCalledTimes(1);
    render();
    expect(instances).toHaveLength(2);
    expect(fake()).not.toBe(first);
    expect(() => chart.destroy()).not.toThrow();
    expect(() => chart.destroy()).not.toThrow(); // idempotent
  });
});
