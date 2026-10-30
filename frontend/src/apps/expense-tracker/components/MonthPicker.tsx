import { Icon } from '@shared/ui/Icon';
import { MONTH_NAMES, clampMonthKey, makeMonthKey, monthLabel, shiftMonth, splitMonthKey } from '../lib/dates';

interface MonthPickerProps {
  month: string;
  /** The latest month that can be selected (the current month). */
  maxMonth: string;
  /** The current month according to the injected clock (for the "Today" button). */
  currentMonth: string;
  availableYears?: number[];
  onChange: (month: string) => void;
}

/**
 * Month + year picker with previous/next/today controls.
 * Uses native <select>s (not <input type="month">) so it behaves identically
 * in every browser, including desktop Safari and Firefox.
 *
 * Navigation is capped at `maxMonth`: the "next" button is disabled there,
 * later years are not offered, and later months of the final year are disabled.
 */
export function MonthPicker({ month, maxMonth, currentMonth, availableYears = [], onChange }: MonthPickerProps) {
  const value = clampMonthKey(month, maxMonth);
  const { year, month: m } = splitMonthKey(value);
  const { year: maxYear, month: maxM } = splitMonthKey(maxMonth);
  const minYear = Math.min(maxYear - 10, year, ...availableYears);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);

  const emit = (next: string) => {
    const clamped = clampMonthKey(next, maxMonth);
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className="month-picker" role="group" aria-label="Select month">
      <button className="icon-btn" type="button" aria-label="Previous month" onClick={() => emit(shiftMonth(value, -1))}>
        <Icon name="chevronLeft" />
      </button>
      <div className="month-picker__selects">
        <select className="month-picker__select" aria-label="Month" value={String(m)} onChange={(e) => emit(makeMonthKey(year, Number(e.target.value)))}>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={String(i + 1)} disabled={year === maxYear && i + 1 > maxM}>
              {name}
            </option>
          ))}
        </select>
        <select className="month-picker__select" aria-label="Year" value={String(year)} onChange={(e) => emit(makeMonthKey(Number(e.target.value), m))}>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <button className="icon-btn" type="button" aria-label="Next month" disabled={value >= maxMonth} aria-disabled={value >= maxMonth} onClick={() => emit(shiftMonth(value, 1))}>
        <Icon name="chevronRight" />
      </button>
      <button className="btn btn--ghost btn--sm" type="button" hidden={value === currentMonth} onClick={() => emit(currentMonth)}>
        Today
      </button>
      <span className="month-picker__label" aria-live="polite">
        {monthLabel(value)}
      </span>
    </div>
  );
}
