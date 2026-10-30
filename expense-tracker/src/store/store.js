import { DEFAULT_CATEGORIES, CATEGORY_PALETTE } from '../data/defaultCategories.js';
import { isValidDayKey } from '../lib/dates.js';
import { uid } from '../lib/ids.js';
import { createStorage } from './storage.js';

/**
 * Application data store.
 *
 * Holds everything that must survive a reload — transactions, categories and
 * user preferences — and persists every mutation to storage. Listeners are
 * notified after each change so the UI can re-render.
 */

export const TX_TYPES = ['expense', 'income'];

export const DEFAULT_PREFERENCES = Object.freeze({
  currency: 'USD',
  locale: 'en-US',
  theme: 'system', // 'system' | 'light' | 'dark'
  lastCategory: { expense: 'cat_food', income: 'cat_salary' },
  gridSort: { key: 'date', dir: 'desc' },
});

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

    // ---- transactions -----------------------------------------------------

    addTransaction(input) {
      const tx = normalizeTransaction(input, state.categories);
      const now = Date.now();
      const record = { id: uid('tx'), createdAt: now, updatedAt: now, ...tx };
      commit({
        ...state,
        transactions: [...state.transactions, record],
        preferences: rememberCategory(state.preferences, record),
      });
      return record;
    },

    updateTransaction(id, patch) {
      const existing = state.transactions.find((t) => t.id === id);
      if (!existing) throw new Error('Transaction not found');
      const merged = normalizeTransaction({ ...existing, ...patch }, state.categories);
      const record = { ...existing, ...merged, updatedAt: Date.now() };
      commit({
        ...state,
        transactions: state.transactions.map((t) => (t.id === id ? record : t)),
        preferences: rememberCategory(state.preferences, record),
      });
      return record;
    },

    deleteTransaction(id) {
      const existing = state.transactions.find((t) => t.id === id);
      if (!existing) return null;
      commit({ ...state, transactions: state.transactions.filter((t) => t.id !== id) });
      return existing;
    },

    /**
     * Insert many records at once (e.g. sample data). Records whose id already
     * exists are skipped. The batch is atomic: if any record is invalid nothing
     * is written. Does not touch "last used category" preferences.
     * @returns {object[]} the records that were actually added
     */
    addTransactions(records) {
      if (!Array.isArray(records)) throw new Error('Expected an array of transactions');
      const existing = new Set(state.transactions.map((t) => t.id));
      const added = [];
      for (const r of records) {
        const clean = normalizeTransaction(r, state.categories); // throws on bad input
        const id = typeof r.id === 'string' && r.id ? r.id : uid('tx');
        if (existing.has(id)) continue;
        existing.add(id);
        const now = Date.now();
        added.push({
          id,
          createdAt: Number.isFinite(r.createdAt) ? r.createdAt : now,
          updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : now,
          ...clean,
        });
      }
      if (added.length) commit({ ...state, transactions: [...state.transactions, ...added] });
      return added;
    },

    /**
     * Remove every transaction matching the predicate.
     * @returns {object[]} the removed records
     */
    removeTransactionsWhere(predicate) {
      const removed = state.transactions.filter(predicate);
      if (removed.length) commit({ ...state, transactions: state.transactions.filter((t) => !predicate(t)) });
      return removed;
    },

    /** Re-insert a previously deleted record verbatim (undo). */
    restoreTransaction(record) {
      if (!record || state.transactions.some((t) => t.id === record.id)) return;
      commit({ ...state, transactions: [...state.transactions, record] });
    },

    // ---- categories -------------------------------------------------------

    addCategory({ name, type, color }) {
      const cleanName = String(name || '').trim();
      if (!cleanName) throw new Error('Category name is required');
      if (!TX_TYPES.includes(type)) throw new Error('Invalid category type');
      const duplicate = state.categories.find(
        (c) => c.type === type && c.name.toLowerCase() === cleanName.toLowerCase(),
      );
      if (duplicate) return duplicate;
      const custom = state.categories.filter((c) => !c.builtIn).length;
      const record = {
        id: uid('cat'),
        name: cleanName,
        type,
        color: color || CATEGORY_PALETTE[custom % CATEGORY_PALETTE.length],
        builtIn: false,
      };
      commit({ ...state, categories: [...state.categories, record] });
      return record;
    },

    renameCategory(id, name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) throw new Error('Category name is required');
      commit({
        ...state,
        categories: state.categories.map((c) => (c.id === id ? { ...c, name: cleanName } : c)),
      });
    },

    /** Delete a category; its transactions are moved to the type's "Other" bucket. */
    deleteCategory(id) {
      const cat = state.categories.find((c) => c.id === id);
      if (!cat) return;
      const fallback = fallbackCategory(state.categories, cat.type, id);
      commit({
        ...state,
        categories: state.categories.filter((c) => c.id !== id),
        transactions: state.transactions.map((t) =>
          t.categoryId === id ? { ...t, categoryId: fallback.id } : t,
        ),
        preferences: {
          ...state.preferences,
          lastCategory: {
            ...state.preferences.lastCategory,
            [cat.type]:
              state.preferences.lastCategory[cat.type] === id
                ? fallback.id
                : state.preferences.lastCategory[cat.type],
          },
        },
      });
    },

    // ---- preferences ------------------------------------------------------

    setPreferences(patch) {
      commit({ ...state, preferences: { ...state.preferences, ...patch } });
    },

    // ---- bulk -------------------------------------------------------------

    /** Full snapshot suitable for JSON export. */
    exportData() {
      return { app: 'expense-tracker-ng', exportedAt: new Date().toISOString(), ...serializable(state) };
    },

    /** Replace everything with an imported snapshot. Throws if it is unusable. */
    importData(data) {
      if (!data || typeof data !== 'object' || !Array.isArray(data.transactions)) {
        throw new Error('Unrecognised file format');
      }
      commit(hydrate(data));
    },

    clearAll() {
      storage.clear();
      commit(hydrate(null));
    },
  };

  return api;
}

