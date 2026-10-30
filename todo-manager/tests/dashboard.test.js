/**
 * Dashboard component in isolation: rendering details that the app-level
 * tests cannot reach (records the store would never produce, escaping,
 * wording) plus the callback wiring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDashboard } from '../src/ui/dashboard.js';

const TODAY = '2025-03-15';
const task = (over) => ({ id: 'x', name: 'Task', description: '', endDate: '2025-03-20', category: 'office', completed: false, completedAt: null, createdAt: 1, updatedAt: 1, ...over });
const summary = (over = {}) => ({ total: 0, open: 0, completed: 0, dueToday: 0, overdue: 0, ...over });

let host;
let cb;
let dash;
const q = (sel) => {
  const el = host.querySelector(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el;
};
const render = (over = {}) =>
  dash.update({ tasks: [], summary: summary(), filter: { status: 'all', category: null }, month: '2025-03', today: TODAY, hasAnyTasks: false, ...over });

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  cb = { onToggle: vi.fn(), onDelete: vi.fn(), onFilter: vi.fn(), onCreate: vi.fn(), onGoToMonth: vi.fn() };
  dash = createDashboard(host, cb);
});

afterEach(() => host.remove());

describe('task rows', () => {
  it('positive: renders name, description, category, date and a status badge, and wires toggle/delete', () => {
    const t = task({ id: 't1', name: 'Fix tap', description: 'Buy washer', category: 'home' });
    render({ tasks: [t], summary: summary({ total: 1, open: 1 }), hasAnyTasks: true });
    const li = q('.todo-item');
    expect(li.dataset.id).toBe('t1');
    expect(li.dataset.status).toBe('upcoming');
    expect(li.querySelector('.todo-item__name').textContent).toBe('Fix tap');
    expect(li.querySelector('.todo-item__desc').textContent).toBe('Buy washer');
    expect(li.querySelector('.todo-category-pill').textContent).toBe('Home');
    expect(li.querySelector('time').getAttribute('datetime')).toBe('2025-03-20');
    expect(li.querySelector('.todo-badge').textContent).toBe('5 days left');
    li.querySelector('.todo-item__checkbox').click();
    expect(cb.onToggle).toHaveBeenCalledWith('t1');
    li.querySelector('[aria-label=\'Delete "Fix tap"\']').click();
    expect(cb.onDelete).toHaveBeenCalledWith('t1');
  });

  it('negative: a task with an unknown category is shown as "Uncategorised" in grey rather than crashing', () => {
    render({ tasks: [task({ category: 'garden' })], summary: summary({ total: 1, open: 1 }), hasAnyTasks: true });
    const pill = q('.todo-category-pill');
    expect(pill.textContent).toBe('Uncategorised');
    expect(pill.style.getPropertyValue('--cat-color')).toBe('#9ca3af');
  });

  it('negative: names and descriptions are inserted as text — HTML is never interpreted', () => {
    render({ tasks: [task({ name: '<img src=x onerror=alert(1)>', description: '<b>bold</b>' })], summary: summary({ total: 1, open: 1 }), hasAnyTasks: true });
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('b')).toBeNull();
    expect(q('.todo-item__name').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(q('.todo-item__desc').textContent).toBe('<b>bold</b>');
  });

  it('edge: multi-line descriptions keep their line breaks; an empty description renders no paragraph', () => {
    render({ tasks: [task({ id: 'a', description: 'line 1\nline 2' }), task({ id: 'b', description: '' })], summary: summary({ total: 2, open: 2 }), hasAnyTasks: true });
    const [a, b] = host.querySelectorAll('.todo-item');
    expect(a.querySelector('.todo-item__desc').textContent).toBe('line 1\nline 2');
    expect(b.querySelector('.todo-item__desc')).toBeNull();
  });

  it('edge: completed tasks get the completed badge and checkbox label even when their date is long past', () => {
    render({ tasks: [task({ endDate: '2020-01-01', completed: true, completedAt: 5 })], summary: summary({ total: 1, completed: 1 }), hasAnyTasks: true });
    const li = q('.todo-item');
    expect(li.dataset.status).toBe('completed');
    expect(li.classList.contains('is-completed')).toBe(true);
    expect(li.querySelector('.todo-badge').textContent).toBe('Completed');
    expect(li.querySelector('.todo-item__checkbox').checked).toBe(true);
    expect(li.querySelector('.todo-item__checkbox').getAttribute('aria-label')).toBe('Mark "Task" as open');
  });
});

describe('summary cards and wording', () => {
  it('positive: singular/plural and percentages', () => {
    render({ summary: summary({ total: 1, open: 1 }) });
    expect(q('.todo-summary-card--open .todo-summary-card__meta').textContent).toBe('of 1 task in March 2025');
    expect(q('.todo-summary-card--completed .todo-summary-card__meta').textContent).toBe('0% done');
    render({ summary: summary({ total: 3, open: 1, completed: 2, overdue: 1 }) });
    expect(q('.todo-summary-card--open .todo-summary-card__meta').textContent).toBe('of 3 tasks in March 2025');
    expect(q('.todo-summary-card--completed .todo-summary-card__meta').textContent).toBe('67% done');
    expect(q('.todo-summary-card--overdue .todo-summary-card__meta').textContent).toBe('Needs attention');
    expect(q('.todo-summary-card--overdue').classList.contains('is-alert')).toBe(true);
  });

  it('edge: zero tasks in the month shows neutral copy', () => {
    render();
    expect(q('.todo-summary-card--completed .todo-summary-card__meta').textContent).toBe('Nothing yet');
    expect(q('.todo-summary-card--overdue .todo-summary-card__meta').textContent).toBe('Nothing overdue');
    expect(q('.todo-summary-card--overdue').classList.contains('is-alert')).toBe(false);
    expect(q('.todo-summary-card--due-today .todo-summary-card__meta').textContent).toBe('Mar 15, 2025');
  });
});

describe('filters and empty states', () => {
  it('positive: status radios and category chips report filter changes and reflect the current filter', () => {
    render({ filter: { status: 'open', category: 'travel' } });
    expect(q('#todo-status-open').checked).toBe(true);
    expect(q('.todo-chip[data-category="travel"]').getAttribute('aria-pressed')).toBe('true');
    q('#todo-status-completed').click();
    expect(cb.onFilter).toHaveBeenLastCalledWith({ status: 'completed' });
    q('.todo-chip[data-category="home"]').click();
    expect(cb.onFilter).toHaveBeenLastCalledWith({ category: 'home' });
    q('.todo-chip[data-category=""]').click();
    expect(cb.onFilter).toHaveBeenLastCalledWith({ category: null });
  });

  it('edge: empty state distinguishes "no tasks this month" from "nothing matches the filters"', () => {
    render();
    expect(q('.todo-empty__title').textContent).toBe('No tasks due in March 2025.');
    q('.todo-empty .todo-btn').click();
    expect(cb.onCreate).toHaveBeenCalledTimes(1);

    render({ hasAnyTasks: true, filter: { status: 'completed', category: null } });
    expect(q('.todo-empty__title').textContent).toBe('No tasks match these filters.');
    q('.todo-empty .todo-btn').click();
    expect(cb.onFilter).toHaveBeenLastCalledWith({ status: 'all', category: null });
    expect(q('.todo-panel__hint').textContent).toBe('March 2025 · 0 tasks matching your filters');
  });

  it('positive: the "New task" button asks the parent to navigate', () => {
    render();
    q('[data-testid=todo-new-task]').click();
    expect(cb.onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('overdue-elsewhere notice', () => {
  it('positive: names the count and jumps to the most recent month among them', () => {
    render({ overdueElsewhere: [task({ endDate: '2025-01-10' }), task({ endDate: '2025-02-20' }), task({ endDate: '2024-12-31' })] });
    const notice = q('[data-testid=todo-overdue-elsewhere]');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('3 overdue tasks in other months');
    notice.querySelector('.todo-notice__action').click();
    expect(cb.onGoToMonth).toHaveBeenCalledWith('2025-02');
  });

  it('edge: singular wording and hidden when there is nothing to point at', () => {
    render({ overdueElsewhere: [task({ endDate: '2025-02-01' })] });
    expect(q('[data-testid=todo-overdue-elsewhere]').textContent).toContain('1 overdue task in other months');
    render({ overdueElsewhere: [] });
    expect(q('[data-testid=todo-overdue-elsewhere]').hidden).toBe(true);
    render({});
    expect(q('[data-testid=todo-overdue-elsewhere]').hidden).toBe(true);
  });
});
