import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, STORAGE_KEY, createMemoryBackend, createStorage } from '../src/store/storage.js';

describe('todo storage', () => {
  it('uses its own key, distinct from the expense tracker', () => {
    expect(STORAGE_KEY).toBe('ads-campaign-manager-ng');
    expect(STORAGE_KEY).not.toBe('expense-tracker-ng');
  });

  it('round-trips data through a versioned envelope', () => {
    const backend = createMemoryBackend();
    const storage = createStorage(backend);
    expect(storage.load()).toBeNull();
    expect(storage.save({ campaigns: [1, 2] })).toBe(true);
    const raw = JSON.parse(backend.getItem(STORAGE_KEY));
    expect(raw.version).toBe(SCHEMA_VERSION);
    expect(typeof raw.savedAt).toBe('number');
    expect(storage.load()).toEqual({ campaigns: [1, 2] });
  });

  it('uses the real localStorage by default', () => {
    window.localStorage.clear();
    const storage = createStorage();
    storage.save({ hello: 'world' });
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"hello":"world"');
    storage.clear();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null for corrupt JSON or a malformed envelope', () => {
    const backend = createMemoryBackend();
    backend.setItem(STORAGE_KEY, '{not json');
    expect(createStorage(backend).load()).toBeNull();
    backend.setItem(STORAGE_KEY, JSON.stringify({ campaigns: [] }));
    expect(createStorage(backend).load()).toBeNull();
    backend.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION + 1, data: {} }));
    expect(createStorage(backend).load()).toBeNull();
  });

  it('reports a failed write instead of throwing and tolerates reads that throw', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(createStorage(full).save({})).toBe(false);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(createStorage(blocked).load()).toBeNull();
  });
});

describe('remaining edge cases', () => {
  it('negative: clear() swallows a backend that throws on remove', () => {
    const backend = { getItem: () => null, setItem: () => {}, removeItem: () => { throw new Error('blocked'); } };
    expect(() => createStorage(backend).clear()).not.toThrow();
  });

  it('edge: no backend at all -> load() null, save() false, clear() harmless', () => {
    const storage = createStorage(null);
    expect(storage.load()).toBeNull();
    expect(storage.save({ campaigns: [] })).toBe(false);
    expect(() => storage.clear()).not.toThrow();
  });

  it('edge: falls back to an in-memory backend when localStorage is unavailable', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try {
      const storage = createStorage();
      expect(storage.save({ campaigns: [1] })).toBe(true);
      expect(storage.load()).toEqual({ campaigns: [1] });
    } finally {
      Object.defineProperty(window, 'localStorage', desc);
    }
  });
});
