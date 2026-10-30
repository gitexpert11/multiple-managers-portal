import type { DueStatus } from '../types';

/**
 * Date helpers. All dates are handled as local calendar strings:
 *   - day keys:   "YYYY-MM-DD"  (a task due "2025-03-20" is due that day in every timezone)
 *   - month keys: "YYYY-MM"
 */

const pad2 = (n: number) => String(n).padStart(2, '0');
const MS_PER_DAY = 86_400_000;

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function isValidMonthKey(key: unknown): key is string {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}$/.test(key)) return false;
  const m = Number(key.slice(5, 7));
  return m >= 1 && m <= 12;
}

export function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

export function makeMonthKey(year: number, month: number /* 1-12 */): string {
  return `${year}-${pad2(month)}`;
}

export function splitMonthKey(monthKey: string): { year: number; month: number } {
  return { year: Number(monthKey.slice(0, 4)), month: Number(monthKey.slice(5, 7)) };
}

export function shiftMonth(monthKey: string, delta: number): string {
  const { year, month } = splitMonthKey(monthKey);
  const idx = year * 12 + (month - 1) + delta;
  return makeMonthKey(Math.floor(idx / 12), ((idx % 12) + 12) % 12 + 1);
}

export function monthLabel(monthKey: string): string {
  const { year, month } = splitMonthKey(monthKey);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Sensible default end date for a new task while `monthKey` is selected:
 * the first of that month if it lies in the future, otherwise today (end
 * dates cannot be in the past, so past months also default to today).
 */
export function defaultEndDateForMonth(monthKey: string, today: string): string {
  return monthKey > monthKeyOf(today) ? `${monthKey}-01` : today;
}

export function daysInMonth(year: number, month: number /* 1-12 */): number {
  return new Date(year, month, 0).getDate();
}

export function isValidDayKey(key: unknown): key is string {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

/** Whole days from `fromKey` to `toKey` (negative when `toKey` is earlier). UTC arithmetic: immune to DST. */
export function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toKey.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY);
}

/** Day keys are zero-padded ISO strings, so plain string comparison is chronological. */
export function isDayBefore(a: string, b: string): boolean {
  return a < b;
}

export function formatDay(dayKey: string, locale = 'en-US', { year = true }: { year?: boolean } = {}): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: year ? 'numeric' : undefined }).format(new Date(y, m - 1, d));
  } catch {
    return dayKey;
  }
}

export interface DueDescription {
  status: DueStatus;
  days: number;
  label: string;
}

/** Describe how a task's end date relates to today. */
export function describeDue(endDate: string, today: string): DueDescription {
  const days = daysBetween(today, endDate);
  if (days < 0) {
    const n = -days;
    return { status: 'overdue', days, label: `Overdue by ${n} ${n === 1 ? 'day' : 'days'}` };
  }
  if (days === 0) return { status: 'today', days, label: 'Due today' };
  if (days === 1) return { status: 'upcoming', days, label: 'Due tomorrow' };
  return { status: 'upcoming', days, label: `${days} days left` };
}
