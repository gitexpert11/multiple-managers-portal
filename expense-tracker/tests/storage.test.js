import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, STORAGE_KEY, createMemoryBackend, createStorage } from '../src/store/storage.js';

describe('storage', () => {
  it('round-trips data through a versioned envelope', () => {
    const backend = createMemoryBackend();
    const storage = createStorage(backend);
    expect(storage.load()).toBeNull();
    expect(storage.save({ transactions: [1, 2] })).toBe(true);
    const raw = JSON.parse(backend.getItem(STORAGE_KEY));
    expect(raw.version).toBe(SCHEMA_VERSION);
    expect(storage.load()).toEqual({ transactions: [1, 2] });
  });

  it('uses the real localStorage by default', () => {
    window.localStorage.clear();
    const storage = createStorage();
    storage.save({ hello: 'world' });
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"hello":"world"');
    storage.clear();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    const backend = createMemoryBackend();
    backend.setItem(STORAGE_KEY, '{not json');
    expect(createStorage(backend).load()).toBeNull();
  });

  it('returns null for an envelope without a version or data', () => {
    const backend = createMemoryBackend();
    backend.setItem(STORAGE_KEY, JSON.stringify({ transactions: [] }));
    expect(createStorage(backend).load()).toBeNull();
  });

  it('refuses envelopes written by a newer schema', () => {
    const backend = createMemoryBackend();
    backend.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION + 1, data: {} }));
    expect(createStorage(backend).load()).toBeNull();
  });

  it('reports a failed write instead of throwing (quota exceeded)', () => {
    const backend = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(createStorage(backend).save({})).toBe(false);
  });

  it('tolerates a backend whose reads throw', () => {
    const backend = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(createStorage(backend).load()).toBeNull();
  });
});

describe('storage: remaining edge cases', () => {
  it('negative: clear() swallows a backend that throws on remove', () => {
    const backend = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => createStorage(backend).clear()).not.toThrow();
  });

  it('edge: load()/save() with no backend at all report "nothing" rather than throwing', () => {
    const storage = createStorage(null);
    expect(storage.load()).toBeNull();
    expect(storage.save({ a: 1 })).toBe(false);
    expect(() => storage.clear()).not.toThrow();
  });

  it('edge: falls back to an in-memory backend when localStorage is unavailable', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const storage = createStorage();
      expect(storage.save({ hello: 'memory' })).toBe(true);
      expect(storage.load()).toEqual({ hello: 'memory' });
    } finally {
      Object.defineProperty(window, 'localStorage', desc);
    }
  });
});
