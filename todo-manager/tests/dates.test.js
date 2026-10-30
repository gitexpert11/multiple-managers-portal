import { describe, expect, it } from 'vitest';
import { MONTH_NAMES, currentMonthKey, daysBetween, defaultEndDateForMonth, describeDue, formatDay, isDayBefore, isValidDayKey, isValidMonthKey, makeMonthKey, monthKeyOf, monthLabel, shiftMonth, splitMonthKey, todayKey } from '../src/lib/dates.js';

describe('todayKey', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(todayKey(new Date(2025, 2, 5))).toBe('2025-03-05');
    expect(todayKey(new Date(2025, 11, 31))).toBe('2025-12-31');
  });
});

describe('isValidDayKey', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDayKey('2025-03-15')).toBe(true);
    expect(isValidDayKey('2024-02-29')).toBe(true); // leap year
    expect(isValidDayKey('2025-02-29')).toBe(false);
    expect(isValidDayKey('2025-13-01')).toBe(false);
    expect(isValidDayKey('2025-04-31')).toBe(false);
    expect(isValidDayKey('15-03-2025')).toBe(false);
    expect(isValidDayKey('')).toBe(false);
    expect(isValidDayKey(null)).toBe(false);
    expect(isValidDayKey(20250315)).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts whole days, signed', () => {
    expect(daysBetween('2025-03-15', '2025-03-15')).toBe(0);
    expect(daysBetween('2025-03-15', '2025-03-16')).toBe(1);
    expect(daysBetween('2025-03-15', '2025-03-10')).toBe(-5);
    expect(daysBetween('2025-03-15', '2025-04-15')).toBe(31);
  });

  it('is not affected by daylight-saving transitions', () => {
    // US DST starts 9 March 2025; a naive Date diff would give 6.96 days.
    expect(daysBetween('2025-03-08', '2025-03-15')).toBe(7);
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1);
  });
});

describe('isDayBefore', () => {
  it('compares chronologically', () => {
    expect(isDayBefore('2025-03-14', '2025-03-15')).toBe(true);
    expect(isDayBefore('2025-03-15', '2025-03-15')).toBe(false);
    expect(isDayBefore('2025-03-16', '2025-03-15')).toBe(false);
    expect(isDayBefore('2024-12-31', '2025-01-01')).toBe(true);
  });
});

describe('describeDue', () => {
  const today = '2025-03-15';

  it('flags overdue tasks with the number of days', () => {
    expect(describeDue('2025-03-14', today)).toEqual({ status: 'overdue', days: -1, label: 'Overdue by 1 day' });
    expect(describeDue('2025-03-01', today)).toEqual({ status: 'overdue', days: -14, label: 'Overdue by 14 days' });
  });

  it('recognises today and tomorrow', () => {
    expect(describeDue('2025-03-15', today)).toEqual({ status: 'today', days: 0, label: 'Due today' });
    expect(describeDue('2025-03-16', today)).toEqual({ status: 'upcoming', days: 1, label: 'Due tomorrow' });
  });

  it('counts days left for later dates', () => {
    expect(describeDue('2025-03-20', today)).toEqual({ status: 'upcoming', days: 5, label: '5 days left' });
  });
});

describe('formatDay', () => {
  it('renders a readable date and falls back to the key for bad locales', () => {
    expect(formatDay('2025-03-15', 'en-US')).toBe('Mar 15, 2025');
    expect(formatDay('2025-03-15', 'en-US', { year: false })).toBe('Mar 15');
    expect(formatDay('2025-03-15', 'not-a-locale!')).toBe('2025-03-15');
  });
});

describe('month keys', () => {
  it('derives and validates month keys', () => {
    expect(currentMonthKey(new Date(2025, 2, 15))).toBe('2025-03');
    expect(monthKeyOf('2025-03-15')).toBe('2025-03');
    expect(makeMonthKey(2025, 3)).toBe('2025-03');
    expect(splitMonthKey('2025-03')).toEqual({ year: 2025, month: 3 });
    expect(isValidMonthKey('2025-03')).toBe(true);
    expect(isValidMonthKey('2025-13')).toBe(false);
    expect(isValidMonthKey('2025-3')).toBe(false);
    expect(isValidMonthKey(null)).toBe(false);
  });

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2025-03', 1)).toBe('2025-04');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2025-01', -1)).toBe('2024-12');
    expect(shiftMonth('2025-03', -15)).toBe('2023-12');
    expect(shiftMonth('2025-03', 24)).toBe('2027-03');
  });

  it('labels months', () => {
    expect(monthLabel('2025-03')).toBe('March 2025');
    expect(MONTH_NAMES).toHaveLength(12);
  });

  it('defaults the end date to the 1st of a future month, otherwise today', () => {
    const today = '2025-03-15';
    expect(defaultEndDateForMonth('2025-03', today)).toBe(today);
    expect(defaultEndDateForMonth('2025-01', today)).toBe(today); // past month: cannot go back
    expect(defaultEndDateForMonth('2025-04', today)).toBe('2025-04-01');
    expect(defaultEndDateForMonth('2026-01', today)).toBe('2026-01-01');
  });
});
