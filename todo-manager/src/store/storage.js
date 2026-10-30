/**
 * localStorage persistence with a versioned envelope.
 *
 * The Todo Manager owns its own key, fully separate from the Expense Tracker's
 * `expense-tracker-ng`, so either app can be exported, wiped or migrated
 * without touching the other. Reads are defensive: a missing, corrupt or
 * incompatible payload yields `null` rather than throwing.
 */

export const STORAGE_KEY = 'todo-manager-ng';
export const SCHEMA_VERSION = 1;

export function createStorage(backend = getDefaultBackend(), key = STORAGE_KEY) {
  return {
    key,

    /** @returns {object|null} persisted data, or null if none/unusable */
    load() {
      if (!backend) return null;
      let raw;
      try {
        raw = backend.getItem(key);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        return migrate(JSON.parse(raw));
      } catch {
        return null;
      }
    },

    /** @returns {boolean} whether the write succeeded */
    save(data) {
      if (!backend) return false;
      const envelope = { version: SCHEMA_VERSION, savedAt: Date.now(), data };
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
function migrate(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  if (typeof envelope.version !== 'number' || !envelope.data || typeof envelope.data !== 'object') return null;
  if (envelope.version > SCHEMA_VERSION) return null; // written by a newer app
  return envelope.data;
}

function getDefaultBackend() {
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
export function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}
