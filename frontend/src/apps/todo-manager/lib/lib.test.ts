import { describe, expect, it } from 'vitest';
import { generateMockTasks, isMockTask } from '../data/mockData';
import type { Task } from '../types';
import { defaultEndDateForMonth, describeDue, daysBetween, isValidDayKey, monthLabel, shiftMonth } from './dates';
import { buildPdfDocument, buildWorkbook, createExportFile, selectForExport, taskStatus, validateExportRange } from './export/exportData';
import { filterTasks, overdueOutsideMonth, sortTasks, summarizeTasks, tasksByCategory, tasksInMonth } from './stats';

const NOW = new Date(2025, 2, 15, 10);
const TODAY = '2025-03-15';
const task = (over: Partial<Task>): Task => ({ id: 'x', name: 'Task', description: '', endDate: TODAY, category: 'office', completed: false, completedAt: null, createdAt: 1, updatedAt: 1, ...over });

describe('dates', () => {
  it('describes due dates relative to today', () => {
    expect(describeDue('2025-03-13', TODAY)).toEqual({ status: 'overdue', days: -2, label: 'Overdue by 2 days' });
    expect(describeDue('2025-03-14', TODAY).label).toBe('Overdue by 1 day');
    expect(describeDue(TODAY, TODAY)).toEqual({ status: 'today', days: 0, label: 'Due today' });
    expect(describeDue('2025-03-16', TODAY).label).toBe('Due tomorrow');
    expect(describeDue('2025-03-20', TODAY).label).toBe('5 days left');
    expect(daysBetween('2025-03-30', '2025-04-02')).toBe(3); // across DST boundaries too
  });

  it('has month helpers', () => {
    expect(defaultEndDateForMonth('2025-05', TODAY)).toBe('2025-05-01');
    expect(defaultEndDateForMonth('2025-01', TODAY)).toBe(TODAY);
    expect(shiftMonth('2025-01', -1)).toBe('2024-12');
    expect(monthLabel('2025-03')).toBe('March 2025');
    expect(isValidDayKey('2025-02-29')).toBe(false);
  });
});

describe('stats', () => {
  const tasks = [
    task({ id: 'a', endDate: '2025-03-10', createdAt: 1 }), // overdue
    task({ id: 'b', endDate: TODAY, createdAt: 2 }), // today
    task({ id: 'c', endDate: '2025-03-20', category: 'travel', createdAt: 3 }),
    task({ id: 'd', endDate: '2025-03-05', completed: true, completedAt: 50, createdAt: 4 }),
    task({ id: 'e', endDate: '2025-03-06', completed: true, completedAt: 90, category: 'home', createdAt: 5 }),
    task({ id: 'f', endDate: '2025-02-01', createdAt: 6 }), // overdue, other month
  ];

  it('summarises and scopes the month', () => {
    const inMonth = tasksInMonth(tasks, '2025-03');
    expect(inMonth).toHaveLength(5);
    expect(summarizeTasks(inMonth, TODAY)).toEqual({ total: 5, open: 3, completed: 2, dueToday: 1, overdue: 1 });
    expect(overdueOutsideMonth(tasks, '2025-03', TODAY).map((t) => t.id)).toEqual(['f']);
  });

  it('sorts open tasks by due date then completed by most recent', () => {
    expect(sortTasks(tasksInMonth(tasks, '2025-03')).map((t) => t.id)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('filters by status and category', () => {
    expect(filterTasks(tasks, { status: 'open' }).map((t) => t.id)).toEqual(['a', 'b', 'c', 'f']);
    expect(filterTasks(tasks, { status: 'completed' })).toHaveLength(2);
    expect(filterTasks(tasks, { category: 'travel' }).map((t) => t.id)).toEqual(['c']);
  });

  it('buckets by category with shares and status breakdowns, largest first', () => {
    const slices = tasksByCategory(tasksInMonth(tasks, '2025-03'), TODAY);
    expect(slices.map((s) => [s.categoryId, s.count])).toEqual([
      ['office', 3],
      ['travel', 1],
      ['home', 1],
    ]);
    expect(slices[0]).toMatchObject({ open: 2, completed: 1, overdue: 1, dueToday: 1, share: 0.6 });
  });
});

describe('mock data', () => {
  it('is deterministic and covers three months with every state', () => {
    const a = generateMockTasks({ now: NOW });
    expect(a).toEqual(generateMockTasks({ now: NOW }));
    expect(a.every(isMockTask)).toBe(true);
    const months = new Set(a.map((t) => t.endDate.slice(0, 7)));
    expect([...months].sort()).toEqual(['2025-02', '2025-03', '2025-04']);
    expect(a.some((t) => t.endDate === TODAY && !t.completed)).toBe(true);
    expect(a.some((t) => t.completed)).toBe(true);
    expect(a.some((t) => !t.completed && t.endDate < TODAY)).toBe(true);
    expect(() => generateMockTasks({ months: 0 })).toThrow();
  });
});

describe('export', () => {
  const tasks = [task({ id: 'a', name: 'Late', endDate: '2025-03-10' }), task({ id: 'b', name: 'Done', endDate: '2025-03-12', completed: true, completedAt: Date.UTC(2025, 2, 11) }), task({ id: 'c', name: 'Soon', endDate: '2025-04-02', category: 'travel' })];

  it('selects, labels status as of today and summarises per month', () => {
    expect(validateExportRange({ startMonth: '2025-04', endMonth: '2025-03' })).toMatch(/after/);
    const sel = selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-04', today: TODAY });
    expect(sel.tasks.map((t) => [t.id, t.status])).toEqual([
      ['a', 'overdue'],
      ['b', 'completed'],
      ['c', 'upcoming'],
    ]);
    expect(sel.months).toEqual([
      { month: '2025-03', count: 2, open: 1, completed: 1, overdue: 1 },
      { month: '2025-04', count: 1, open: 1, completed: 0, overdue: 0 },
    ]);
    expect(selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-04', scope: 'open', today: TODAY }).tasks).toHaveLength(2);
    expect(taskStatus(tasks[1] as Task, TODAY)).toBe('completed');
    expect(() => selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-04', scope: 'nope' as never })).toThrow();
  });

  it('builds workbook / pdf specs that adapt to the scope', () => {
    const all = selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-04', today: TODAY });
    const wb = buildWorkbook(all);
    expect(wb.sheets[0]?.columns.map((c) => c.header)).toEqual(['Month', 'Tasks', 'Open', 'Overdue', 'Completed', 'Completion %']);
    expect(wb.sheets[1]?.name).toBe('All tasks');
    expect(wb.sheets[1]?.rows[1]?.[5]).toEqual({ type: 'date', value: '2025-03-11' });
    const open = buildWorkbook(selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-04', scope: 'open', today: TODAY }));
    expect(open.sheets[1]?.columns.map((c) => c.header)).not.toContain('Completed on');
    const pdf = buildPdfDocument(all, { generatedAt: NOW });
    expect(pdf.subtitle).toBe('March 2025 – April 2025 · All tasks');
    expect(pdf.metaLines?.[0]).toContain('status as of 2025-03-15');
    const file = createExportFile(all, 'pdf', { generatedAt: NOW });
    expect(file.filename).toBe('todo-manager_2025-03_to_2025-04_all.pdf');
    expect(createExportFile(all, 'xlsx').bytes.length).toBeGreaterThan(500);
  });
});
