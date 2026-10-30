import { describe, expect, it } from 'vitest';
import { daysBetween, daysInMonth, eachDay, firstDayOfMonth, formatDay, formatDayRange, isValidDayKey, lastDayOfMonth, maxDay, minDay, monthKeyOf, shiftDay, shiftMonth, todayKey } from '../src/lib/dates.js';

describe('day keys', () => {
  it('todayKey uses the local calendar date', () => {
    expect(todayKey(new Date(2025, 2, 5, 23, 59))).toBe('2025-03-05');
    expect(todayKey(new Date(2024, 11, 31, 0, 0))).toBe('2024-12-31');
  });

  it('validates day keys', () => {
    expect(isValidDayKey('2025-03-15')).toBe(true);
    expect(isValidDayKey('2024-02-29')).toBe(true);
    expect(isValidDayKey('2025-02-29')).toBe(false);
    expect(isValidDayKey('2025-13-01')).toBe(false);
    expect(isValidDayKey('2025-3-1')).toBe(false);
    expect(isValidDayKey('')).toBe(false);
    expect(isValidDayKey(null)).toBe(false);
    expect(isValidDayKey(20250315)).toBe(false);
  });

  it('shifts days across month, year and DST boundaries', () => {
    expect(shiftDay('2025-03-15', 1)).toBe('2025-03-16');
    expect(shiftDay('2025-03-01', -1)).toBe('2025-02-28');
    expect(shiftDay('2024-12-31', 1)).toBe('2025-01-01');
    expect(shiftDay('2025-03-15', -29)).toBe('2025-02-14');
    expect(shiftDay('2025-03-30', 1)).toBe('2025-03-31'); // European DST weekend
    expect(shiftDay('2025-03-15', 0)).toBe('2025-03-15');
  });

  it('counts whole days between keys', () => {
    expect(daysBetween('2025-03-01', '2025-03-15')).toBe(14);
    expect(daysBetween('2025-03-15', '2025-03-01')).toBe(-14);
    expect(daysBetween('2025-03-15', '2025-03-15')).toBe(0);
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1);
  });

  it('enumerates every day in a range, inclusive', () => {
    expect(eachDay('2025-02-27', '2025-03-02')).toEqual(['2025-02-27', '2025-02-28', '2025-03-01', '2025-03-02']);
    expect(eachDay('2025-03-15', '2025-03-15')).toEqual(['2025-03-15']);
    expect(eachDay('2025-03-16', '2025-03-15')).toEqual([]);
  });

  it('min/max compare chronologically', () => {
    expect(minDay('2025-03-15', '2025-02-28')).toBe('2025-02-28');
    expect(maxDay('2025-03-15', '2025-02-28')).toBe('2025-03-15');
  });
});

describe('month helpers', () => {
  it('derives month keys and month edges', () => {
    expect(monthKeyOf('2025-03-15')).toBe('2025-03');
    expect(firstDayOfMonth('2025-03')).toBe('2025-03-01');
    expect(lastDayOfMonth('2025-02')).toBe('2025-02-28');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
    expect(daysInMonth(2025, 4)).toBe(30);
  });

  it('shifts months across years', () => {
    expect(shiftMonth('2025-03', -1)).toBe('2025-02');
    expect(shiftMonth('2025-01', -1)).toBe('2024-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2025-03', -15)).toBe('2023-12');
  });
});

describe('formatting', () => {
  it('formats single days', () => {
    expect(formatDay('2025-03-15')).toBe('Mar 15, 2025');
    expect(formatDay('2025-03-15', 'en-US', { year: false })).toBe('Mar 15');
  });

  it('formats ranges, dropping the first year when both are the same', () => {
    expect(formatDayRange('2025-03-01', '2025-03-15')).toBe('Mar 1 – Mar 15, 2025');
    expect(formatDayRange('2024-12-20', '2025-01-05')).toBe('Dec 20, 2024 – Jan 5, 2025');
    expect(formatDayRange('2025-03-15', '2025-03-15')).toBe('Mar 15, 2025');
  });

  it('negative: falls back to the raw key for an unusable locale', () => {
    expect(formatDay('2025-03-15', 'not-a-locale-!!')).toBe('2025-03-15');
  });
});
