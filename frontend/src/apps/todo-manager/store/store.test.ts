import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBackend, createStorage } from '@shared/storage/createStorage';
import { createStore, normalizeTask, STORAGE_KEY, type TodoStore } from './store';

let backend: ReturnType<typeof createMemoryBackend>;
let store: TodoStore;

beforeEach(() => {
  backend = createMemoryBackend();
  store = createStore({ storage: createStorage(STORAGE_KEY, backend) });
});

describe('todo store', () => {
  it('adds, toggles, updates, deletes and restores tasks', () => {
    const t = store.addTask({ name: '  Write  ', description: 'x', endDate: '2025-03-20', category: 'travel' });
    expect(t).toMatchObject({ name: 'Write', completed: false, completedAt: null, category: 'travel' });
    const done = store.toggleTask(t.id);
    expect(done.completed).toBe(true);
    expect(done.completedAt).toBeTypeOf('number');
    expect(store.toggleTask(t.id).completedAt).toBeNull();
    expect(store.updateTask(t.id, { name: 'Read' }).name).toBe('Read');
    expect(() => store.updateTask('nope', {})).toThrow('Task not found');
    const removed = store.deleteTask(t.id);
    expect(store.getState().tasks).toHaveLength(0);
    store.restoreTask(removed!);
    expect(store.getState().tasks).toHaveLength(1);
  });

  it('validates and normalises input', () => {
    expect(() => store.addTask({ name: '', endDate: '2025-03-20' })).toThrow(/name/);
    expect(() => store.addTask({ name: 'x', endDate: '2025-02-30' })).toThrow(/End date/);
    expect(normalizeTask({ name: 'x', endDate: '2025-03-20', category: 'bogus' }).category).toBe('office');
    expect(normalizeTask({ name: 'y'.repeat(200), endDate: '2025-03-20' }).name).toHaveLength(120);
  });

  it('persists and reloads, skipping duplicates and corrupt records', () => {
    store.addTask({ name: 'A', endDate: '2025-03-20' });
    const saved = JSON.parse(backend.getItem(STORAGE_KEY) as string);
    saved.data.tasks.push({ id: 'bad' }, { ...saved.data.tasks[0] });
    backend.setItem(STORAGE_KEY, JSON.stringify(saved));
    expect(createStore({ storage: createStorage(STORAGE_KEY, backend) }).getState().tasks).toHaveLength(1);
  });

  it('adds batches atomically and removes by predicate', () => {
    const added = store.addTasks([
      { id: 'mock_1', name: 'A', endDate: '2025-03-01', completed: true },
      { id: 'mock_1', name: 'dup', endDate: '2025-03-01' },
      { id: 'mock_2', name: 'B', endDate: '2025-03-02' },
    ]);
    expect(added.map((t) => t.id)).toEqual(['mock_1', 'mock_2']);
    expect(added[0]?.completedAt).toBeTypeOf('number');
    expect(() => store.addTasks([{ name: '', endDate: '2025-03-01' }])).toThrow();
    expect(store.removeTasksWhere((t) => t.id.startsWith('mock_'))).toHaveLength(2);
    store.addTask({ name: 'keep', endDate: '2025-03-20' });
    store.clearAll();
    expect(store.getState().tasks).toHaveLength(0);
  });
});
