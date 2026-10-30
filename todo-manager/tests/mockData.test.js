import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '../src/data/categories.js';
import { DEFAULT_MOCK_MONTHS, MOCK_ID_PREFIX, generateMockTasks, isMockTask } from '../src/data/mockData.js';
import { currentMonthKey, isValidDayKey, shiftMonth, todayKey } from '../src/lib/dates.js';
import { summarizeTasks } from '../src/lib/stats.js';
import { normalizeTask } from '../src/store/store.js';

const NOW = new Date(2025, 2, 15); // 15 March 2025
const TODAY = todayKey(NOW);
const monthOf = (t) => t.endDate.slice(0, 7);
const months = (list) => [...new Set(list.map(monthOf))].sort();

describe('generateMockTasks', () => {
  const data = generateMockTasks({ now: NOW });

  it('covers exactly 3 months: last month, this month and next month', () => {
    expect(DEFAULT_MOCK_MONTHS).toBe(3);
    const thisMonth = currentMonthKey(NOW);
    expect(months(data)).toEqual([shiftMonth(thisMonth, -1), thisMonth, shiftMonth(thisMonth, 1)]);
    expect(months(data)).toEqual(['2025-02', '2025-03', '2025-04']);
  });

  it('keeps the window centred for other sizes', () => {
    expect(months(generateMockTasks({ now: NOW, months: 1 }))).toEqual(['2025-03']);
    expect(months(generateMockTasks({ now: NOW, months: 5 }))).toEqual(['2025-01', '2025-02', '2025-03', '2025-04', '2025-05']);
    expect(() => generateMockTasks({ now: NOW, months: 0 })).toThrow();
  });

  it('produces a handful of tasks per month from every category', () => {
    for (const m of months(data)) {
      const list = data.filter((t) => monthOf(t) === m);
      expect(list.length, m).toBeGreaterThanOrEqual(8);
      expect(list.length, m).toBeLessThanOrEqual(12);
      for (const c of CATEGORY_IDS) expect(list.some((t) => t.category === c), `${m} ${c}`).toBe(true);
    }
    expect(data.length).toBeGreaterThanOrEqual(24);
    expect(data.length).toBeLessThanOrEqual(36);
  });

  it('represents every dashboard state: overdue, due today, upcoming and completed', () => {
    const s = summarizeTasks(data, TODAY);
    expect(s.overdue).toBeGreaterThan(0);
    expect(s.dueToday).toBeGreaterThan(0);
    expect(s.completed).toBeGreaterThan(0);
    expect(data.some((t) => !t.completed && t.endDate > TODAY)).toBe(true);
    // Nothing in the future is marked as completed before it was even created.
    for (const t of data) if (t.completed) expect(t.completedAt).toBeLessThanOrEqual(Date.UTC(2025, 2, 15));
  });

  it('is deterministic for the same now + seed, and different for another seed', () => {
    expect(generateMockTasks({ now: NOW })).toEqual(data);
    expect(generateMockTasks({ now: NOW, seed: 7 })).not.toEqual(data);
  });

  it('produces valid records that the store accepts unchanged', () => {
    for (const t of data) {
      expect(isValidDayKey(t.endDate), t.endDate).toBe(true);
      expect(normalizeTask(t)).toEqual({ name: t.name, description: t.description, endDate: t.endDate, category: t.category });
      expect(t.completed ? Number.isFinite(t.completedAt) : t.completedAt === null).toBe(true);
      expect(t.createdAt).toBeLessThanOrEqual(t.updatedAt);
    }
  });

  it('uses unique, prefixed ids so sample tasks can be recognised later', () => {
    const ids = data.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith(MOCK_ID_PREFIX)).toBe(true);
    expect(data.every(isMockTask)).toBe(true);
    expect(isMockTask({ id: 'task_abc' })).toBe(false);
    expect(isMockTask(null)).toBe(false);
  });

  it('handles short months and year boundaries', () => {
    const feb = generateMockTasks({ now: new Date(2025, 1, 10) }).filter((t) => monthOf(t) === '2025-02');
    for (const t of feb) expect(Number(t.endDate.slice(8))).toBeLessThanOrEqual(28);
    expect(months(generateMockTasks({ now: new Date(2025, 0, 5) }))).toEqual(['2024-12', '2025-01', '2025-02']);
    expect(months(generateMockTasks({ now: new Date(2025, 11, 20) }))).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('window sizes', () => {
  it('edge: even sizes lean towards the past; single month is just this month', () => {
    expect(months(generateMockTasks({ now: NOW, months: 2 }))).toEqual(['2025-02', '2025-03']);
    expect(months(generateMockTasks({ now: NOW, months: 4 }))).toEqual(['2025-01', '2025-02', '2025-03', '2025-04']);
  });

  it('negative: rejects non-integer month counts', () => {
    expect(() => generateMockTasks({ now: NOW, months: 1.5 })).toThrow(/positive integer/);
    expect(() => generateMockTasks({ now: NOW, months: '3' })).toThrow(/positive integer/);
  });
});
