import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/data/defaultCategories.js';
import { createMemoryBackend, createStorage } from '../src/store/storage.js';
import { createStore, normalizeTransaction } from '../src/store/store.js';

let backend;
let store;

const make = () => createStore({ storage: createStorage(backend) });

beforeEach(() => {
  backend = createMemoryBackend();
  store = make();
});

describe('initial state', () => {
  it('seeds default categories and preferences when storage is empty', () => {
    const s = store.getState();
    expect(s.transactions).toEqual([]);
    expect(s.categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(s.preferences.currency).toBe('USD');
    expect(s.preferences.lastCategory).toEqual({ expense: 'cat_food', income: 'cat_salary' });
  });
});

describe('transactions', () => {
  it('adds a transaction, persists it, and notifies subscribers', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    const tx = store.addTransaction({ type: 'expense', amount: 1250, categoryId: 'cat_food', description: '  Lunch ', date: '2025-03-10' });

    expect(tx.id).toMatch(/^tx_/);
    expect(tx.description).toBe('Lunch');
    expect(listener).toHaveBeenCalledTimes(1);

    // A fresh store reading the same backend sees the data.
    expect(make().getState().transactions).toEqual([tx]);
  });

  it('remembers the last used category per type', () => {
    store.addTransaction({ type: 'expense', amount: 1, categoryId: 'cat_transport', date: '2025-03-10' });
    store.addTransaction({ type: 'income', amount: 1, categoryId: 'cat_gifts', date: '2025-03-10' });
    expect(store.getState().preferences.lastCategory).toEqual({ expense: 'cat_transport', income: 'cat_gifts' });
  });

  it('falls back to "Other" when the category is missing or of the wrong type', () => {
    const a = store.addTransaction({ type: 'expense', amount: 1, categoryId: 'nope', date: '2025-03-10' });
    const b = store.addTransaction({ type: 'income', amount: 1, categoryId: 'cat_food', date: '2025-03-10' });
    expect(a.categoryId).toBe('cat_other_expense');
    expect(b.categoryId).toBe('cat_other_income');
  });

  it.each([
    [{ type: 'loan', amount: 1, categoryId: 'cat_food', date: '2025-03-10' }, /Type/],
    [{ type: 'expense', amount: 0, categoryId: 'cat_food', date: '2025-03-10' }, /Amount/],
    [{ type: 'expense', amount: 12.5, categoryId: 'cat_food', date: '2025-03-10' }, /Amount/],
    [{ type: 'expense', amount: -5, categoryId: 'cat_food', date: '2025-03-10' }, /Amount/],
    [{ type: 'expense', amount: 1, categoryId: 'cat_food', date: '2025-02-30' }, /Date/],
    [{ type: 'expense', amount: 1, categoryId: 'cat_food', date: '10/03/2025' }, /Date/],
  ])('rejects invalid input %j', (input, message) => {
    expect(() => store.addTransaction(input)).toThrow(message);
  });

  it('updates a transaction and bumps updatedAt', () => {
    const tx = store.addTransaction({ type: 'expense', amount: 100, categoryId: 'cat_food', date: '2025-03-10' });
    const updated = store.updateTransaction(tx.id, { amount: 200, description: 'Changed' });
    expect(updated.amount).toBe(200);
    expect(updated.description).toBe('Changed');
    expect(updated.createdAt).toBe(tx.createdAt);
    expect(store.getState().transactions).toHaveLength(1);
    expect(() => store.updateTransaction('missing', {})).toThrow(/not found/);
  });

  it('deletes and restores (undo)', () => {
    const tx = store.addTransaction({ type: 'expense', amount: 100, categoryId: 'cat_food', date: '2025-03-10' });
    const removed = store.deleteTransaction(tx.id);
    expect(removed).toEqual(tx);
    expect(store.getState().transactions).toHaveLength(0);
    expect(store.deleteTransaction(tx.id)).toBeNull();

    store.restoreTransaction(removed);
    store.restoreTransaction(removed); // idempotent
    expect(store.getState().transactions).toEqual([tx]);
  });

  it('keeps state immutable between commits', () => {
    const before = store.getState();
    store.addTransaction({ type: 'expense', amount: 1, categoryId: 'cat_food', date: '2025-03-10' });
    expect(before.transactions).toHaveLength(0);
    expect(store.getState()).not.toBe(before);
  });
});

