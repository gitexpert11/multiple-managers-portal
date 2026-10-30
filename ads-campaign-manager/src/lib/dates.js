/**
 * Date helpers. Everything is a local calendar string:
 *   - day keys:   "YYYY-MM-DD"  (a report row for "2025-03-20" is that day in every timezone)
 *   - month keys: "YYYY-MM"
 * Day keys are zero-padded ISO strings, so plain string comparison is chronological.
 */

const pad2 = (n) => String(n).padStart(2, '0');
const MS_PER_DAY = 86_400_000;

export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function daysInMonth(year, month /* 1-12 */) {
  return new Date(year, month, 0).getDate();
}

export function isValidDayKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

export function monthKeyOf(dayKey) {
  return dayKey.slice(0, 7);
}

export function firstDayOfMonth(monthKey) {
  return `${monthKey}-01`;
}

export function lastDayOfMonth(monthKey) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return `${monthKey}-${pad2(daysInMonth(year, month))}`;
}

export function shiftMonth(monthKey, delta) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const idx = year * 12 + (month - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2((((idx % 12) + 12) % 12) + 1)}`;
}

/** Add `delta` whole days to a day key (UTC arithmetic: immune to DST). */
export function shiftDay(dayKey, delta) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Whole days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function daysBetween(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY);
}

/** Every day key from `fromKey` to `toKey` inclusive (empty when reversed). */
export function eachDay(fromKey, toKey) {
  const n = daysBetween(fromKey, toKey);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => shiftDay(fromKey, i));
}

export function minDay(a, b) {
  return a < b ? a : b;
}

export function maxDay(a, b) {
  return a > b ? a : b;
}

export function formatDay(dayKey, locale = 'en-US', { year = true } = {}) {
  const [y, m, d] = dayKey.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: year ? 'numeric' : undefined }).format(new Date(y, m - 1, d));
  } catch {
    return dayKey;
  }
}

/** "Mar 1 – Mar 15, 2025" / "Dec 20, 2024 – Jan 5, 2025" / "Mar 15, 2025" for a single day. */
export function formatDayRange(fromKey, toKey, locale = 'en-US') {
  if (fromKey === toKey) return formatDay(fromKey, locale);
  const sameYear = fromKey.slice(0, 4) === toKey.slice(0, 4);
  return `${formatDay(fromKey, locale, { year: !sameYear })} – ${formatDay(toKey, locale)}`;
}
