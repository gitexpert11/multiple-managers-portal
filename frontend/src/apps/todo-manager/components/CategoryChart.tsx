import { ArcElement, Chart, DoughnutController, Tooltip, type ChartData, type ChartOptions } from 'chart.js';
import { useMemo, useState } from 'react';
import { useChart } from '@shared/hooks/useChart';
import { cssToken, withAlpha } from '@shared/lib/color';
import { plural } from '@shared/lib/plural';
import { Icon } from '@shared/ui/Icon';
import { monthLabel } from '../lib/dates';
import type { CategorySlice } from '../lib/stats';

Chart.register(DoughnutController, ArcElement, Tooltip);

const percent = (share: number) => `${Math.round((Number(share) || 0) * 100)}%`;

/** Tooltip title for a slice (hovering a section of the doughnut). */
export function tooltipTitle(slice: CategorySlice | undefined): string {
  return slice ? slice.label : '';
}

/**
 * Tooltip body lines for a slice: count + share, the open/completed split,
 * and overdue / due-today counts only when there are any.
 */
export function tooltipLines(slice: CategorySlice | undefined): string[] {
  if (!slice) return [];
  const lines = [`${plural(slice.count, 'task')} · ${percent(slice.share)} of the month`];
  lines.push(`${slice.open} open · ${slice.completed} completed`);
  const attention: string[] = [];
  if (slice.overdue) attention.push(`${slice.overdue} overdue`);
  if (slice.dueToday) attention.push(`${slice.dueToday} due today`);
  if (attention.length) lines.push(attention.join(' · '));
  return lines;
}

/** Short status summary shown under each legend entry. */
export function legendMeta(slice: CategorySlice): string {
  const parts = [`${slice.open} open`, `${slice.completed} done`];
  if (slice.overdue) parts.push(`${slice.overdue} overdue`);
  return parts.join(' · ');
}

interface CategoryChartProps {
  slices: CategorySlice[];
  selectedCategoryId: string | null;
  month: string;
  scopeLabel?: string;
  theme?: string;
  onSelect: (categoryId: string | null) => void;
}

/**
 * Doughnut of the month's tasks by category.
 *
 * Hovering a section shows a tooltip with that category's details and
 * highlights its legend row (and vice versa). Clicking a section or a legend
 * row selects that category — the parent filters the task list — and clicking
 * it again, or "All categories", clears the selection.
 */
