import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/data/defaultCategories.js';
import { DEFAULT_MOCK_MONTHS, MOCK_ID_PREFIX, generateMockTransactions, isMockTransaction } from '../src/data/mockData.js';
import { isValidDayKey, shiftMonth, currentMonthKey, todayKey } from '../src/lib/dates.js';
import { normalizeTransaction } from '../src/store/store.js';

const NOW = new Date(2026, 9, 27); // 27 October 2026
const monthOf = (t) => t.date.slice(0, 7);
const groupByMonth = (list) => {
  const map = new Map();
  for (const t of list) {
    if (!map.has(monthOf(t))) map.set(monthOf(t), []);
    map.get(monthOf(t)).push(t);
  }
  return map;
};

describe('generateMockTransactions', () => {
  const data = generateMockTransactions({ now: NOW });
  const byMonth = groupByMonth(data);

  it('covers exactly the last 24 calendar months, ending with the current month', () => {
    expect(DEFAULT_MOCK_MONTHS).toBe(24);
    expect(byMonth.size).toBe(24);
    const expected = Array.from({ length: 24 }, (_, i) => shiftMonth(currentMonthKey(NOW), -(23 - i)));
    expect([...byMonth.keys()].sort()).toEqual(expected);
    expect([...byMonth.keys()].sort()[0]).toBe('2024-11');
    expect([...byMonth.keys()].sort().at(-1)).toBe('2026-10');
  });

  it('has income and expense records every month', () => {
    for (const [month, list] of byMonth) {
      const income = list.filter((t) => t.type === 'income').length;
      const expenses = list.filter((t) => t.type === 'expense').length;
      expect(income, `${month} income`).toBeGreaterThanOrEqual(1);
      expect(expenses, `${month} expenses`).toBeGreaterThanOrEqual(3);
    }
  });

  it('stays within a "few records per month" budget', () => {
    for (const [, list] of byMonth) {
      expect(list.length).toBeLessThanOrEqual(20);
    }
    expect(data.length).toBeGreaterThan(100);
    expect(data.length).toBeLessThan(500);
  });

  it('never produces a date after today', () => {
    const today = todayKey(NOW);
    for (const t of data) expect(t.date <= today, t.date).toBe(true);
    expect(data.some((t) => t.date === today || t.date < today)).toBe(true);
  });

  it('produces only valid calendar dates (including short months)', () => {
    for (const t of data) expect(isValidDayKey(t.date), t.date).toBe(true);
    // February entries exist and never overflow the month.
    const feb = data.filter((t) => monthOf(t) === '2025-02' || monthOf(t) === '2026-02');
    expect(feb.length).toBeGreaterThan(0);
    for (const t of feb) expect(Number(t.date.slice(8)) <= 28).toBe(true);
  });

  it('uses unique, prefixed ids', () => {
    const ids = data.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith(MOCK_ID_PREFIX)).toBe(true);
  });

  it('references only built-in categories of the matching type', () => {
    const builtIn = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
    for (const t of data) {
      const cat = builtIn.get(t.categoryId);
      expect(cat, t.categoryId).toBeTruthy();
      expect(cat.type).toBe(t.type);
    }
  });

  it('uses positive integer cent amounts with realistic magnitudes', () => {
    for (const t of data) {
      expect(Number.isInteger(t.amount)).toBe(true);
      expect(t.amount).toBeGreaterThan(0);
    }
    const salary = data.filter((t) => t.categoryId === 'cat_salary');
    expect(salary).toHaveLength(24); // one per month
    for (const s of salary) expect(s.amount).toBeGreaterThanOrEqual(400000);
    const rent = data.filter((t) => t.categoryId === 'cat_housing');
    expect(rent).toHaveLength(24);
  });

  it('every record passes the store validation', () => {
    for (const t of data) expect(() => normalizeTransaction(t, DEFAULT_CATEGORIES)).not.toThrow();
  });

  it('includes descriptions and stable timestamps', () => {
    for (const t of data) {
      expect(t.description).toBeTruthy();
      expect(Number.isFinite(t.createdAt)).toBe(true);
      expect(t.updatedAt).toBe(t.createdAt);
    }
  });

  it('is deterministic for the same inputs', () => {
    expect(generateMockTransactions({ now: NOW })).toEqual(data);
    expect(generateMockTransactions({ now: new Date(2026, 9, 27, 23, 59) })).toEqual(data);
  });

  it('changes with the seed but keeps the same shape', () => {
    const other = generateMockTransactions({ now: NOW, seed: 7 });
    expect(other).not.toEqual(data);
    expect(groupByMonth(other).size).toBe(24);
  });

  it('follows "now": a different date yields a different window', () => {
    const earlier = generateMockTransactions({ now: new Date(2025, 0, 15) });
    const months = [...groupByMonth(earlier).keys()].sort();
    expect(months[0]).toBe('2023-02');
    expect(months.at(-1)).toBe('2025-01');
    for (const t of earlier) expect(t.date <= '2025-01-15').toBe(true);
  });

  it('honours a custom month count', () => {
    expect(groupByMonth(generateMockTransactions({ now: NOW, months: 3 })).size).toBe(3);
    const one = generateMockTransactions({ now: NOW, months: 1 });
    expect([...groupByMonth(one).keys()]).toEqual(['2026-10']);
  });

  it('still yields data on the first day of a month (everything later is dropped)', () => {
    const firstOfMonth = generateMockTransactions({ now: new Date(2026, 9, 1), months: 1 });
    expect(firstOfMonth.length).toBeGreaterThan(0);
    for (const t of firstOfMonth) expect(t.date).toBe('2026-10-01');
  });

  it('rejects a non-positive month count', () => {
    expect(() => generateMockTransactions({ now: NOW, months: 0 })).toThrow(/months/);
    expect(() => generateMockTransactions({ now: NOW, months: -2 })).toThrow(/months/);
    expect(() => generateMockTransactions({ now: NOW, months: 1.5 })).toThrow(/months/);
  });
});

describe('isMockTransaction', () => {
  it('recognises sample records by id prefix only', () => {
    expect(isMockTransaction({ id: 'mock_0001' })).toBe(true);
    expect(isMockTransaction({ id: 'tx_abc' })).toBe(false);
    expect(isMockTransaction({ id: 'xmock_1' })).toBe(false);
    expect(isMockTransaction({ id: 42 })).toBe(false);
    expect(isMockTransaction({})).toBe(false);
    expect(isMockTransaction(null)).toBe(false);
    expect(isMockTransaction(undefined)).toBe(false);
  });
});
