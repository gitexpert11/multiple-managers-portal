import { MONTH_NAMES, currentMonthKey, makeMonthKey, monthLabel, shiftMonth, splitMonthKey } from '../lib/dates.js';
import { h, icon, replaceChildren } from './dom.js';

/** Years offered around the current one even when no task falls in them. */
const YEARS_BACK = 2;
const YEARS_AHEAD = 2;

/**
 * Month + year picker with previous/next/today controls, scoping the
 * dashboard to the tasks due in that month.
 *
 * Unlike the Expense Tracker's picker there is no upper bound: tasks are due
 * in the future, so future months are first-class. The year list always
 * covers a couple of years either side of today plus any year that has a task.
 */
export function createMonthPicker(container, { onChange, now = () => new Date() }) {
  let value = currentMonthKey(now());
  let years = [];

  const monthSelect = h('select', {
    class: 'todo-month-picker__select',
    'aria-label': 'Month',
    onchange: () => emit(makeMonthKey(splitMonthKey(value).year, Number(monthSelect.value))),
  });
  const yearSelect = h('select', {
    class: 'todo-month-picker__select',
    'aria-label': 'Year',
    onchange: () => emit(makeMonthKey(Number(yearSelect.value), splitMonthKey(value).month)),
  });

  const prevBtn = h('button', { class: 'todo-month-picker__btn', type: 'button', 'aria-label': 'Previous month', onclick: () => emit(shiftMonth(value, -1)) }, icon('chevronLeft'));
  const nextBtn = h('button', { class: 'todo-month-picker__btn', type: 'button', 'aria-label': 'Next month', onclick: () => emit(shiftMonth(value, 1)) }, icon('chevronRight'));
  const todayBtn = h('button', { class: 'todo-btn todo-btn--ghost todo-month-picker__today', type: 'button', onclick: () => emit(currentMonthKey(now())) }, 'Today');
  const label = h('span', { class: 'todo-month-picker__label', 'aria-live': 'polite' });

  const root = h(
    'div',
    { class: 'todo-month-picker', role: 'group', 'aria-label': 'Select month', 'data-testid': 'todo-month-picker' },
    prevBtn,
    h('div', { class: 'todo-month-picker__selects' }, monthSelect, yearSelect),
    nextBtn,
    todayBtn,
    label,
  );
  container.append(root);

  function emit(next) {
    if (next === value) return;
    onChange(next);
  }

  function renderYears(selectedYear) {
    const { year: thisYear } = splitMonthKey(currentMonthKey(now()));
    const min = Math.min(thisYear - YEARS_BACK, selectedYear, ...years);
    const max = Math.max(thisYear + YEARS_AHEAD, selectedYear, ...years);
    replaceChildren(
      yearSelect,
      ...Array.from({ length: max - min + 1 }, (_, i) => h('option', { value: String(min + i) }, String(min + i))),
    );
  }

  function syncControls() {
    const { year, month } = splitMonthKey(value);
    renderYears(year);
    monthSelect.value = String(month);
    yearSelect.value = String(year);
    label.textContent = monthLabel(value);
    const isCurrent = value === currentMonthKey(now());
    todayBtn.hidden = isCurrent;
    root.classList.toggle('is-current', isCurrent);
  }

  replaceChildren(monthSelect, ...MONTH_NAMES.map((name, i) => h('option', { value: String(i + 1) }, name)));

  return {
    root,
    /** @param {{month: string, availableYears?: number[]}} props */
    update({ month, availableYears = [] }) {
      value = month;
      years = availableYears;
      syncControls();
    },
  };
}
