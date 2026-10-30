import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBackend, createStorage, STORAGE_KEY } from '../src/store/storage.js';
import { DESCRIPTION_MAX, NAME_MAX, createStore, normalizeTask } from '../src/store/store.js';

let backend;
let store;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2025, 2, 15, 12) });
  backend = createMemoryBackend();
  store = createStore({ storage: createStorage(backend) });
});

afterEach(() => {
  vi.useRealTimers();
});

const valid = { name: 'Book flights', description: 'Check prices', endDate: '2025-03-20', category: 'travel' };

describe('normalizeTask', () => {
  it('trims and keeps a valid payload', () => {
    expect(normalizeTask({ name: '  Book flights ', description: ' Check prices ', endDate: '2025-03-20', category: 'travel' })).toEqual(valid);
  });

  it('requires a name', () => {
    expect(() => normalizeTask({ ...valid, name: '' })).toThrow(/name is required/i);
    expect(() => normalizeTask({ ...valid, name: '   ' })).toThrow(/name is required/i);
    expect(() => normalizeTask({ ...valid, name: undefined })).toThrow(/name is required/i);
  });

  it('requires a valid end date', () => {
    expect(() => normalizeTask({ ...valid, endDate: '' })).toThrow(/end date/i);
    expect(() => normalizeTask({ ...valid, endDate: '2025-02-30' })).toThrow(/end date/i);
    expect(() => normalizeTask({ ...valid, endDate: 'tomorrow' })).toThrow(/end date/i);
  });

  it('falls back to the default category for unknown ones', () => {
    expect(normalizeTask({ ...valid, category: 'garden' }).category).toBe('office');
    expect(normalizeTask({ ...valid, category: undefined }).category).toBe('office');
  });

  it('caps name and description length and defaults the description', () => {
    const long = 'x'.repeat(1000);
    const out = normalizeTask({ ...valid, name: long, description: long });
    expect(out.name).toHaveLength(NAME_MAX);
    expect(out.description).toHaveLength(DESCRIPTION_MAX);
    expect(normalizeTask({ ...valid, description: undefined }).description).toBe('');
  });

  it('rejects non-objects', () => {
    expect(() => normalizeTask(null)).toThrow();
    expect(() => normalizeTask('task')).toThrow();
  });
});

describe('createStore', () => {
  it('starts empty', () => {
    expect(store.getState()).toEqual({ tasks: [] });
    expect(store.saveFailed).toBe(false);
  });

  it('adds a task with id, timestamps and open status, and persists it', () => {
    const task = store.addTask(valid);
    expect(task).toMatchObject({ ...valid, completed: false, completedAt: null });
    expect(task.id).toMatch(/^task_/);
    expect(task.createdAt).toBe(Date.now());
    expect(task.updatedAt).toBe(Date.now());
    expect(store.getState().tasks).toEqual([task]);

    const raw = JSON.parse(backend.getItem(STORAGE_KEY));
    expect(raw.data.tasks).toEqual([task]);
  });

  it('rejects invalid tasks without touching state', () => {
    expect(() => store.addTask({ ...valid, name: '' })).toThrow();
    expect(store.getState().tasks).toEqual([]);
    expect(backend.getItem(STORAGE_KEY)).toBeNull();
  });

  it('updates a task', () => {
    const task = store.addTask(valid);
    vi.advanceTimersByTime(1000);
    const updated = store.updateTask(task.id, { name: 'Book train', category: 'personal' });
    expect(updated).toMatchObject({ id: task.id, name: 'Book train', category: 'personal', endDate: valid.endDate, createdAt: task.createdAt });
    expect(updated.updatedAt).toBe(task.updatedAt + 1000);
    expect(() => store.updateTask('nope', { name: 'x' })).toThrow(/not found/i);
    expect(() => store.updateTask(task.id, { name: '' })).toThrow(/name/i);
  });

  it('toggles completion back and forth, tracking completedAt', () => {
    const task = store.addTask(valid);
    vi.advanceTimersByTime(500);
    const done = store.toggleTask(task.id);
    expect(done.completed).toBe(true);
    expect(done.completedAt).toBe(Date.now());
    const reopened = store.toggleTask(task.id);
    expect(reopened.completed).toBe(false);
    expect(reopened.completedAt).toBeNull();
    expect(() => store.toggleTask('nope')).toThrow(/not found/i);
  });

  it('deletes and restores a task (undo)', () => {
    const a = store.addTask(valid);
    const b = store.addTask({ ...valid, name: 'Pack' });
    expect(store.deleteTask(a.id)).toEqual(a);
    expect(store.getState().tasks).toEqual([b]);
    expect(store.deleteTask(a.id)).toBeNull();

    store.restoreTask(a);
    expect(store.getState().tasks).toEqual([b, a]);
    store.restoreTask(a); // idempotent
    expect(store.getState().tasks).toHaveLength(2);
  });

  it('notifies subscribers on every change and lets them unsubscribe', () => {
    const seen = [];
    const off = store.subscribe((s) => seen.push(s.tasks.length));
    const t = store.addTask(valid);
    store.toggleTask(t.id);
    off();
    store.deleteTask(t.id);
    expect(seen).toEqual([1, 1]);
  });

  it('clearAll wipes state and storage', () => {
    store.addTask(valid);
    store.clearAll();
    expect(store.getState().tasks).toEqual([]);
    expect(backend.getItem(STORAGE_KEY)).not.toBeNull(); // empty state re-saved
    expect(JSON.parse(backend.getItem(STORAGE_KEY)).data.tasks).toEqual([]);
  });

  it('flags save failures', () => {
    const failing = createStore({ storage: { load: () => null, save: () => false, clear() {} } });
    failing.addTask(valid);
    expect(failing.saveFailed).toBe(true);
  });
});

