import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMonthPicker } from '../src/ui/monthPicker.js';

const NOW = new Date(2026, 9, 27); // 27 October 2026

let host;
let onChange;
let picker;

const q = (sel) => host.querySelector(sel);
const monthOptions = () => [...q('select[aria-label=Month]').options];
const yearValues = () => [...q('select[aria-label=Year]').options].map((o) => Number(o.value));

function setSelect(sel, value) {
  const el = q(sel);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  host = document.createElement('div');
  document.body.append(host);
  onChange = vi.fn();
  picker = createMonthPicker(host, { onChange });
  picker.update({ month: '2026-10', maxMonth: '2026-10' });
});

afterEach(() => {
  host.remove();
  vi.useRealTimers();
});

describe('future months are not selectable', () => {
  it('disables "Next month" when on the latest allowed month', () => {
    const next = q('[aria-label="Next month"]');
    expect(next.disabled).toBe(true);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    next.click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('re-enables "Next month" once an earlier month is shown', () => {
    picker.update({ month: '2026-09', maxMonth: '2026-10' });
    const next = q('[aria-label="Next month"]');
    expect(next.disabled).toBe(false);
    next.click();
    expect(onChange).toHaveBeenCalledWith('2026-10');
  });

  it('does not offer years after the current one', () => {
    const years = yearValues();
    expect(Math.max(...years)).toBe(2026);
    expect(Math.min(...years)).toBeLessThanOrEqual(2016);
  });

  it('disables months after the current month in the current year', () => {
    const disabled = monthOptions().filter((o) => o.disabled).map((o) => o.value);
    expect(disabled).toEqual(['11', '12']);
  });

  it('enables every month for an earlier year', () => {
    picker.update({ month: '2025-10', maxMonth: '2026-10' });
    expect(monthOptions().some((o) => o.disabled)).toBe(false);
  });

  it('clamps a programmatic selection of a future month', () => {
    setSelect('select[aria-label=Month]', '12'); // December 2026
    expect(onChange).not.toHaveBeenCalled();
    expect(q('select[aria-label=Month]').value).toBe('10'); // snapped back
    expect(q('.month-picker__label').textContent).toBe('October 2026');
  });

  it('clamps when switching to the current year from a later month of a past year', () => {
    picker.update({ month: '2025-12', maxMonth: '2026-10' });
    setSelect('select[aria-label=Year]', '2026'); // December 2026 would be future
    expect(onChange).toHaveBeenCalledWith('2026-10');
  });

  it('clamps the month passed in via update()', () => {
    picker.update({ month: '2027-03', maxMonth: '2026-10' });
    expect(q('.month-picker__label').textContent).toBe('October 2026');
  });

  it('still allows navigating backwards freely', () => {
    q('[aria-label="Previous month"]').click();
    expect(onChange).toHaveBeenCalledWith('2026-09');
    picker.update({ month: '2026-01', maxMonth: '2026-10' });
    q('[aria-label="Previous month"]').click();
    expect(onChange).toHaveBeenCalledWith('2025-12');
  });

  it('still offers years that contain existing data, as long as they are not in the future', () => {
    picker.update({ month: '2026-10', maxMonth: '2026-10', availableYears: [2010, 2031] });
    const years = yearValues();
    expect(years).toContain(2010);
    expect(years).not.toContain(2031);
  });
});
