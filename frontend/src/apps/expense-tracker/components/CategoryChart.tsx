import { ArcElement, Chart, DoughnutController, Tooltip, type ChartData, type ChartOptions } from 'chart.js';
import { useMemo } from 'react';
import { useChart } from '@shared/hooks/useChart';
import { cssToken, withAlpha } from '@shared/lib/color';
import { formatMoney } from '../lib/money';
import type { CategorySlice } from '../lib/stats';
import type { TxType } from '../types';

Chart.register(DoughnutController, ArcElement, Tooltip);

const COPY: Record<TxType, { title: string; ariaLabel: string; centerCaption: string; empty: string }> = {
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

interface CategoryChartProps {
  type: TxType;
  slices: CategorySlice[];
  selectedCategoryId: string | null;
  currency: string;
  locale: string;
  /** Any value that changes when the theme does, so chart colours are re-read. */
  theme?: string;
  onSelect: (categoryId: string | null) => void;
}

/**
 * Doughnut of categories for one transaction type in the selected month.
 * Clicking a slice or a legend entry selects that category (filtering the
 * matching grid); clicking it again, or "All", clears the selection.
 */
export function CategoryChart({ type, slices, selectedCategoryId, currency, locale, theme, onSelect }: CategoryChartProps) {
  const copy = COPY[type];
  const selected = selectedCategoryId ?? null;
  const total = slices.reduce((a, s) => a + s.amount, 0);
  const hasData = slices.length > 0;
  const fmt = (cents: number) => formatMoney(cents, { currency, locale });

  const toggle = (categoryId: string) => onSelect(selected === categoryId ? null : categoryId);

  const data = useMemo<ChartData<'doughnut'>>(
    () => ({
      labels: slices.map((s) => s.name),
      datasets: [
        {
          data: slices.map((s) => s.amount / 100),
          // Dim the non-selected slices so the selection is visible on the chart itself.
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
          callbacks: {
            label: (item) => {
              const s = slices[item.dataIndex];
              return s ? ` ${fmt(s.amount)} · ${Math.round(s.share * 100)}%` : '';
            },
          },
        },
      },
      onClick: (_evt, elements) => {
        const first = elements[0];
        if (!first) return;
        const s = slices[first.index];
        if (s) toggle(s.categoryId);
      },
      onHover: (evt, elements) => {
        const target = evt.native?.target as HTMLElement | null | undefined;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slices, selected, currency, locale],
  );

  const { canvasRef } = useChart('doughnut', data, options);
  const sel = slices.find((s) => s.categoryId === selected);

  return (
    <section className={`panel chart-panel chart-panel--${type}`} data-testid={`chart-${type}`}>
      <div className="panel__head">
        <h2 className="panel__title">{copy.title}</h2>
        <p className="panel__hint">Click a slice to filter the list</p>
      </div>
      <div className="chart" hidden={!hasData}>
        <div className="chart__canvas-wrap">
          <canvas ref={canvasRef} role="img" aria-label={copy.ariaLabel} />
          <div className="chart__center" aria-hidden="true">
            {hasData && (
              <>
                <span className="chart__center-value">{fmt(sel ? sel.amount : total)}</span>
                <span className="chart__center-caption">{sel ? sel.name : copy.centerCaption}</span>
              </>
            )}
          </div>
        </div>
        <ul className="chart-legend" aria-label={`${type === 'income' ? 'Income' : 'Expense'} categories`}>
          {hasData && (
            <li>
              <button
                type="button"
                className={`chart-legend__item chart-legend__item--all${selected == null ? ' is-active' : ''}`}
                aria-pressed={selected == null ? 'true' : 'false'}
                onClick={() => onSelect(null)}
              >
                <span className="swatch swatch--all" />
                <span className="chart-legend__name">All categories</span>
                <span className="chart-legend__amount">{fmt(total)}</span>
                <span className="chart-legend__share">100%</span>
              </button>
            </li>
          )}
          {slices.map((s) => {
            const active = selected === s.categoryId;
            return (
              <li key={s.categoryId}>
                <button
                  type="button"
                  className={`chart-legend__item${active ? ' is-active' : ''}`}
                  aria-pressed={active ? 'true' : 'false'}
                  data-category-id={s.categoryId}
                  onClick={() => toggle(s.categoryId)}
                >
                  <span className="swatch" style={{ background: s.color }} />
                  <span className="chart-legend__name">{s.name}</span>
                  <span className="chart-legend__amount">{fmt(s.amount)}</span>
                  <span className="chart-legend__share">{Math.round(s.share * 100)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="empty-state" hidden={hasData}>
        {copy.empty}
      </p>
    </section>
  );
}
