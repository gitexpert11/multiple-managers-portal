import { describe, expect, it } from 'vitest';
import { createMemoryBackend, createStorage, SCHEMA_VERSION } from './createStorage';

describe('createStorage', () => {
  it('round-trips data in a versioned envelope under its own key', () => {
    const backend = createMemoryBackend();
    const storage = createStorage<{ n: number }>('k1', backend);
    expect(storage.load()).toBeNull();
    expect(storage.save({ n: 1 })).toBe(true);
    const envelope = JSON.parse(backend.getItem('k1') as string);
    expect(envelope.version).toBe(SCHEMA_VERSION);
    expect(typeof envelope.savedAt).toBe('number');
    expect(storage.load()).toEqual({ n: 1 });
    expect(backend.getItem('k2')).toBeNull();
    storage.clear();
    expect(storage.load()).toBeNull();
  });

  it('is defensive about corrupt, incompatible or missing payloads', () => {
    const backend = createMemoryBackend();
    const storage = createStorage('k', backend);
    backend.setItem('k', 'not json');
    expect(storage.load()).toBeNull();
    backend.setItem('k', JSON.stringify({ version: SCHEMA_VERSION + 1, data: { x: 1 } }));
    expect(storage.load()).toBeNull();
    backend.setItem('k', JSON.stringify({ version: 1 }));
    expect(storage.load()).toBeNull();
    backend.setItem('k', JSON.stringify(['nope']));
    expect(storage.load()).toBeNull();
  });

  it('reports failed writes instead of throwing', () => {
    const storage = createStorage('k', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(storage.load()).toBeNull();
    expect(storage.save({})).toBe(false);
    expect(() => storage.clear()).not.toThrow();
    expect(createStorage('k', null).save({})).toBe(false);
  });
});
