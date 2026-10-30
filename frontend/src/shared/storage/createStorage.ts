/**
 * Versioned localStorage persistence shared by the local-first apps.
 *
 * Each app owns its own key (`expense-tracker-ng`, `todo-manager-ng`,
 * `workspace-ng`), so any one of them can be exported, wiped or migrated
 * without touching the others. Reads are defensive: a missing, corrupt or
 * incompatible payload yields `null` rather than throwing.
 */

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Storage<T> {
  readonly key: string;
  /** Persisted data, or null if none / unusable. */
  load(): T | null;
  /** Whether the write succeeded (false on quota errors, blocked storage, ...). */
  save(data: T): boolean;
  clear(): void;
}

interface Envelope<T> {
  version: number;
  savedAt: number;
  data: T;
}

export const SCHEMA_VERSION = 1;

export function createStorage<T>(key: string, backend: StorageBackend | null = getDefaultBackend(), version = SCHEMA_VERSION): Storage<T> {
  return {
    key,
    load() {
      if (!backend) return null;
      let raw: string | null;
      try {
        raw = backend.getItem(key);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        return migrate<T>(JSON.parse(raw) as unknown, version);
      } catch {
        return null;
      }
    },
    save(data) {
      if (!backend) return false;
      const envelope: Envelope<T> = { version, savedAt: Date.now(), data };
      try {
        backend.setItem(key, JSON.stringify(envelope));
        return true;
      } catch {
        // QuotaExceededError, private-mode restrictions, etc.
        return false;
      }
    },
    clear() {
      try {
        backend?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Upgrade older envelopes to the current schema. Returns null if unusable. */
function migrate<T>(envelope: unknown, version: number): T | null {
  if (!envelope || typeof envelope !== 'object') return null;
  const e = envelope as Partial<Envelope<T>>;
  if (typeof e.version !== 'number' || !e.data || typeof e.data !== 'object') return null;
  if (e.version > version) return null; // written by a newer app
  return e.data;
}

export function getDefaultBackend(): StorageBackend | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.getItem('__probe__'); // can throw in sandboxed contexts
      return window.localStorage;
    }
  } catch {
    /* fall through */
  }
  return createMemoryBackend();
}

/** In-memory stand-in with the same interface, for tests or blocked storage. */
export function createMemoryBackend(): StorageBackend & { clear(): void } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}
