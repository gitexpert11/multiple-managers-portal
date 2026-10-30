import { TASK_CATEGORIES, getCategory } from '../data/categories.js';
import { describeDue, monthKeyOf } from './dates.js';

/** Tasks whose end date falls in the given "YYYY-MM" month. */
export function tasksInMonth(tasks, monthKey) {
  return tasks.filter((t) => monthKeyOf(t.endDate) === monthKey);
}

/** Open tasks that are already overdue and NOT due in the given month (so the
 *  dashboard can point at them while another month is selected). */
export function overdueOutsideMonth(tasks, monthKey, today) {
  return tasks.filter((t) => !t.completed && t.endDate < today && monthKeyOf(t.endDate) !== monthKey);
}

/**
 * Counts for the dashboard cards.
 * @param {object[]} tasks
 * @param {string} today "YYYY-MM-DD"
 */
export function summarizeTasks(tasks, today) {
  const out = { total: tasks.length, open: 0, completed: 0, dueToday: 0, overdue: 0 };
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
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.completed) return (b.completedAt ?? 0) - (a.completedAt ?? 0) || a.createdAt - b.createdAt;
    return a.endDate.localeCompare(b.endDate) || a.createdAt - b.createdAt;
  });
}

/**
 * Apply the dashboard filters.
 * @param {object[]} tasks
 * @param {{status?: 'all'|'open'|'completed', category?: string|null}} filter
 */
export function filterTasks(tasks, { status = 'all', category = null } = {}) {
  return tasks.filter((t) => {
    if (status === 'open' && t.completed) return false;
    if (status === 'completed' && !t.completed) return false;
    if (category && t.category !== category) return false;
    return true;
  });
}

/**
 * Slices for the "tasks by category" doughnut: one per category that has at
 * least one task, largest first (ties keep the fixed category order), each
 * with a status breakdown as of `today` for the hover tooltip.
 * @returns {{categoryId: string, label: string, color: string, icon: string,
 *            count: number, open: number, completed: number, overdue: number, dueToday: number, share: number}[]}
 */
export function tasksByCategory(tasks, today) {
  const buckets = new Map();
  for (const t of tasks) {
    const cat = getCategory(t.category);
    const id = cat ? cat.id : 'uncategorised';
    if (!buckets.has(id)) {
      buckets.set(id, {
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
      });
    }
    const b = buckets.get(id);
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
  const order = new Map(TASK_CATEGORIES.map((c, i) => [c.id, i]));
  const rank = (id) => order.get(id) ?? TASK_CATEGORIES.length;
  return [...buckets.values()]
    .map((b) => ({ ...b, share: total ? b.count / total : 0 }))
    .sort((a, b) => b.count - a.count || rank(a.categoryId) - rank(b.categoryId));
}