describe('hydration from storage', () => {
  it('loads previously saved tasks on a fresh store', () => {
    const task = store.addTask(valid);
    store.toggleTask(task.id);
    const again = createStore({ storage: createStorage(backend) });
    expect(again.getState().tasks).toEqual(store.getState().tasks);
  });

  it('repairs partial records and drops unusable ones', () => {
    backend.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        data: {
          tasks: [
            { name: 'No id', endDate: '2025-03-20' }, // missing id/category/timestamps -> repaired
            { id: 'dup', name: 'First', endDate: '2025-03-20', category: 'home' },
            { id: 'dup', name: 'Duplicate id', endDate: '2025-03-21', category: 'home' }, // dropped
            { id: 'bad-date', name: 'Bad', endDate: '20-03-2025', category: 'home' }, // dropped
            { id: 'done', name: 'Done', endDate: '2025-03-01', category: 'office', completed: true }, // completedAt backfilled
            null,
            'garbage',
          ],
        },
      }),
    );
    const loaded = createStore({ storage: createStorage(backend) }).getState().tasks;
    expect(loaded.map((t) => t.name)).toEqual(['No id', 'First', 'Done']);
    expect(loaded[0].id).toMatch(/^task_/);
    expect(loaded[0]).toMatchObject({ category: 'office', description: '', completed: false, completedAt: null });
    expect(loaded[0].createdAt).toBe(Date.now());
    expect(loaded[2]).toMatchObject({ completed: true, completedAt: Date.now() });
  });

  it('starts empty when storage holds garbage', () => {
    backend.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { tasks: 'nope' } }));
    expect(createStore({ storage: createStorage(backend) }).getState().tasks).toEqual([]);
    backend.setItem(STORAGE_KEY, '{broken');
    expect(createStore({ storage: createStorage(backend) }).getState().tasks).toEqual([]);
  });
});

describe('batch operations (sample data)', () => {
  const batch = [
    { id: 'mock_0001', name: 'A', endDate: '2025-03-01', category: 'home', completed: true, completedAt: 5, createdAt: 1, updatedAt: 2 },
    { id: 'mock_0002', name: 'B', endDate: '2025-03-02', category: 'office' },
    { name: 'C', endDate: '2025-03-03', category: 'travel', completed: true }, // no id, no completedAt
  ];

  it('addTasks inserts many records, keeping given ids/timestamps and filling gaps', () => {
    const added = store.addTasks(batch);
    expect(added).toHaveLength(3);
    expect(added[0]).toMatchObject({ id: 'mock_0001', completed: true, completedAt: 5, createdAt: 1, updatedAt: 2 });
    expect(added[1]).toMatchObject({ id: 'mock_0002', completed: false, completedAt: null, createdAt: Date.now() });
    expect(added[2].id).toMatch(/^task_/);
    expect(added[2]).toMatchObject({ completed: true, completedAt: Date.now() });
    expect(store.getState().tasks).toEqual(added);
  });

  it('addTasks skips ids that already exist and is atomic on invalid input', () => {
    store.addTasks(batch);
    expect(store.addTasks(batch.slice(0, 2))).toEqual([]);
    expect(store.getState().tasks).toHaveLength(3);
    expect(() => store.addTasks([{ id: 'mock_0009', name: 'ok', endDate: '2025-03-04', category: 'home' }, { name: '', endDate: 'bad' }])).toThrow();
    expect(store.getState().tasks).toHaveLength(3); // nothing from the failed batch
    expect(() => store.addTasks('nope')).toThrow(/array/i);
  });

  it('removeTasksWhere removes matching records and returns them', () => {
    store.addTasks(batch);
    const mine = store.addTask(valid);
    const removed = store.removeTasksWhere((t) => t.id.startsWith('mock_'));
    expect(removed.map((t) => t.id)).toEqual(['mock_0001', 'mock_0002']);
    expect(store.getState().tasks.map((t) => t.name)).toEqual(['C', mine.name]);
    expect(store.removeTasksWhere(() => false)).toEqual([]);
  });
});
