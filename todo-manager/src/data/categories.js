/**
 * Fixed task categories. Ids are stable strings persisted with each task;
 * labels and colours can change freely.
 */
export const TASK_CATEGORIES = [
  { id: 'office', label: 'Office', color: '#4f46e5', icon: 'briefcase' },
  { id: 'personal', label: 'Personal', color: '#ec4899', icon: 'user' },
  { id: 'travel', label: 'Travel', color: '#0ea5e9', icon: 'plane' },
  { id: 'home', label: 'Home', color: '#f97316', icon: 'home' },
];

export const CATEGORY_IDS = TASK_CATEGORIES.map((c) => c.id);

export const DEFAULT_CATEGORY = TASK_CATEGORIES[0].id;

const BY_ID = new Map(TASK_CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id) {
  return BY_ID.get(id) || null;
}

export function isCategoryId(id) {
  return BY_ID.has(id);
}
