import { describe, expect, it } from 'vitest';
import {
  clampMonthKey,
  formatDay,
  currentMonthKey,
  isMonthAfter,
  daysInMonth,
  defaultDateForMonth,
  isValidDayKey,
  isValidMonthKey,
  monthLabel,
  shiftMonth,
  splitMonthKey,
  todayKey,
} from '../src/lib/dates.js';

describe('month keys', () => {
  it('derives keys from a Date using local time', () => {
    const d = new Date(2025, 2, 9); // 9 March 2025
    expect(todayKey(d)).toBe('2025-03-09');
    expect(currentMonthKey(d)).toBe('2025-03');
  });

  it('splits and labels', () => {
    expect(splitMonthKey('2024-12')).toEqual({ year: 2024, month: 12 });
    expect(monthLabel('2024-12')).toBe('December 2024');
  });

  it('shifts across year boundaries in both directions', () => {
    expect(shiftMonth('2025-01', -1)).toBe('2024-12');
    expect(shiftMonth('2024-12', 1)).toBe('2025-01');
    expect(shiftMonth('2025-06', 18)).toBe('2026-12');
    expect(shiftMonth('2025-06', -30)).toBe('2022-12');
  });
});

describe('validation', () => {
  it('validates day keys including leap years', () => {
    expect(isValidDayKey('2024-02-29')).toBe(true);
    expect(isValidDayKey('2023-02-29')).toBe(false);
    expect(isValidDayKey('2024-13-01')).toBe(false);
    expect(isValidDayKey('2024-04-31')).toBe(false);
    expect(isValidDayKey('2024-4-1')).toBe(false);
    expect(isValidDayKey(20240401)).toBe(false);
  });

  it('validates month keys', () => {
    expect(isValidMonthKey('2024-01')).toBe(true);
    expect(isValidMonthKey('2024-00')).toBe(false);
    expect(isValidMonthKey('2024-1')).toBe(false);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
  });
});

describe('defaultDateForMonth', () => {
  const now = new Date(2025, 4, 20); // 20 May 2025

  it('uses today when the selected month is the current month', () => {
    expect(defaultDateForMonth('2025-05', now)).toBe('2025-05-20');
  });

  it('uses the first of the month otherwise', () => {
    expect(defaultDateForMonth('2025-04', now)).toBe('2025-04-01');
    expect(defaultDateForMonth('2026-01', now)).toBe('2026-01-01');
  });
});

describe('month limits', () => {
  it('compares month keys chronologically', () => {
    expect(isMonthAfter('2026-11', '2026-10')).toBe(true);
    expect(isMonthAfter('2027-01', '2026-12')).toBe(true);
    expect(isMonthAfter('2026-10', '2026-10')).toBe(false);
    expect(isMonthAfter('2025-12', '2026-01')).toBe(false);
  });

  it('clamps future months to the maximum and leaves others alone', () => {
    expect(clampMonthKey('2026-11', '2026-10')).toBe('2026-10');
    expect(clampMonthKey('2030-01', '2026-10')).toBe('2026-10');
    expect(clampMonthKey('2026-10', '2026-10')).toBe('2026-10');
    expect(clampMonthKey('2024-03', '2026-10')).toBe('2024-03');
  });
});

describe('formatDay fallbacks', () => {
  it('negative: an invalid locale falls back to the raw key instead of throwing', () => {
    expect(formatDay('2025-03-15', 'not a locale!!')).toBe('2025-03-15');
  });
});
