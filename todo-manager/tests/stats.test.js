import { describe, expect, it } from 'vitest';
import { filterTasks, sortTasks, summarizeTasks, tasksByCategory } from '../src/lib/stats.js';

const TODAY = '2025-03-15';
const task = (over) => ({ id: 'x', name: 'x', description: '', category: 'office', endDate: TODAY, completed: false, completedAt: null, createdAt: 0, updatedAt: 0, ...over });

describe('summarizeTasks', () => {
  it('returns zeros for an empty list', () => {
    expect(summarizeTasks([], TODAY)).toEqual({ total: 0, open: 0, completed: 0, dueToday: 0, overdue: 0 });
  });

  it('counts open, completed, due-today and overdue tasks', () => {
    const tasks = [
      task({ id: 'a', endDate: '2025-03-15' }), // today
      task({ id: 'b', endDate: '2025-03-10' }), // overdue
      task({ id: 'c', endDate: '2025-03-20' }), // upcoming
      task({ id: 'd', endDate: '2025-03-10', completed: true, completedAt: 1 }), // completed, not overdue
    ];
    expect(summarizeTasks(tasks, TODAY)).toEqual({ total: 4, open: 3, completed: 1, dueToday: 1, overdue: 1 });
  });
});

describe('sortTasks', () => {
  it('puts open tasks first by end date, then completed tasks by completion time', () => {
    const tasks = [
      task({ id: 'done-old', completed: true, completedAt: 100, createdAt: 1 }),
      task({ id: 'later', endDate: '2025-03-20', createdAt: 2 }),
      task({ id: 'done-new', completed: true, completedAt: 200, createdAt: 3 }),
      task({ id: 'soon', endDate: '2025-03-16', createdAt: 4 }),
      task({ id: 'overdue', endDate: '2025-03-01', createdAt: 5 }),
    ];
    expect(sortTasks(tasks).map((t) => t.id)).toEqual(['overdue', 'soon', 'later', 'done-new', 'done-old']);
  });

  it('breaks ties by creation order and does not mutate the input', () => {
    const tasks = [task({ id: 'second', createdAt: 2 }), task({ id: 'first', createdAt: 1 })];
    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.id)).toEqual(['first', 'second']);
    expect(tasks.map((t) => t.id)).toEqual(['second', 'first']);
  });
});

describe('filterTasks', () => {
  const tasks = [
    task({ id: 'a', category: 'office' }),
    task({ id: 'b', category: 'home', completed: true, completedAt: 1 }),
    task({ id: 'c', category: 'home' }),
  ];

  it('returns everything by default', () => {
    expect(filterTasks(tasks)).toHaveLength(3);
    expect(filterTasks(tasks, { status: 'all', category: null })).toHaveLength(3);
  });

  it('filters by status and category independently and together', () => {
    expect(filterTasks(tasks, { status: 'open' }).map((t) => t.id)).toEqual(['a', 'c']);
    expect(filterTasks(tasks, { status: 'completed' }).map((t) => t.id)).toEqual(['b']);
    expect(filterTasks(tasks, { category: 'home' }).map((t) => t.id)).toEqual(['b', 'c']);
    expect(filterTasks(tasks, { status: 'open', category: 'home' }).map((t) => t.id)).toEqual(['c']);
    expect(filterTasks(tasks, { category: 'travel' })).toEqual([]);
  });
});