describe('bulk transactions', () => {
  const rec = (id, over = {}) => ({ id, type: 'expense', amount: 100, categoryId: 'cat_food', date: '2025-03-10', description: id, ...over });

  it('adds many records in a single commit and persists them', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    const added = store.addTransactions([rec('a'), rec('b', { type: 'income', categoryId: 'cat_salary' })]);
    expect(added.map((t) => t.id)).toEqual(['a', 'b']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(make().getState().transactions.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('skips records whose id already exists (idempotent re-load)', () => {
    store.addTransactions([rec('a'), rec('b')]);
    const again = store.addTransactions([rec('a'), rec('b'), rec('c')]);
    expect(again.map((t) => t.id)).toEqual(['c']);
    expect(store.getState().transactions).toHaveLength(3);
  });

  it('does not overwrite an existing record with the same id', () => {
    store.addTransactions([rec('a', { amount: 100 })]);
    store.addTransactions([rec('a', { amount: 999 })]);
    expect(store.getState().transactions[0].amount).toBe(100);
  });

  it('is atomic: one invalid record rejects the whole batch', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    expect(() => store.addTransactions([rec('a'), rec('bad', { amount: -1 })])).toThrow(/Amount/);
    expect(store.getState().transactions).toHaveLength(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('rejects a non-array payload', () => {
    expect(() => store.addTransactions('nope')).toThrow(/array/);
    expect(() => store.addTransactions(null)).toThrow(/array/);
  });

  it('an empty batch is a no-op that does not notify', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.addTransactions([])).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('assigns ids and timestamps when missing, keeps them when present', () => {
    const [a, b] = store.addTransactions([rec(undefined), rec('keep', { createdAt: 5, updatedAt: 6 })]);
    expect(a.id).toMatch(/^tx_/);
    expect(Number.isFinite(a.createdAt)).toBe(true);
    expect(b).toMatchObject({ id: 'keep', createdAt: 5, updatedAt: 6 });
  });

  it('does not change the "last used category" preference', () => {
    store.addTransactions([rec('a', { categoryId: 'cat_transport' })]);
    expect(store.getState().preferences.lastCategory.expense).toBe('cat_food');
  });

  it('removeTransactionsWhere removes matches, returns them, and leaves the rest', () => {
    store.addTransactions([rec('mock_1'), rec('mock_2'), rec('mine')]);
    const removed = store.removeTransactionsWhere((t) => t.id.startsWith('mock_'));
    expect(removed.map((t) => t.id)).toEqual(['mock_1', 'mock_2']);
    expect(store.getState().transactions.map((t) => t.id)).toEqual(['mine']);
    expect(make().getState().transactions.map((t) => t.id)).toEqual(['mine']);
  });

  it('removeTransactionsWhere with no matches is a no-op that does not notify', () => {
    store.addTransactions([rec('mine')]);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.removeTransactionsWhere(() => false)).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getState().transactions).toHaveLength(1);
  });
});

describe('categories', () => {
  it('adds a custom category with an assigned colour', () => {
    const cat = store.addCategory({ name: '  Pets ', type: 'expense' });
    expect(cat).toMatchObject({ name: 'Pets', type: 'expense', builtIn: false });
    expect(cat.color).toMatch(/^#/);
    expect(store.getState().categories.at(-1)).toEqual(cat);
  });

  it('returns the existing category on a case-insensitive duplicate', () => {
    const a = store.addCategory({ name: 'Pets', type: 'expense' });
    const b = store.addCategory({ name: 'pets', type: 'expense' });
    expect(b).toBe(a);
    expect(store.getState().categories.filter((c) => c.name.toLowerCase() === 'pets')).toHaveLength(1);
  });

  it('rejects blank names and bad types', () => {
    expect(() => store.addCategory({ name: '  ', type: 'expense' })).toThrow(/name/);
    expect(() => store.addCategory({ name: 'x', type: 'weird' })).toThrow(/type/);
  });

  it('renames a category', () => {
    store.renameCategory('cat_food', 'Eating out');
    expect(store.getState().categories.find((c) => c.id === 'cat_food').name).toBe('Eating out');
  });

  it('moves transactions to "Other" when a category is deleted', () => {
    const pets = store.addCategory({ name: 'Pets', type: 'expense' });
    const tx = store.addTransaction({ type: 'expense', amount: 1, categoryId: pets.id, date: '2025-03-10' });
    expect(store.getState().preferences.lastCategory.expense).toBe(pets.id);

    store.deleteCategory(pets.id);
    const s = store.getState();
    expect(s.categories.find((c) => c.id === pets.id)).toBeUndefined();
    expect(s.transactions.find((t) => t.id === tx.id).categoryId).toBe('cat_other_expense');
    expect(s.preferences.lastCategory.expense).toBe('cat_other_expense');
  });
});

describe('preferences', () => {
  it('merges patches and persists', () => {
    store.setPreferences({ currency: 'EUR', theme: 'dark' });
    expect(make().getState().preferences).toMatchObject({ currency: 'EUR', theme: 'dark', locale: 'en-US' });
  });
});

describe('hydration from untrusted storage', () => {
  it('drops malformed records and repairs preferences', () => {
    backend.setItem(
      'expense-tracker-ng',
      JSON.stringify({
        version: 1,
        data: {
          transactions: [
            { id: 't1', type: 'expense', amount: 100, categoryId: 'cat_food', date: '2025-01-01', createdAt: 1, updatedAt: 1 },
            { id: 't2', type: 'expense', amount: 'lots', categoryId: 'cat_food', date: '2025-01-01' },
            null,
            { id: 't3', type: 'income', amount: 5, categoryId: 'deleted_cat', date: '2025-01-02' },
          ],
          categories: [{ id: 'cat_food', name: 'Food', type: 'expense', color: '#fff' }, { bogus: true }],
          preferences: { currency: 'not-a-code', theme: 'neon', lastCategory: { expense: 'gone' }, gridSort: { key: 'nope', dir: 'sideways' } },
        },
      }),
    );
    const s = make().getState();
    expect(s.transactions.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(s.transactions[1].categoryId).toBe('cat_other_income'); // repaired
    expect(s.categories.map((c) => c.id)).toEqual(['cat_food', 'cat_other_income']);
    expect(s.preferences.currency).toBe('USD');
    expect(s.preferences.theme).toBe('system');
    expect(s.preferences.lastCategory.expense).toBe('cat_food');
    expect(s.preferences.gridSort).toEqual({ key: 'date', dir: 'desc' });
  });
});

describe('import / export / clear', () => {
  it('exports a snapshot that can be imported back', () => {
    store.addTransaction({ type: 'expense', amount: 1, categoryId: 'cat_food', date: '2025-03-10' });
    const snapshot = store.exportData();
    expect(snapshot.app).toBe('expense-tracker-ng');

    const other = createStore({ storage: createStorage(createMemoryBackend()) });
    other.importData(JSON.parse(JSON.stringify(snapshot)));
    expect(other.getState().transactions).toEqual(store.getState().transactions);
  });

  it('rejects garbage imports', () => {
    expect(() => store.importData({ foo: 1 })).toThrow(/format/);
    expect(() => store.importData(null)).toThrow(/format/);
  });

  it('clearAll wipes storage and resets to defaults', () => {
    store.addTransaction({ type: 'expense', amount: 1, categoryId: 'cat_food', date: '2025-03-10' });
    store.addCategory({ name: 'Pets', type: 'expense' });
    store.clearAll();
    expect(store.getState().transactions).toEqual([]);
    expect(store.getState().categories).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it('flags save failures', () => {
    const failing = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    const s = createStore({ storage: createStorage(failing) });
    expect(s.saveFailed).toBe(false);
    s.setPreferences({ theme: 'dark' });
    expect(s.saveFailed).toBe(true);
  });
});

describe('normalizeTransaction', () => {
  it('trims and caps description length', () => {
    const out = normalizeTransaction({ type: 'expense', amount: 1, categoryId: 'cat_food', date: '2025-03-10', description: 'x'.repeat(500) }, DEFAULT_CATEGORIES);
    expect(out.description).toHaveLength(200);
  });
});
