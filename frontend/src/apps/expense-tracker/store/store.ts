import { createStorage, type Storage } from '@shared/storage/createStorage';
import { uid } from '@shared/lib/ids';
import { CATEGORY_PALETTE, DEFAULT_CATEGORIES } from '../data/defaultCategories';
import { isValidDayKey } from '../lib/dates';
import type { Category, ExpenseState, GridSort, Preferences, Transaction, TransactionInput, TxType } from '../types';

/**
 * Application data store.
 *
 * Holds everything that must survive a reload — transactions, categories and
 * user preferences — and persists every mutation to storage. Listeners are
 * notified after each change so the UI can re-render.
 */

export const STORAGE_KEY = 'expense-tracker-ng';
export const TX_TYPES: TxType[] = ['expense', 'income'];

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze<Preferences>({
  currency: 'USD',
  locale: 'en-US',
  theme: 'system',
  lastCategory: { expense: 'cat_food', income: 'cat_salary' },
  gridSort: { key: 'date', dir: 'desc' },
});

type Persisted = Pick<ExpenseState, 'transactions' | 'categories' | 'preferences'>;

export interface ExpenseStore {
  getState(): ExpenseState;
  readonly saveFailed: boolean;
  subscribe(fn: (state: ExpenseState) => void): () => void;
  addTransaction(input: TransactionInput): Transaction;
  updateTransaction(id: string, patch: Partial<TransactionInput>): Transaction;
  deleteTransaction(id: string): Transaction | null;
  addTransactions(records: Array<Partial<Transaction> & TransactionInput>): Transaction[];
  removeTransactionsWhere(predicate: (t: Transaction) => boolean): Transaction[];
  restoreTransaction(record: Transaction): void;
  addCategory(input: { name: string; type: TxType; color?: string }): Category;
  renameCategory(id: string, name: string): void;
  deleteCategory(id: string): void;
  setPreferences(patch: Partial<Preferences>): void;
  exportData(): Persisted & { app: string; exportedAt: string };
  importData(data: unknown): void;
  clearAll(): void;
}

export function createStore({ storage = createStorage<Persisted>(STORAGE_KEY) }: { storage?: Storage<Persisted> } = {}): ExpenseStore {
  let state = hydrate(storage.load());
  const listeners = new Set<(state: ExpenseState) => void>();
  let lastSaveOk = true;

  function commit(next: ExpenseState) {
    state = next;
    lastSaveOk = storage.save(serializable(state));
    for (const fn of listeners) fn(state);
  }

  const api: ExpenseStore = {
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
      const record: Transaction = { id: uid('tx'), createdAt: now, updatedAt: now, ...tx };
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
      const record: Transaction = { ...existing, ...merged, updatedAt: Date.now() };
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
     */
    addTransactions(records) {
      if (!Array.isArray(records)) throw new Error('Expected an array of transactions');
      const existing = new Set(state.transactions.map((t) => t.id));
      const added: Transaction[] = [];
      for (const r of records) {
        const clean = normalizeTransaction(r, state.categories); // throws on bad input
        const id = typeof r.id === 'string' && r.id ? r.id : uid('tx');
        if (existing.has(id)) continue;
        existing.add(id);
        const now = Date.now();
        added.push({
          id,
          createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : now,
          updatedAt: Number.isFinite(r.updatedAt) ? (r.updatedAt as number) : now,
          ...clean,
        });
      }
      if (added.length) commit({ ...state, transactions: [...state.transactions, ...added] });
      return added;
    },

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
      const duplicate = state.categories.find((c) => c.type === type && c.name.toLowerCase() === cleanName.toLowerCase());
      if (duplicate) return duplicate;
      const custom = state.categories.filter((c) => !c.builtIn).length;
      const record: Category = {
        id: uid('cat'),
        name: cleanName,
        type,
        color: color || (CATEGORY_PALETTE[custom % CATEGORY_PALETTE.length] as string),
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
        transactions: state.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: fallback.id } : t)),
        preferences: {
          ...state.preferences,
          lastCategory: {
            ...state.preferences.lastCategory,
            [cat.type]: state.preferences.lastCategory[cat.type] === id ? fallback.id : state.preferences.lastCategory[cat.type],
          },
        },
      });
    },

    // ---- preferences ------------------------------------------------------

    setPreferences(patch) {
      commit({ ...state, preferences: { ...state.preferences, ...patch } });
    },

    // ---- bulk -------------------------------------------------------------

    exportData() {
      return { app: STORAGE_KEY, exportedAt: new Date().toISOString(), ...serializable(state) };
    },

    importData(data) {
      if (!data || typeof data !== 'object' || !Array.isArray((data as Persisted).transactions)) {
        throw new Error('Unrecognised file format');
      }
      commit(hydrate(data as Partial<Persisted>));
    },

    clearAll() {
      storage.clear();
      commit(hydrate(null));
    },
  };

  return api;
}

