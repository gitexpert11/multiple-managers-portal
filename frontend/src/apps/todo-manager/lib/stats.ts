import { TASK_CATEGORIES, getCategory } from '../data/categories';
import type { Task, TaskFilter } from '../types';
import { describeDue, monthKeyOf } from './dates';

/** Tasks whose end date falls in the given "YYYY-MM" month. */
export function tasksInMonth(tasks: Task[], monthKey: string): Task[] {
  return tasks.filter((t) => monthKeyOf(t.endDate) === monthKey);
}

/** Open tasks that are already overdue and NOT due in the given month (so the
 *  dashboard can point at them while another month is selected). */
export function overdueOutsideMonth(tasks: Task[], monthKey: string, today: string): Task[] {
  return tasks.filter((t) => !t.completed && t.endDate < today && monthKeyOf(t.endDate) !== monthKey);
}

export interface TaskSummary {
  total: number;
  open: number;
  completed: number;
  dueToday: number;
  overdue: number;
}

/** Counts for the dashboard cards. */
export function summarizeTasks(tasks: Task[], today: string): TaskSummary {
  const out: TaskSummary = { total: tasks.length, open: 0, completed: 0, dueToday: 0, overdue: 0 };
  for (const t of tasks) {
    if (t.completed) {
      out.completed++;
      continue;
    }
    out.open++;
    const { status } = describeDue(t.endDate, today);
    if (status === 'today') out.dueToday++;
    else if (status === 'overdue') out.overdue++;
  }
  return out;
}

/**
 * Dashboard order: open tasks first (soonest end date at the top), then
 * completed tasks (most recently completed first). Ties fall back to creation
 * order so the list is stable.
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.completed) return (b.completedAt ?? 0) - (a.completedAt ?? 0) || a.createdAt - b.createdAt;
    return a.endDate.localeCompare(b.endDate) || a.createdAt - b.createdAt;
  });
}

/** Apply the dashboard filters. */
export function filterTasks(tasks: Task[], { status = 'all', category = null }: Partial<TaskFilter> = {}): Task[] {
  return tasks.filter((t) => {
    if (status === 'open' && t.completed) return false;
    if (status === 'completed' && !t.completed) return false;
    if (category && t.category !== category) return false;
    return true;
  });
}

export interface CategorySlice {
  categoryId: string;
  label: string;
  color: string;
  icon: string;
  count: number;
  open: number;
  completed: number;
  overdue: number;
  dueToday: number;
  share: number;
}

/**
 * Slices for the "tasks by category" doughnut: one per category that has at
 * least one task, largest first (ties keep the fixed category order), each
 * with a status breakdown as of `today` for the hover tooltip.
 */
export function tasksByCategory(tasks: Task[], today: string): CategorySlice[] {
  const buckets = new Map<string, CategorySlice>();
  for (const t of tasks) {
    const cat = getCategory(t.category);
    const id = cat ? cat.id : 'uncategorised';
    let b = buckets.get(id);
    if (!b) {
      b = {
        categoryId: id,
        label: cat ? cat.label : 'Uncategorised',
        color: cat ? cat.color : '#9ca3af',
        icon: cat ? cat.icon : 'circle',
        count: 0,
        open: 0,
        completed: 0,
        overdue: 0,
        dueToday: 0,
        share: 0,
      };
      buckets.set(id, b);
    }
    b.count += 1;
    if (t.completed) b.completed += 1;
    else {
      b.open += 1;
      const { status } = describeDue(t.endDate, today);
      if (status === 'overdue') b.overdue += 1;
      else if (status === 'today') b.dueToday += 1;
    }
  }
  const total = tasks.length;
  const order = new Map(TASK_CATEGORIES.map((c, i) => [c.id as string, i]));
  const rank = (id: string) => order.get(id) ?? TASK_CATEGORIES.length;
  return [...buckets.values()]
    .map((b) => ({ ...b, share: total ? b.count / total : 0 }))
    .sort((a, b) => b.count - a.count || rank(a.categoryId) - rank(b.categoryId));
}
