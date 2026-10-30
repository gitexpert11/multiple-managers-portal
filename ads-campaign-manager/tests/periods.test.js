import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET, MAX_RANGE_DAYS, PERIOD_PRESETS, canShiftForward, isPresetId, presetLabel, previousPeriod, resolvePeriod, shiftRange } from '../src/lib/periods.js';

const TODAY = '2025-03-15';

describe('presets', () => {
  it('lists the expected presets with labels', () => {
    expect(PERIOD_PRESETS.map((p) => p.id)).toEqual(['7d', '14d', '30d', '90d', 'thisMonth', 'lastMonth', 'custom']);
    expect(isPresetId('30d')).toBe(true);
    expect(isPresetId('1y')).toBe(false);
    expect(presetLabel('lastMonth')).toBe('Last month');
    expect(presetLabel('nope')).toBe('');
    expect(DEFAULT_PRESET).toBe('30d');
  });
});

describe('resolvePeriod', () => {
  it('rolling presets end today and include today', () => {
    expect(resolvePeriod({ preset: '7d' }, TODAY)).toEqual({ preset: '7d', from: '2025-03-09', to: TODAY, days: 7, label: 'Mar 9 – Mar 15, 2025' });
    expect(resolvePeriod({ preset: '30d' }, TODAY)).toMatchObject({ from: '2025-02-14', to: TODAY, days: 30 });
    expect(resolvePeriod({ preset: '90d' }, TODAY)).toMatchObject({ from: '2024-12-16', to: TODAY, days: 90, label: 'Dec 16, 2024 – Mar 15, 2025' });
  });

  it('this month runs from the 1st to today; last month is the whole previous month', () => {
    expect(resolvePeriod({ preset: 'thisMonth' }, TODAY)).toMatchObject({ from: '2025-03-01', to: TODAY, days: 15 });
    expect(resolvePeriod({ preset: 'lastMonth' }, TODAY)).toMatchObject({ from: '2025-02-01', to: '2025-02-28', days: 28 });
    expect(resolvePeriod({ preset: 'thisMonth' }, '2025-03-01')).toMatchObject({ from: '2025-03-01', to: '2025-03-01', days: 1, label: 'Mar 1, 2025' });
    expect(resolvePeriod({ preset: 'lastMonth' }, '2025-01-10')).toMatchObject({ from: '2024-12-01', to: '2024-12-31', days: 31 });
  });

  it('custom ranges are used as given', () => {
    expect(resolvePeriod({ preset: 'custom', from: '2025-01-01', to: '2025-01-20' }, TODAY)).toMatchObject({ preset: 'custom', from: '2025-01-01', to: '2025-01-20', days: 20 });
  });

  it('edge: custom ranges are clamped to today and reversed input is fixed', () => {
    expect(resolvePeriod({ preset: 'custom', from: '2025-03-10', to: '2025-04-10' }, TODAY)).toMatchObject({ from: '2025-03-10', to: TODAY });
    expect(resolvePeriod({ preset: 'custom', from: '2025-03-20', to: '2025-03-10' }, TODAY)).toMatchObject({ from: '2025-03-10', to: '2025-03-10', days: 1 });
  });

  it('negative: invalid custom dates fall back to a 30-day window ending today', () => {
    expect(resolvePeriod({ preset: 'custom', from: 'nope', to: '2025-02-30' }, TODAY)).toMatchObject({ from: '2025-02-14', to: TODAY, days: 30 });
    expect(resolvePeriod({ preset: 'custom' }, TODAY)).toMatchObject({ from: '2025-02-14', to: TODAY });
  });

  it('negative: an unknown preset (or none) becomes the default', () => {
    expect(resolvePeriod({ preset: 'year' }, TODAY).preset).toBe('30d');
    expect(resolvePeriod(null, TODAY).preset).toBe('30d');
    expect(resolvePeriod({}, TODAY).preset).toBe('30d');
  });

  it('edge: very long custom ranges are capped, keeping the typed start date', () => {
    const r = resolvePeriod({ preset: 'custom', from: '2020-01-01', to: TODAY }, TODAY);
    expect(r.days).toBe(MAX_RANGE_DAYS);
    expect(r.from).toBe('2020-01-01');
    expect(r.to).toBe('2021-12-31');
  });
});

describe('previousPeriod', () => {
  it('is the same-length window immediately before', () => {
    const r = resolvePeriod({ preset: '7d' }, TODAY);
    expect(previousPeriod(r)).toEqual({ from: '2025-03-02', to: '2025-03-08', days: 7, label: 'Mar 2 – Mar 8, 2025' });
    const m = resolvePeriod({ preset: 'lastMonth' }, TODAY); // Feb (28 days)
    expect(previousPeriod(m)).toMatchObject({ from: '2025-01-04', to: '2025-01-31', days: 28 });
  });
});

describe('shiftRange', () => {
  it('slides backwards by the window length as a custom period', () => {
    const r = resolvePeriod({ preset: '7d' }, TODAY);
    expect(shiftRange(r, -1, TODAY)).toEqual({ preset: 'custom', from: '2025-03-02', to: '2025-03-08' });
  });

  it('slides forwards but never past today', () => {
    const back = resolvePeriod(shiftRange(resolvePeriod({ preset: '7d' }, TODAY), -1, TODAY), TODAY);
    expect(shiftRange(back, 1, TODAY)).toEqual({ preset: 'custom', from: '2025-03-09', to: TODAY });
    // Partial overlap with the future: clamp to today, keep the length.
    const r = resolvePeriod({ preset: 'custom', from: '2025-03-10', to: '2025-03-13' }, TODAY);
    expect(shiftRange(r, 1, TODAY)).toEqual({ preset: 'custom', from: '2025-03-12', to: TODAY });
  });

  it('canShiftForward is false when the range already ends today', () => {
    expect(canShiftForward(resolvePeriod({ preset: '7d' }, TODAY), TODAY)).toBe(false);
    expect(canShiftForward(resolvePeriod({ preset: 'lastMonth' }, TODAY), TODAY)).toBe(true);
  });
});