// ---------------------------------------------------------------------------

function serializable({ transactions, categories, preferences }: ExpenseState): Persisted {
  return { transactions, categories, preferences };
}

/** Build a valid state from whatever was loaded (possibly nothing). */
function hydrate(loaded: Partial<Persisted> | null): ExpenseState {
  const categories = sanitizeCategories(loaded?.categories);
  const transactions = sanitizeTransactions(loaded?.transactions, categories);
  const preferences = sanitizePreferences(loaded?.preferences, categories);
  return { transactions, categories, preferences };
}

function sanitizeCategories(list: unknown): Category[] {
  const seen = new Set<string>();
  const out: Category[] = [];
  const source = Array.isArray(list) && list.length ? (list as Partial<Category>[]) : DEFAULT_CATEGORIES;
  for (const c of source) {
    if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') continue;
    if (!TX_TYPES.includes(c.type as TxType) || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({
      id: c.id,
      name: c.name,
      type: c.type as TxType,
      color: typeof c.color === 'string' ? c.color : '#9ca3af',
      builtIn: Boolean(c.builtIn),
    });
  }
  // Guarantee an "Other" bucket per type so deletions always have a home.
  for (const type of TX_TYPES) {
    if (!out.some((c) => c.type === type)) {
      out.push(DEFAULT_CATEGORIES.find((c) => c.type === type && c.id.startsWith('cat_other')) as Category);
    }
  }
  return out;
}

function sanitizeTransactions(list: unknown, categories: Category[]): Transaction[] {
  if (!Array.isArray(list)) return [];
  const out: Transaction[] = [];
  for (const t of list as Partial<Transaction>[]) {
    try {
      const clean = normalizeTransaction(t, categories);
      out.push({
        id: typeof t.id === 'string' ? t.id : uid('tx'),
        createdAt: Number.isFinite(t.createdAt) ? (t.createdAt as number) : Date.now(),
        updatedAt: Number.isFinite(t.updatedAt) ? (t.updatedAt as number) : Date.now(),
        ...clean,
      });
    } catch {
      // Drop records we cannot make sense of rather than poisoning the app.
    }
  }
  return out;
}

function sanitizePreferences(prefs: unknown, categories: Category[]): Preferences {
  const p = { ...DEFAULT_PREFERENCES, ...(prefs && typeof prefs === 'object' ? (prefs as Partial<Preferences>) : {}) } as Preferences;
  const lastCategory = { ...DEFAULT_PREFERENCES.lastCategory, ...(p.lastCategory || {}) };
  for (const type of TX_TYPES) {
    if (!categories.some((c) => c.id === lastCategory[type] && c.type === type)) {
      lastCategory[type] = (categories.find((c) => c.type === type) as Category).id;
    }
  }
  if (!['system', 'light', 'dark'].includes(p.theme)) p.theme = 'system';
  if (typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency)) p.currency = 'USD';
  if (typeof p.locale !== 'string') p.locale = 'en-US';
  const gridSort = (p.gridSort && typeof p.gridSort === 'object' ? p.gridSort : {}) as Partial<GridSort>;
  return {
    ...p,
    lastCategory,
    gridSort: {
      key: ['date', 'amount', 'category', 'description'].includes(gridSort.key as string) ? (gridSort.key as GridSort['key']) : 'date',
      dir: gridSort.dir === 'asc' ? 'asc' : 'desc',
    },
  };
}

/** Validate & coerce a transaction payload. Throws on invalid input. */
export function normalizeTransaction(input: unknown, categories: Category[]): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> {
  if (!input || typeof input !== 'object') throw new Error('Invalid transaction');
  const raw = input as Partial<TransactionInput>;
  const type = TX_TYPES.includes(raw.type as TxType) ? (raw.type as TxType) : null;
  if (!type) throw new Error('Type must be "expense" or "income"');

  const amount = Number(raw.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive whole number of cents');

  if (!isValidDayKey(raw.date)) throw new Error('Date must be YYYY-MM-DD');

  let categoryId = raw.categoryId as string;
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat || cat.type !== type) {
    categoryId = fallbackCategory(categories, type).id;
  }

  const description = String(raw.description ?? '')
    .trim()
    .slice(0, 200);
  return { type, amount, date: raw.date, categoryId, description };
}

function fallbackCategory(categories: Category[], type: TxType, excludeId?: string): Category {
  const pool = categories.filter((c) => c.type === type && c.id !== excludeId);
  return (pool.find((c) => c.id.startsWith('cat_other')) || pool[0]) as Category;
}

function rememberCategory(preferences: Preferences, tx: Transaction): Preferences {
  if (preferences.lastCategory[tx.type] === tx.categoryId) return preferences;
  return { ...preferences, lastCategory: { ...preferences.lastCategory, [tx.type]: tx.categoryId } };
}
