import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js';
import { monthLabel } from '../lib/dates.js';
import { h, icon, replaceChildren } from './dom.js';

Chart.register(DoughnutController, ArcElement, Tooltip);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const percent = (share) => `${Math.round((Number(share) || 0) * 100)}%`;

/** Tooltip title for a slice (hovering a section of the doughnut). */
export function tooltipTitle(slice) {
  return slice ? slice.label : '';
}

/**
 * Tooltip body lines for a slice: count + share, the open/completed split,
 * and overdue / due-today counts only when there are any.
 */
export function tooltipLines(slice) {
  if (!slice) return [];
  const lines = [`${plural(slice.count, 'task')} · ${percent(slice.share)} of the month`];
  lines.push(`${slice.open} open · ${slice.completed} completed`);
  const attention = [];
  if (slice.overdue) attention.push(`${slice.overdue} overdue`);
  if (slice.dueToday) attention.push(`${slice.dueToday} due today`);
  if (attention.length) lines.push(attention.join(' · '));
  return lines;
}

/** Short status summary shown under each legend entry. */
export function legendMeta(slice) {
  const parts = [`${slice.open} open`, `${slice.completed} done`];
  if (slice.overdue) parts.push(`${slice.overdue} overdue`);
  return parts.join(' · ');
}

/**
 * Doughnut of the month's tasks by category.
 *
 * Hovering a section shows a tooltip with that category's details and
 * highlights its legend row (and vice versa). Clicking a section or a legend
 * row selects that category — the parent filters the task list — and clicking
 * it again, or "All categories", clears the selection.
 *
 * @param {{onSelect: (categoryId: string|null) => void}} opts
 */
