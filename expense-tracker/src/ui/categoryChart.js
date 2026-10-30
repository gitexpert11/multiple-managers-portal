import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js';
import { formatMoney } from '../lib/money.js';
import { h, replaceChildren } from './dom.js';

Chart.register(DoughnutController, ArcElement, Tooltip);

const COPY = {
  expense: {
    title: 'Spending by category',
    ariaLabel: 'Expenses by category',
    centerCaption: 'Total spent',
    empty: 'No expenses this month yet. Add one to see the breakdown.',
  },
  income: {
    title: 'Income by category',
    ariaLabel: 'Income by category',
    centerCaption: 'Total earned',
    empty: 'No income this month yet. Add some to see the breakdown.',
  },
};

/**
 * Doughnut of categories for one transaction type in the selected month.
 * Clicking a slice or a legend entry selects that category (filtering the
 * matching grid); clicking it again, or "All", clears the selection.
 *
 * @param {{type: 'expense'|'income', onSelect: (id: string|null) => void}} opts
 */
export function createCategoryChart(container, { type = 'expense', onSelect }) {
  const copy = COPY[type];
  if (!copy) throw new Error('type must be "expense" or "income"');
  let chart = null;
  let slices = [];
  let selected = null;
  let fmtOpts = { currency: 'USD', locale: 'en-US' };

  const canvas = h('canvas', { role: 'img', 'aria-label': copy.ariaLabel });
  const centerLabel = h('div', { class: 'chart__center', 'aria-hidden': 'true' });
  const legend = h('ul', { class: 'chart-legend', 'aria-label': `${type === 'income' ? 'Income' : 'Expense'} categories` });
  const empty = h('p', { class: 'empty-state', hidden: true }, copy.empty);
  const chartWrap = h('div', { class: 'chart__canvas-wrap' }, canvas, centerLabel);

  const root = h(
    'section',
    { class: `panel chart-panel chart-panel--${type}`, 'data-testid': `chart-${type}` },
    h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, copy.title), h('p', { class: 'panel__hint' }, 'Click a slice to filter the list')),
    h('div', { class: 'chart' }, chartWrap, legend),
    empty,
  );
  container.append(root);

  function ensureChart() {
    if (chart) return chart;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null; // e.g. jsdom — legend still works
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
            callbacks: {
              label: (item) => {
                const s = slices[item.dataIndex];
                return ` ${formatMoney(s.amount, fmtOpts)} · ${Math.round(s.share * 100)}%`;
              },
            },
          },
        },
        onClick: (_evt, elements) => {
          if (!elements.length) return;
          toggle(slices[elements[0].index].categoryId);
        },
        onHover: (evt, elements) => {
          if (evt.native?.target) evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
        },
      },
    });
    return chart;
  }

  function toggle(categoryId) {
    onSelect(selected === categoryId ? null : categoryId);
  }

  function renderLegend(total) {
    const items = slices.map((s) => {
      const active = selected === s.categoryId;
      return h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: `chart-legend__item${active ? ' is-active' : ''}`,
            'aria-pressed': active ? 'true' : 'false',
            'data-category-id': s.categoryId,
            onclick: () => toggle(s.categoryId),
          },
          h('span', { class: 'swatch', style: { background: s.color } }),
          h('span', { class: 'chart-legend__name' }, s.name),
          h('span', { class: 'chart-legend__amount' }, formatMoney(s.amount, fmtOpts)),
          h('span', { class: 'chart-legend__share' }, `${Math.round(s.share * 100)}%`),
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
          class: `chart-legend__item chart-legend__item--all${selected == null ? ' is-active' : ''}`,
          'aria-pressed': selected == null ? 'true' : 'false',
          onclick: () => onSelect(null),
        },
        h('span', { class: 'swatch swatch--all' }),
        h('span', { class: 'chart-legend__name' }, 'All categories'),
        h('span', { class: 'chart-legend__amount' }, formatMoney(total, fmtOpts)),
        h('span', { class: 'chart-legend__share' }, '100%'),
      ),
    );
    replaceChildren(legend, allBtn, ...items);
  }

  return {
    root,
    /** @param {{slices: object[], selectedCategoryId: string|null, currency: string, locale: string}} props */
    update(props) {
      slices = props.slices;
      selected = props.selectedCategoryId ?? null;
      fmtOpts = { currency: props.currency, locale: props.locale };
      const total = slices.reduce((a, s) => a + s.amount, 0);
      const hasData = slices.length > 0;

      empty.hidden = hasData;
      root.querySelector('.chart').hidden = !hasData;
      if (!hasData) return;

      const c = ensureChart();
      if (c) {
        c.data.labels = slices.map((s) => s.name);
        c.data.datasets[0].data = slices.map((s) => s.amount / 100);
        c.data.datasets[0].backgroundColor = slices.map((s) => s.color);
        c.data.datasets[0].borderColor = getComputedStyle(root).getPropertyValue('--surface') || '#fff';
        // Dim the non-selected slices so the selection is visible on the chart itself.
        c.data.datasets[0].backgroundColor = slices.map((s) =>
          selected == null || selected === s.categoryId ? s.color : withAlpha(s.color, 0.25),
        );
        c.update();
      }
      const sel = slices.find((s) => s.categoryId === selected);
      replaceChildren(
        centerLabel,
        h('span', { class: 'chart__center-value' }, formatMoney(sel ? sel.amount : total, fmtOpts)),
        h('span', { class: 'chart__center-caption' }, sel ? sel.name : copy.centerCaption),
      );
      renderLegend(total);
    },
    destroy() {
      chart?.destroy();
      chart = null;
    },
  };
}

function withAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