describe('tasksByCategory (doughnut slices)', () => {
  it('positive: one slice per category present, largest first, with shares and a status breakdown', () => {
    const tasks = [
      task({ id: 'a', category: 'office', endDate: '2025-03-10' }), // overdue
      task({ id: 'b', category: 'office', endDate: '2025-03-15' }), // due today
      task({ id: 'c', category: 'office', endDate: '2025-03-20', completed: true, completedAt: 1 }),
      task({ id: 'd', category: 'home', endDate: '2025-03-25' }),
      task({ id: 'e', category: 'travel', endDate: '2025-03-01', completed: true, completedAt: 1 }),
      task({ id: 'f', category: 'travel', endDate: '2025-03-02', completed: true, completedAt: 1 }),
    ];
    const slices = tasksByCategory(tasks, TODAY);
    expect(slices.map((s) => s.categoryId)).toEqual(['office', 'travel', 'home']);
    expect(slices[0]).toEqual({ categoryId: 'office', label: 'Office', color: '#4f46e5', icon: 'briefcase', count: 3, open: 2, completed: 1, overdue: 1, dueToday: 1, share: 0.5 });
    expect(slices[1]).toMatchObject({ label: 'Travel', count: 2, open: 0, completed: 2, overdue: 0, dueToday: 0 });
    expect(slices[2]).toMatchObject({ label: 'Home', count: 1, open: 1, completed: 0, overdue: 0, dueToday: 0 });
    expect(slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
    expect(slices.some((s) => s.categoryId === 'personal')).toBe(false); // absent categories are not drawn
  });

  it('edge: ties keep the fixed category order (Office, Personal, Travel, Home)', () => {
    const tasks = [task({ id: 'h', category: 'home' }), task({ id: 't', category: 'travel' }), task({ id: 'p', category: 'personal' }), task({ id: 'o', category: 'office' })];
    expect(tasksByCategory(tasks, TODAY).map((s) => s.categoryId)).toEqual(['office', 'personal', 'travel', 'home']);
    expect(tasksByCategory(tasks, TODAY).every((s) => s.share === 0.25)).toBe(true);
  });

  it('negative: returns no slices for an empty list and does not divide by zero', () => {
    expect(tasksByCategory([], TODAY)).toEqual([]);
  });

  it('negative: tasks with an unknown category land in a grey "Uncategorised" slice', () => {
    const slices = tasksByCategory([task({ id: 'x', category: 'garden' }), task({ id: 'y', category: undefined })], TODAY);
    expect(slices).toHaveLength(1);
    expect(slices[0]).toMatchObject({ categoryId: 'uncategorised', label: 'Uncategorised', color: '#9ca3af', icon: 'circle', count: 2, share: 1 });
  });

  it('edge: completed tasks are never counted as overdue or due today, whatever their end date', () => {
    const slices = tasksByCategory([task({ id: 'a', category: 'home', endDate: '2025-01-01', completed: true, completedAt: 1 }), task({ id: 'b', category: 'home', endDate: TODAY, completed: true, completedAt: 1 })], TODAY);
    expect(slices[0]).toMatchObject({ count: 2, open: 0, completed: 2, overdue: 0, dueToday: 0 });
  });

  it('edge: status is relative to the day passed in', () => {
    const tasks = [task({ id: 'a', category: 'office', endDate: '2025-03-20' })];
    expect(tasksByCategory(tasks, '2025-03-15')[0]).toMatchObject({ overdue: 0, dueToday: 0 });
    expect(tasksByCategory(tasks, '2025-03-20')[0]).toMatchObject({ overdue: 0, dueToday: 1 });
    expect(tasksByCategory(tasks, '2025-03-21')[0]).toMatchObject({ overdue: 1, dueToday: 0 });
  });

  it('does not mutate the input', () => {
    const tasks = [task({ id: 'a', category: 'office' })];
    const snapshot = JSON.stringify(tasks);
    tasksByCategory(tasks, TODAY);
    expect(JSON.stringify(tasks)).toBe(snapshot);
  });
});

describe('sortTasks edge cases', () => {
  it('edge: completed tasks without a completedAt sort after those with one, then by creation', () => {
    const tasks = [
      task({ id: 'no-stamp', completed: true, completedAt: null, createdAt: 1 }),
      task({ id: 'stamped', completed: true, completedAt: 50, createdAt: 2 }),
      task({ id: 'no-stamp-2', completed: true, completedAt: undefined, createdAt: 0 }),
    ];
    expect(sortTasks(tasks).map((t) => t.id)).toEqual(['stamped', 'no-stamp-2', 'no-stamp']);
  });
});