export function createCategoryChart(container, { onSelect }) {
  let chart = null;
  let slices = [];
  let selected = null;
  let month = '';

  const canvas = h('canvas', { role: 'img', 'aria-label': 'Tasks by category' });
  const centerLabel = h('div', { class: 'todo-chart__center', 'aria-hidden': 'true' });
  const legend = h('ul', { class: 'todo-chart-legend', 'aria-label': 'Task categories' });
  const empty = h('p', { class: 'todo-empty todo-empty--compact', hidden: true });
  const chartWrap = h('div', { class: 'todo-chart__canvas-wrap' }, canvas, centerLabel);
  const body = h('div', { class: 'todo-chart' }, chartWrap, legend);
  const subtitle = h('p', { class: 'todo-panel__hint' }, 'Hover a section for details · click to filter the list');

  const root = h(
    'section',
    { class: 'todo-panel todo-chart-panel', 'data-testid': 'todo-chart' },
    h('div', { class: 'todo-panel__head' }, h('div', {}, h('h2', { class: 'todo-panel__title' }, 'Tasks by category'), subtitle)),
    body,
    empty,
  );
  container.append(root);

  // --- Chart.js ---------------------------------------------------------------

  function ensureChart() {
    if (chart) return chart;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null; // e.g. jsdom — the legend still works on its own
    chart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 2, hoverOffset: 8 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: { duration: 350 },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: true,
            callbacks: {
              title: (items) => tooltipTitle(slices[items[0]?.dataIndex]),
              label: (item) => tooltipLines(slices[item.dataIndex]),
            },
          },
        },
        onClick: (_evt, elements) => {
          if (!elements.length) return;
          toggle(slices[elements[0].index]?.categoryId);
        },
        onHover: (evt, elements) => {
          if (evt?.native?.target) evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
          setHover(elements.length ? slices[elements[0].index]?.categoryId : null);
        },
      },
    });
    return chart;
  }

  function toggle(categoryId) {
    if (!categoryId) return;
    onSelect(selected === categoryId ? null : categoryId);
  }

  /** Highlight the legend row of the hovered section. */
  function setHover(categoryId) {
    for (const item of legend.querySelectorAll('.todo-chart-legend__item[data-category-id]')) {
      item.classList.toggle('is-hover', Boolean(categoryId) && item.dataset.categoryId === categoryId);
    }
  }

  /** Highlight the section of the hovered legend row (and show its tooltip). */
  function highlightSlice(index) {
    if (!chart) return;
    const active = index == null ? [] : [{ datasetIndex: 0, index }];
    chart.setActiveElements(active);
    chart.tooltip?.setActiveElements(active, { x: 0, y: 0 });
    chart.update();
  }

  // --- legend --------------------------------------------------------------------

  function renderLegend(total) {
    const items = slices.map((s, index) => {
      const active = selected === s.categoryId;
      return h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: `todo-chart-legend__item${active ? ' is-active' : ''}`,
            'aria-pressed': active ? 'true' : 'false',
            'data-category-id': s.categoryId,
            title: tooltipLines(s).join('\n'),
            onclick: () => toggle(s.categoryId),
            onmouseenter: () => highlightSlice(index),
            onmouseleave: () => highlightSlice(null),
            onfocus: () => highlightSlice(index),
            onblur: () => highlightSlice(null),
          },
          h('span', { class: 'todo-chart-legend__swatch', style: { '--cat-color': s.color } }, icon(s.icon, 13)),
          h('span', { class: 'todo-chart-legend__text' }, h('span', { class: 'todo-chart-legend__name' }, s.label), h('span', { class: 'todo-chart-legend__meta' }, legendMeta(s))),
          h('span', { class: 'todo-chart-legend__count' }, plural(s.count, 'task')),
          h('span', { class: 'todo-chart-legend__share' }, percent(s.share)),
        ),
      );
    });
    const allBtn = h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: `todo-chart-legend__item todo-chart-legend__item--all${selected == null ? ' is-active' : ''}`,
          'aria-pressed': selected == null ? 'true' : 'false',
          onclick: () => onSelect(null),
        },
        h('span', { class: 'todo-chart-legend__swatch todo-chart-legend__swatch--all' }),
        h('span', { class: 'todo-chart-legend__text' }, h('span', { class: 'todo-chart-legend__name' }, 'All categories')),
        h('span', { class: 'todo-chart-legend__count' }, plural(total, 'task')),
        h('span', { class: 'todo-chart-legend__share' }, '100%'),
      ),
    );
    replaceChildren(legend, allBtn, ...items);
  }

  return {
    root,
    /** @param {{slices: object[], selectedCategoryId?: string|null, month: string, scopeLabel?: string}} props */
    update({ slices: next, selectedCategoryId = null, month: nextMonth, scopeLabel = 'All tasks' }) {
      slices = Array.isArray(next) ? next : [];
      month = nextMonth || month;
      // A selection that is not on the chart (other month, filtered out) is shown as "none".
      selected = slices.some((s) => s.categoryId === selectedCategoryId) ? selectedCategoryId : null;
      const total = slices.reduce((a, s) => a + s.count, 0);
      const hasData = slices.length > 0;

      subtitle.textContent = `${month ? monthLabel(month) + ' · ' : ''}${scopeLabel} · hover a section for details, click to filter the list`;
      empty.hidden = hasData;
      body.hidden = !hasData;
      if (!hasData) {
        const noun = scopeLabel === 'All tasks' ? 'tasks' : scopeLabel.toLowerCase();
        empty.textContent = month ? `No ${noun} due in ${monthLabel(month)} to chart.` : 'No tasks to chart.';
        replaceChildren(legend); // drop stale rows (and any hover state) rather than just hiding them
        replaceChildren(centerLabel);
        return;
      }

      const c = ensureChart();
      if (c) {
        c.data.labels = slices.map((s) => s.label);
        c.data.datasets[0].data = slices.map((s) => s.count);
        c.data.datasets[0].borderColor = getComputedStyle(root).getPropertyValue('--surface') || '#fff';
        // Dim the non-selected sections so the selection is visible on the chart itself.
        c.data.datasets[0].backgroundColor = slices.map((s) => (selected == null || selected === s.categoryId ? s.color : withAlpha(s.color, 0.25)));
        c.update();
      }
      const sel = slices.find((s) => s.categoryId === selected);
      replaceChildren(
        centerLabel,
        h('span', { class: 'todo-chart__center-value' }, String(sel ? sel.count : total)),
        h('span', { class: 'todo-chart__center-caption' }, sel ? sel.label : plural(total, 'task').replace(/^\d+ /, '')),
      );
      renderLegend(total);
    },
    destroy() {
      chart?.destroy();
      chart = null;
    },
  };
}

export function withAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