// ---------------------------------------------------------------------------

function serializable({ transactions, categories, preferences }) {
  return { transactions, categories, preferences };
}

/** Build a valid state from whatever was loaded (possibly nothing). */
function hydrate(loaded) {
  const categories = sanitizeCategories(loaded?.categories);
  const transactions = sanitizeTransactions(loaded?.transactions, categories);
  const preferences = sanitizePreferences(loaded?.preferences, categories);
  return { transactions, categories, preferences };
}

function sanitizeCategories(list) {
  const seen = new Set();
  const out = [];
  const source = Array.isArray(list) && list.length ? list : DEFAULT_CATEGORIES;
  for (const c of source) {
    if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') continue;
    if (!TX_TYPES.includes(c.type) || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({
      id: c.id,
      name: c.name,
      type: c.type,
      color: typeof c.color === 'string' ? c.color : '#9ca3af',
      builtIn: Boolean(c.builtIn),
    });
  }
  // Guarantee an "Other" bucket per type so deletions always have a home.
  for (const type of TX_TYPES) {
    if (!out.some((c) => c.type === type)) {
      out.push(DEFAULT_CATEGORIES.find((c) => c.type === type && c.id.startsWith('cat_other')));
    }
  }
  return out;
}

function sanitizeTransactions(list, categories) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const t of list) {
    try {
      const clean = normalizeTransaction(t, categories);
      out.push({
        id: typeof t.id === 'string' ? t.id : uid('tx'),
        createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
        updatedAt: Number.isFinite(t.updatedAt) ? t.updatedAt : Date.now(),
        ...clean,
      });
    } catch {
      // Drop records we cannot make sense of rather than poisoning the app.
    }
  }
  return out;
}

function sanitizePreferences(prefs, categories) {
  const p = { ...DEFAULT_PREFERENCES, ...(prefs && typeof prefs === 'object' ? prefs : {}) };
  const lastCategory = { ...DEFAULT_PREFERENCES.lastCategory, ...(p.lastCategory || {}) };
  for (const type of TX_TYPES) {
    if (!categories.some((c) => c.id === lastCategory[type] && c.type === type)) {
      lastCategory[type] = categories.find((c) => c.type === type).id;
    }
  }
  if (!['system', 'light', 'dark'].includes(p.theme)) p.theme = 'system';
  if (typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency)) p.currency = 'USD';
  if (typeof p.locale !== 'string') p.locale = 'en-US';
  const gridSort = p.gridSort && typeof p.gridSort === 'object' ? p.gridSort : {};
  return {
    ...p,
    lastCategory,
    gridSort: {
      key: ['date', 'amount', 'category', 'description'].includes(gridSort.key) ? gridSort.key : 'date',
      dir: gridSort.dir === 'asc' ? 'asc' : 'desc',
    },
  };
}

/** Validate & coerce a transaction payload. Throws on invalid input. */
export function normalizeTransaction(input, categories) {
  if (!input || typeof input !== 'object') throw new Error('Invalid transaction');
  const type = TX_TYPES.includes(input.type) ? input.type : null;
  if (!type) throw new Error('Type must be "expense" or "income"');

  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive whole number of cents');

  if (!isValidDayKey(input.date)) throw new Error('Date must be YYYY-MM-DD');

  let categoryId = input.categoryId;
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat || cat.type !== type) {
    categoryId = fallbackCategory(categories, type).id;
  }

  const description = String(input.description ?? '').trim().slice(0, 200);
  return { type, amount, date: input.date, categoryId, description };
}

function fallbackCategory(categories, type, excludeId) {
  const pool = categories.filter((c) => c.type === type && c.id !== excludeId);
  return pool.find((c) => c.id.startsWith('cat_other')) || pool[0];
}

function rememberCategory(preferences, tx) {
  if (preferences.lastCategory[tx.type] === tx.categoryId) return preferences;
  return { ...preferences, lastCategory: { ...preferences.lastCategory, [tx.type]: tx.categoryId } };
}
