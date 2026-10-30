/**
 * Date helpers. All dates are handled as local calendar strings:
 *   - day keys:   "YYYY-MM-DD"
 *   - month keys: "YYYY-MM"
 * This avoids timezone surprises that come with Date objects / ISO timestamps.
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function isValidDayKey(key: unknown): key is string {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
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

export function daysInMonth(year: number, month: number /* 1-12 */): number {
  return new Date(year, month, 0).getDate();
}

export function shiftMonth(monthKey: string, delta: number): string {
  const { year, month } = splitMonthKey(monthKey);
  const idx = year * 12 + (month - 1) + delta;
  return makeMonthKey(Math.floor(idx / 12), ((idx % 12) + 12) % 12 + 1);
}

/** Month keys are zero-padded "YYYY-MM", so plain string comparison orders them. */
export function isMonthAfter(a: string, b: string): boolean {
  return a > b;
}

/** Clamp a month key so it is never later than `maxMonthKey`. */
export function clampMonthKey(monthKey: string, maxMonthKey: string): string {
  return isMonthAfter(monthKey, maxMonthKey) ? maxMonthKey : monthKey;
}

export function monthLabel(monthKey: string): string {
  const { year, month } = splitMonthKey(monthKey);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Sensible default date for a new transaction in the selected month:
 * today if the month is the current one, otherwise the first of that month.
 */
export function defaultDateForMonth(monthKey: string, now: Date = new Date()): string {
  if (monthKey === currentMonthKey(now)) return todayKey(now);
  return `${monthKey}-01`;
}

export function formatDay(dayKey: string, locale = 'en-US'): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d));
  } catch {
    return dayKey;
  }
}
