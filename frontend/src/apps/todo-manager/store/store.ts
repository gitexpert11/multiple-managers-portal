import { createStorage, type Storage } from '@shared/storage/createStorage';
import { uid } from '@shared/lib/ids';
import { DEFAULT_CATEGORY, isCategoryId } from '../data/categories';
import { isValidDayKey } from '../lib/dates';
import type { Task, TaskInput, TodoState } from '../types';

/**
 * Todo data store.
 *
 * Holds the task list and persists every mutation to storage. Listeners are
 * notified after each change so the UI can re-render.
 */

export const STORAGE_KEY = 'todo-manager-ng';
export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 500;

type Persisted = Pick<TodoState, 'tasks'>;
type LooseTask = Partial<Task> & TaskInput;

export interface TodoStore {
  getState(): TodoState;
  readonly saveFailed: boolean;
  subscribe(fn: (state: TodoState) => void): () => void;
  addTask(input: TaskInput): Task;
  updateTask(id: string, patch: Partial<TaskInput>): Task;
  toggleTask(id: string): Task;
  deleteTask(id: string): Task | null;
  addTasks(records: LooseTask[]): Task[];
  removeTasksWhere(predicate: (t: Task) => boolean): Task[];
  restoreTask(record: Task): void;
  clearAll(): void;
}

export function createStore({ storage = createStorage<Persisted>(STORAGE_KEY) }: { storage?: Storage<Persisted> } = {}): TodoStore {
  let state = hydrate(storage.load());
  const listeners = new Set<(state: TodoState) => void>();
  let lastSaveOk = true;

  function commit(next: TodoState) {
    state = next;
    lastSaveOk = storage.save(serializable(state));
    for (const fn of listeners) fn(state);
  }

  function find(id: string): Task {
    const existing = state.tasks.find((t) => t.id === id);
    if (!existing) throw new Error('Task not found');
    return existing;
  }

  const api: TodoStore = {
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
      const record: Task = { id: uid('task'), createdAt: now, updatedAt: now, completed: false, completedAt: null, ...clean };
      commit({ ...state, tasks: [...state.tasks, record] });
      return record;
    },

    updateTask(id, patch) {
      const existing = find(id);
      const merged = normalizeTask({ ...existing, ...patch });
      const record: Task = { ...existing, ...merged, updatedAt: Date.now() };
      commit({ ...state, tasks: state.tasks.map((t) => (t.id === id ? record : t)) });
      return record;
    },

    /** Flip a task between open and completed. */
    toggleTask(id) {
      const existing = find(id);
      const completed = !existing.completed;
      const now = Date.now();
      const record: Task = { ...existing, completed, completedAt: completed ? now : null, updatedAt: now };
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
     */
    addTasks(records) {
      if (!Array.isArray(records)) throw new Error('Expected an array of tasks');
      const existing = new Set(state.tasks.map((t) => t.id));
      const added: Task[] = [];
      for (const r of records) {
        const clean = normalizeTask(r); // throws on bad input
        const id = typeof r.id === 'string' && r.id ? r.id : uid('task');
        if (existing.has(id)) continue;
        existing.add(id);
        const now = Date.now();
        const completed = Boolean(r.completed);
        added.push({
          id,
          createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : now,
          updatedAt: Number.isFinite(r.updatedAt) ? (r.updatedAt as number) : now,
          completed,
          completedAt: completed ? (Number.isFinite(r.completedAt) ? (r.completedAt as number) : now) : null,
          ...clean,
        });
      }
      if (added.length) commit({ ...state, tasks: [...state.tasks, ...added] });
      return added;
    },

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

function serializable({ tasks }: TodoState): Persisted {
  return { tasks };
}

function hydrate(loaded: Partial<Persisted> | null): TodoState {
  return { tasks: sanitizeTasks(loaded?.tasks) };
}

function sanitizeTasks(list: unknown): Task[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Task[] = [];
  for (const t of list as Partial<Task>[]) {
    try {
      const clean = normalizeTask(t);
      const id = typeof t.id === 'string' && t.id ? t.id : uid('task');
      if (seen.has(id)) continue;
      seen.add(id);
      const completed = Boolean(t.completed);
      out.push({
        id,
        createdAt: Number.isFinite(t.createdAt) ? (t.createdAt as number) : Date.now(),
        updatedAt: Number.isFinite(t.updatedAt) ? (t.updatedAt as number) : Date.now(),
        completed,
        completedAt: completed && Number.isFinite(t.completedAt) ? (t.completedAt as number) : completed ? Date.now() : null,
        ...clean,
      });
    } catch {
      // Drop records we cannot make sense of rather than poisoning the app.
    }
  }
  return out;
}

/** Validate & coerce a task payload. Throws on invalid input. */
export function normalizeTask(input: unknown): Pick<Task, 'name' | 'description' | 'endDate' | 'category'> {
  if (!input || typeof input !== 'object') throw new Error('Invalid task');
  const raw = input as Partial<TaskInput>;

  const name = String(raw.name ?? '')
    .trim()
    .slice(0, NAME_MAX);
  if (!name) throw new Error('Task name is required');

  const description = String(raw.description ?? '')
    .trim()
    .slice(0, DESCRIPTION_MAX);

  if (!isValidDayKey(raw.endDate)) throw new Error('End date must be YYYY-MM-DD');

  const category = isCategoryId(raw.category) ? raw.category : DEFAULT_CATEGORY;

  return { name, description, endDate: raw.endDate, category };
}
