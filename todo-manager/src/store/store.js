import { DEFAULT_CATEGORY, isCategoryId } from '../data/categories.js';
import { isValidDayKey } from '../lib/dates.js';
import { uid } from '../lib/ids.js';
import { createStorage } from './storage.js';

/**
 * Todo data store.
 *
 * Holds the task list and persists every mutation to storage. Listeners are
 * notified after each change so the UI can re-render.
 */

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 500;

export function createStore({ storage = createStorage() } = {}) {
  let state = hydrate(storage.load());
  const listeners = new Set();
  let lastSaveOk = true;

  function commit(next) {
    state = next;
    lastSaveOk = storage.save(serializable(state));
    for (const fn of listeners) fn(state);
  }

  const api = {
    getState: () => state,
    get saveFailed() {
      return !lastSaveOk;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    addTask(input) {
      const clean = normalizeTask(input);
      const now = Date.now();
      const record = { id: uid('task'), createdAt: now, updatedAt: now, completed: false, completedAt: null, ...clean };
      commit({ ...state, tasks: [...state.tasks, record] });
      return record;
    },

    updateTask(id, patch) {
      const existing = state.tasks.find((t) => t.id === id);
      if (!existing) throw new Error('Task not found');
      const merged = normalizeTask({ ...existing, ...patch });
      const record = { ...existing, ...merged, updatedAt: Date.now() };
      commit({ ...state, tasks: state.tasks.map((t) => (t.id === id ? record : t)) });
      return record;
    },

    /** Flip a task between open and completed. */
    toggleTask(id) {
      const existing = state.tasks.find((t) => t.id === id);
      if (!existing) throw new Error('Task not found');
      const completed = !existing.completed;
      const now = Date.now();
      const record = { ...existing, completed, completedAt: completed ? now : null, updatedAt: now };
      commit({ ...state, tasks: state.tasks.map((t) => (t.id === id ? record : t)) });
      return record;
    },

    deleteTask(id) {
      const existing = state.tasks.find((t) => t.id === id);
      if (!existing) return null;
      commit({ ...state, tasks: state.tasks.filter((t) => t.id !== id) });
      return existing;
    },

    /**
     * Insert many records at once (e.g. sample data). Records whose id already
     * exists are skipped. The batch is atomic: if any record is invalid nothing
     * is written.
     * @returns {object[]} the records that were actually added
     */
    addTasks(records) {
      if (!Array.isArray(records)) throw new Error('Expected an array of tasks');
      const existing = new Set(state.tasks.map((t) => t.id));
      const added = [];
      for (const r of records) {
        const clean = normalizeTask(r); // throws on bad input
        const id = typeof r.id === 'string' && r.id ? r.id : uid('task');
        if (existing.has(id)) continue;
        existing.add(id);
        const now = Date.now();
        const completed = Boolean(r.completed);
        added.push({
          id,
          createdAt: Number.isFinite(r.createdAt) ? r.createdAt : now,
          updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : now,
          completed,
          completedAt: completed ? (Number.isFinite(r.completedAt) ? r.completedAt : now) : null,
          ...clean,
        });
      }
      if (added.length) commit({ ...state, tasks: [...state.tasks, ...added] });
      return added;
    },

    /**
     * Remove every task matching the predicate.
     * @returns {object[]} the removed records
     */
    removeTasksWhere(predicate) {
      const removed = state.tasks.filter(predicate);
      if (removed.length) commit({ ...state, tasks: state.tasks.filter((t) => !predicate(t)) });
      return removed;
    },

    /** Re-insert a previously deleted record verbatim (undo). */
    restoreTask(record) {
      if (!record || state.tasks.some((t) => t.id === record.id)) return;
      commit({ ...state, tasks: [...state.tasks, record] });
    },

    clearAll() {
      storage.clear();
      commit(hydrate(null));
    },
  };

  return api;
}

// ---------------------------------------------------------------------------

function serializable({ tasks }) {
  return { tasks };
}

/** Build a valid state from whatever was loaded (possibly nothing). */
function hydrate(loaded) {
  return { tasks: sanitizeTasks(loaded?.tasks) };
}

function sanitizeTasks(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const t of list) {
    try {
      const clean = normalizeTask(t);
      const id = typeof t.id === 'string' && t.id ? t.id : uid('task');
      if (seen.has(id)) continue;
      seen.add(id);
      const completed = Boolean(t.completed);
      out.push({
        id,
        createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
        updatedAt: Number.isFinite(t.updatedAt) ? t.updatedAt : Date.now(),
        completed,
        completedAt: completed && Number.isFinite(t.completedAt) ? t.completedAt : completed ? Date.now() : null,
        ...clean,
      });
    } catch {
      // Drop records we cannot make sense of rather than poisoning the app.
    }
  }
  return out;
}

/** Validate & coerce a task payload. Throws on invalid input. */
export function normalizeTask(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid task');

  const name = String(input.name ?? '').trim().slice(0, NAME_MAX);
  if (!name) throw new Error('Task name is required');

  const description = String(input.description ?? '').trim().slice(0, DESCRIPTION_MAX);

  if (!isValidDayKey(input.endDate)) throw new Error('End date must be YYYY-MM-DD');

  const category = isCategoryId(input.category) ? input.category : DEFAULT_CATEGORY;

  return { name, description, endDate: input.endDate, category };
}
