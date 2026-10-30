import type { Period, ResolvedRange } from '../types';
import { daysBetween, firstDayOfMonth, formatDayRange, isValidDayKey, lastDayOfMonth, minDay, monthKeyOf, shiftDay, shiftMonth } from './dates';

/**
 * Reporting periods for the dashboard.
 *
 * A *period* is what the user picked (`{ preset, from?, to? }`); a *range* is
 * what that resolves to for a given "today" (`{ from, to, days, label }`).
 * Rolling presets include today ("Last 7 days" = today and the 6 days before),
 * because campaigns report intraday. Ranges never extend past today.
 */

export interface PeriodPreset {
  id: string;
  label: string;
  days?: number;
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '14d', label: 'Last 14 days', days: 14 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'custom', label: 'Custom range' },
];

export const DEFAULT_PRESET = '30d';
/** Longest custom range we will chart (one point per day): two years. */
export const MAX_RANGE_DAYS = 731;

const BY_ID = new Map(PERIOD_PRESETS.map((p) => [p.id, p]));

export function isPresetId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

export function presetLabel(id: string): string {
  return BY_ID.get(id)?.label || '';
}

/** Resolve a period to concrete dates. */
export function resolvePeriod(period: Period | null | undefined, today: string): ResolvedRange {
  const preset = isPresetId(period?.preset) ? period.preset : DEFAULT_PRESET;
  let from: string;
  let to: string;
  const def = BY_ID.get(preset) as PeriodPreset;

  if (def.days) {
    to = today;
    from = shiftDay(today, -(def.days - 1));
  } else if (preset === 'thisMonth') {
    from = firstDayOfMonth(monthKeyOf(today));
    to = today;
  } else if (preset === 'lastMonth') {
    const month = shiftMonth(monthKeyOf(today), -1);
    from = firstDayOfMonth(month);
    to = lastDayOfMonth(month);
  } else {
    // custom: validate, clamp to today, fix reversed input, cap the length.
    // `from` wins over `to` when the range is too long, so typing a start
    // date and then an end date behaves as expected.
    to = isValidDayKey(period?.to) ? minDay(period.to, today) : today;
    from = isValidDayKey(period?.from) ? minDay(period.from, to) : shiftDay(to, -29);
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) to = shiftDay(from, MAX_RANGE_DAYS - 1);
  }

  const days = daysBetween(from, to) + 1;
  return { preset, from, to, days, label: formatDayRange(from, to) };
}

/** The same-length window immediately before `range` (for "vs previous period"). */
export function previousPeriod(range: { from: string; days: number }): { from: string; to: string; days: number; label: string } {
  const to = shiftDay(range.from, -1);
  const from = shiftDay(to, -(range.days - 1));
  return { from, to, days: range.days, label: formatDayRange(from, to) };
}

/**
 * Slide a range by its own length. Moving forward never passes today; the
 * result is always a custom period (the presets are anchored to today).
 */
export function shiftRange(range: { from: string; to: string; days: number }, direction: number, today: string): Period {
  const delta = direction < 0 ? -range.days : range.days;
  let from = shiftDay(range.from, delta);
  let to = shiftDay(range.to, delta);
  if (to > today) {
    to = today;
    from = shiftDay(to, -(range.days - 1));
  }
  return { preset: 'custom', from, to };
}

export function canShiftForward(range: { to: string }, today: string): boolean {
  return range.to < today;
}
