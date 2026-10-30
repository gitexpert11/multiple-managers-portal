import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMonthPicker } from '../src/ui/monthPicker.js';

const NOW = new Date(2025, 2, 15); // 15 March 2025

let host;
let onChange;
let picker;

const q = (sel) => host.querySelector(sel);
const yearValues = () => [...q('select[aria-label=Year]').options].map((o) => Number(o.value));
const monthOptions = () => [...q('select[aria-label=Month]').options];

function setSelect(sel, value) {
  const el = q(sel);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  onChange = vi.fn();
  picker = createMonthPicker(host, { onChange, now: () => NOW });
  picker.update({ month: '2025-03' });
});

afterEach(() => host.remove());

describe('rendering', () => {
  it('shows the selected month in the selects and an accessible label', () => {
    expect(q('select[aria-label=Month]').value).toBe('3');
    expect(q('select[aria-label=Year]').value).toBe('2025');
    expect(q('.todo-month-picker__label').textContent).toBe('March 2025');
    expect(monthOptions().map((o) => o.textContent)[0]).toBe('January');
    expect(monthOptions()).toHaveLength(12);
    expect(q('[role=group]').getAttribute('aria-label')).toBe('Select month');
  });

  it('hides "Today" on the current month and shows it elsewhere', () => {
    expect(q('.todo-month-picker__today').hidden).toBe(true);
    picker.update({ month: '2025-05' });
    expect(q('.todo-month-picker__today').hidden).toBe(false);
    expect(q('.todo-month-picker__label').textContent).toBe('May 2025');
  });
});

describe('navigation', () => {
  it('moves one month back and forward, crossing year boundaries', () => {
    q('[aria-label="Previous month"]').click();
    expect(onChange).toHaveBeenLastCalledWith('2025-02');
    q('[aria-label="Next month"]').click();
    expect(onChange).toHaveBeenLastCalledWith('2025-04');

    picker.update({ month: '2025-12' });
    q('[aria-label="Next month"]').click();
    expect(onChange).toHaveBeenLastCalledWith('2026-01');
    picker.update({ month: '2025-01' });
    q('[aria-label="Previous month"]').click();
    expect(onChange).toHaveBeenLastCalledWith('2024-12');
  });

  it('allows future months — tasks are due in the future', () => {
    const next = q('[aria-label="Next month"]');
    expect(next.disabled).toBe(false);
    picker.update({ month: '2027-03' });
    expect(next.disabled).toBe(false);
    expect(monthOptions().every((o) => !o.disabled)).toBe(true);
    next.click();
    expect(onChange).toHaveBeenLastCalledWith('2027-04');
  });

  it('emits from the month and year selects and the Today button', () => {
    setSelect('select[aria-label=Month]', '11');
    expect(onChange).toHaveBeenLastCalledWith('2025-11');
    setSelect('select[aria-label=Year]', '2026');
    expect(onChange).toHaveBeenLastCalledWith('2026-03');
    picker.update({ month: '2026-03' });
    q('.todo-month-picker__today').click();
    expect(onChange).toHaveBeenLastCalledWith('2025-03');
  });

  it('does not emit when the chosen month is already selected', () => {
    setSelect('select[aria-label=Month]', '3');
    setSelect('select[aria-label=Year]', '2025');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('year range', () => {
  it('offers two years either side of today by default', () => {
    expect(yearValues()).toEqual([2023, 2024, 2025, 2026, 2027]);
  });

  it('extends to cover years that have tasks and the selected year', () => {
    picker.update({ month: '2025-03', availableYears: [2021, 2030] });
    expect(yearValues()[0]).toBe(2021);
    expect(yearValues().at(-1)).toBe(2030);
    picker.update({ month: '2019-06' });
    expect(yearValues()[0]).toBe(2019);
    expect(q('select[aria-label=Year]').value).toBe('2019');
  });
});
