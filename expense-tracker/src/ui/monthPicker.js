import { MONTH_NAMES, clampMonthKey, currentMonthKey, makeMonthKey, shiftMonth, splitMonthKey, monthLabel } from '../lib/dates.js';
import { h, icon, replaceChildren } from './dom.js';

/**
 * Month + year picker with previous/next/today controls.
 * Uses native <select>s (not <input type="month">) so it behaves identically
 * in every browser, including desktop Safari and Firefox.
 *
 * Navigation is capped at `maxMonth` (the current month by default): the
 * "next" button is disabled there, later years are not offered, and later
 * months of the final year are disabled. Any value that slips through (e.g.
 * keyboard selection of a disabled option in older browsers) is clamped.
 */
export function createMonthPicker(container, { onChange }) {
  let value = currentMonthKey();
  let maxMonth = currentMonthKey();
  let years = [];

  const monthSelect = h('select', {
    class: 'month-picker__select',
    'aria-label': 'Month',
    onchange: () => emit(makeMonthKey(splitMonthKey(value).year, Number(monthSelect.value))),
  });
  const yearSelect = h('select', {
    class: 'month-picker__select',
    'aria-label': 'Year',
    onchange: () => emit(makeMonthKey(Number(yearSelect.value), splitMonthKey(value).month)),
  });

  const prevBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous month', onclick: () => emit(shiftMonth(value, -1)) }, icon('chevronLeft'));
  const nextBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next month', onclick: () => emit(shiftMonth(value, 1)) }, icon('chevronRight'));
  const todayBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => emit(currentMonthKey()) }, 'Today');
  const label = h('span', { class: 'month-picker__label', 'aria-live': 'polite' });

  const root = h(
    'div',
    { class: 'month-picker', role: 'group', 'aria-label': 'Select month' },
    prevBtn,
    h('div', { class: 'month-picker__selects' }, monthSelect, yearSelect),
    nextBtn,
    todayBtn,
    label,
  );
  container.append(root);

  function emit(next) {
    next = clampMonthKey(next, maxMonth);
    if (next === value) {
      // Re-sync the selects in case the user picked something we clamped away.
      syncControls();
      return;
    }
    onChange(next);
  }

  function renderYears(selectedYear) {
    const { year: maxYear } = splitMonthKey(maxMonth);
    const min = Math.min(maxYear - 10, selectedYear, ...years);
    const max = maxYear; // never offer a future year
    replaceChildren(
      yearSelect,
      ...Array.from({ length: max - min + 1 }, (_, i) => {
        const y = min + i;
        return h('option', { value: String(y) }, String(y));
      }),
    );
  }

  function renderMonths(selectedYear) {
    const { year: maxYear, month: maxM } = splitMonthKey(maxMonth);
    for (const opt of monthSelect.options) {
      opt.disabled = selectedYear === maxYear && Number(opt.value) > maxM;
    }
  }

  function syncControls() {
    const { year, month: m } = splitMonthKey(value);
    renderYears(year);
    renderMonths(year);
    monthSelect.value = String(m);
    yearSelect.value = String(year);
    label.textContent = monthLabel(value);
    nextBtn.disabled = value >= maxMonth;
    nextBtn.setAttribute('aria-disabled', nextBtn.disabled ? 'true' : 'false');
    todayBtn.hidden = value === currentMonthKey();
  }

  replaceChildren(
    monthSelect,
    ...MONTH_NAMES.map((name, i) => h('option', { value: String(i + 1) }, name)),
  );

  return {
    /** @param {{month: string, availableYears?: number[], maxMonth?: string}} props */
    update({ month, availableYears = [], maxMonth: nextMax = currentMonthKey() }) {
      maxMonth = nextMax;
      value = clampMonthKey(month, maxMonth);
      years = availableYears;
      syncControls();
    },
  };
}
