import { Icon } from '@shared/ui/Icon';
import { MONTH_NAMES, makeMonthKey, monthLabel, shiftMonth, splitMonthKey } from '../lib/dates';

/** Years offered around the current one even when no task falls in them. */
const YEARS_BACK = 2;
const YEARS_AHEAD = 2;

interface MonthPickerProps {
  month: string;
  currentMonth: string;
  availableYears?: number[];
  onChange: (month: string) => void;
}

/**
 * Month + year picker with previous/next/today controls, scoping the
 * dashboard to the tasks due in that month.
 *
 * Unlike the Expense Tracker's picker there is no upper bound: tasks are due
 * in the future, so future months are first-class.
 */
export function MonthPicker({ month, currentMonth, availableYears = [], onChange }: MonthPickerProps) {
  const { year, month: m } = splitMonthKey(month);
  const { year: thisYear } = splitMonthKey(currentMonth);
  const min = Math.min(thisYear - YEARS_BACK, year, ...availableYears);
  const max = Math.max(thisYear + YEARS_AHEAD, year, ...availableYears);
  const years = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const isCurrent = month === currentMonth;
  const emit = (next: string) => {
    if (next !== month) onChange(next);
  };

  return (
    <div className={`todo-month-picker${isCurrent ? ' is-current' : ''}`} role="group" aria-label="Select month" data-testid="todo-month-picker">
      <button className="todo-month-picker__btn" type="button" aria-label="Previous month" onClick={() => emit(shiftMonth(month, -1))}>
        <Icon name="chevronLeft" />
      </button>
      <div className="todo-month-picker__selects">
        <select className="todo-month-picker__select" aria-label="Month" value={String(m)} onChange={(e) => emit(makeMonthKey(year, Number(e.target.value)))}>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={String(i + 1)}>
              {name}
            </option>
          ))}
        </select>
        <select className="todo-month-picker__select" aria-label="Year" value={String(year)} onChange={(e) => emit(makeMonthKey(Number(e.target.value), m))}>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <button className="todo-month-picker__btn" type="button" aria-label="Next month" onClick={() => emit(shiftMonth(month, 1))}>
        <Icon name="chevronRight" />
      </button>
      <button className="todo-btn todo-btn--ghost todo-month-picker__today" type="button" hidden={isCurrent} onClick={() => emit(currentMonth)}>
        Today
      </button>
      <span className="todo-month-picker__label" aria-live="polite">
        {monthLabel(month)}
      </span>
    </div>
  );
}