export function CategoryChart({ slices, selectedCategoryId, month, scopeLabel = 'All tasks', theme, onSelect }: CategoryChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  // A selection that is not on the chart (other month, filtered out) is shown as "none".
  const selected = slices.some((s) => s.categoryId === selectedCategoryId) ? selectedCategoryId : null;
  const total = slices.reduce((a, s) => a + s.count, 0);
  const hasData = slices.length > 0;

  const toggle = (categoryId: string | undefined) => {
    if (!categoryId) return;
    onSelect(selected === categoryId ? null : categoryId);
  };

  const data = useMemo<ChartData<'doughnut'>>(
    () => ({
      labels: slices.map((s) => s.label),
      datasets: [
        {
          data: slices.map((s) => s.count),
          // Dim the non-selected sections so the selection is visible on the chart itself.
          backgroundColor: slices.map((s) => (selected == null || selected === s.categoryId ? s.color : withAlpha(s.color, 0.25))),
          borderColor: cssToken('--surface', '#fff'),
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slices, selected, theme],
  );

  const options = useMemo<ChartOptions<'doughnut'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      animation: { duration: 350 },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: true,
          callbacks: {
            title: (items) => tooltipTitle(slices[items[0]?.dataIndex ?? -1]),
            label: (item) => tooltipLines(slices[item.dataIndex]),
          },
        },
      },
      onClick: (_evt, elements) => {
        const first = elements[0];
        if (!first) return;
        toggle(slices[first.index]?.categoryId);
      },
      onHover: (evt, elements) => {
        const target = evt?.native?.target as HTMLElement | null | undefined;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
        const first = elements[0];
        setHovered(first ? (slices[first.index]?.categoryId ?? null) : null);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slices, selected],
  );

  const { canvasRef, chartRef } = useChart('doughnut', data, options);

  /** Highlight the section of the hovered legend row (and show its tooltip). */
  function highlightSlice(index: number | null) {
    const chart = chartRef.current;
    if (!chart) return;
    const active = index == null ? [] : [{ datasetIndex: 0, index }];
    chart.setActiveElements(active);
    chart.tooltip?.setActiveElements(active, { x: 0, y: 0 });
    chart.update();
  }

  const sel = slices.find((s) => s.categoryId === selected);
  const noun = scopeLabel === 'All tasks' ? 'tasks' : scopeLabel.toLowerCase();

  return (
    <section className="todo-panel todo-chart-panel" data-testid="todo-chart">
      <div className="todo-panel__head">
        <div>
          <h2 className="todo-panel__title">Tasks by category</h2>
          <p className="todo-panel__hint">
            {month ? `${monthLabel(month)} · ` : ''}
            {scopeLabel} · hover a section for details, click to filter the list
          </p>
        </div>
      </div>
      <div className="todo-chart" hidden={!hasData}>
        <div className="todo-chart__canvas-wrap">
          <canvas ref={canvasRef} role="img" aria-label="Tasks by category" />
          <div className="todo-chart__center" aria-hidden="true">
            {hasData && (
              <>
                <span className="todo-chart__center-value">{String(sel ? sel.count : total)}</span>
                <span className="todo-chart__center-caption">{sel ? sel.label : plural(total, 'task').replace(/^\d+ /, '')}</span>
              </>
            )}
          </div>
        </div>
        <ul className="todo-chart-legend" aria-label="Task categories">
          {hasData && (
            <li>
              <button type="button" className={`todo-chart-legend__item todo-chart-legend__item--all${selected == null ? ' is-active' : ''}`} aria-pressed={selected == null ? 'true' : 'false'} onClick={() => onSelect(null)}>
                <span className="todo-chart-legend__swatch todo-chart-legend__swatch--all" />
                <span className="todo-chart-legend__text">
                  <span className="todo-chart-legend__name">All categories</span>
                </span>
                <span className="todo-chart-legend__count">{plural(total, 'task')}</span>
                <span className="todo-chart-legend__share">100%</span>
              </button>
            </li>
          )}
          {slices.map((s, index) => {
            const active = selected === s.categoryId;
            return (
              <li key={s.categoryId}>
                <button
                  type="button"
                  className={`todo-chart-legend__item${active ? ' is-active' : ''}${hovered === s.categoryId ? ' is-hover' : ''}`}
                  aria-pressed={active ? 'true' : 'false'}
                  data-category-id={s.categoryId}
                  title={tooltipLines(s).join('\n')}
                  onClick={() => toggle(s.categoryId)}
                  onMouseEnter={() => highlightSlice(index)}
                  onMouseLeave={() => highlightSlice(null)}
                  onFocus={() => highlightSlice(index)}
                  onBlur={() => highlightSlice(null)}
                >
                  <span className="todo-chart-legend__swatch" style={{ '--cat-color': s.color } as React.CSSProperties}>
                    <Icon name={s.icon} size={13} />
                  </span>
                  <span className="todo-chart-legend__text">
                    <span className="todo-chart-legend__name">{s.label}</span>
                    <span className="todo-chart-legend__meta">{legendMeta(s)}</span>
                  </span>
                  <span className="todo-chart-legend__count">{plural(s.count, 'task')}</span>
                  <span className="todo-chart-legend__share">{percent(s.share)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="todo-empty todo-empty--compact" hidden={hasData}>
        {month ? `No ${noun} due in ${monthLabel(month)} to chart.` : 'No tasks to chart.'}
      </p>
    </section>
  );
}
