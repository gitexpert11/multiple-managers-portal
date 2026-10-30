import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBackend, createStorage } from '@shared/storage/createStorage';
import { createStore, normalizeTransaction, STORAGE_KEY, type ExpenseStore } from './store';
import { DEFAULT_CATEGORIES } from '../data/defaultCategories';

let backend: ReturnType<typeof createMemoryBackend>;
let store: ExpenseStore;

beforeEach(() => {
  backend = createMemoryBackend();
  store = createStore({ storage: createStorage(STORAGE_KEY, backend) });
});

describe('expense store', () => {
  it('starts with the default categories and preferences', () => {
    const { transactions, categories, preferences } = store.getState();
    expect(transactions).toEqual([]);
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(preferences.currency).toBe('USD');
    expect(preferences.gridSort).toEqual({ key: 'date', dir: 'desc' });
  });

  it('adds, updates, deletes and restores transactions, remembering the last category', () => {
    const tx = store.addTransaction({ type: 'expense', amount: 1250, date: '2025-03-10', categoryId: 'cat_transport', description: ' Taxi ' });
    expect(tx.id).toMatch(/^tx_/);
    expect(tx.description).toBe('Taxi');
    expect(store.getState().preferences.lastCategory.expense).toBe('cat_transport');

    const updated = store.updateTransaction(tx.id, { amount: 2000 });
    expect(updated.amount).toBe(2000);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(tx.updatedAt);
    expect(() => store.updateTransaction('nope', {})).toThrow('Transaction not found');

    const removed = store.deleteTransaction(tx.id);
    expect(removed?.id).toBe(tx.id);
    expect(store.getState().transactions).toHaveLength(0);
    store.restoreTransaction(removed!);
    expect(store.getState().transactions).toHaveLength(1);
    store.restoreTransaction(removed!); // no duplicates
    expect(store.getState().transactions).toHaveLength(1);
  });

  it('validates input and falls back to the "Other" category of the right type', () => {
    expect(() => store.addTransaction({ type: 'nope' as never, amount: 1, date: '2025-03-10' })).toThrow(/Type/);
    expect(() => store.addTransaction({ type: 'expense', amount: 0, date: '2025-03-10' })).toThrow(/Amount/);
    expect(() => store.addTransaction({ type: 'expense', amount: 1.5, date: '2025-03-10' })).toThrow(/Amount/);
    expect(() => store.addTransaction({ type: 'expense', amount: 100, date: '2025-02-30' })).toThrow(/Date/);
    expect(normalizeTransaction({ type: 'income', amount: 100, date: '2025-03-10', categoryId: 'cat_food' }, DEFAULT_CATEGORIES).categoryId).toBe('cat_other_income');
  });

  it('persists every change and reloads it, dropping corrupt records', () => {
    store.addTransaction({ type: 'expense', amount: 100, date: '2025-03-10' });
    const saved = JSON.parse(backend.getItem(STORAGE_KEY) as string);
    saved.data.transactions.push({ id: 'bad', type: 'expense', amount: 'x', date: '2025-03-10' });
    backend.setItem(STORAGE_KEY, JSON.stringify(saved));
    const reloaded = createStore({ storage: createStorage(STORAGE_KEY, backend) });
    expect(reloaded.getState().transactions).toHaveLength(1);
  });

  it('manages categories and reassigns transactions on delete', () => {
    const cat = store.addCategory({ name: 'Pets', type: 'expense' });
    expect(cat.builtIn).toBe(false);
    expect(store.addCategory({ name: 'pets', type: 'expense' })).toBe(cat); // case-insensitive duplicate
    const tx = store.addTransaction({ type: 'expense', amount: 100, date: '2025-03-10', categoryId: cat.id });
    store.renameCategory(cat.id, 'Animals');
    expect(store.getState().categories.find((c) => c.id === cat.id)?.name).toBe('Animals');
    store.deleteCategory(cat.id);
    expect(store.getState().transactions.find((t) => t.id === tx.id)?.categoryId).toBe('cat_other_expense');
    expect(store.getState().preferences.lastCategory.expense).toBe('cat_other_expense');
    expect(() => store.addCategory({ name: '', type: 'expense' })).toThrow();
  });

  it('adds sample batches atomically and removes them by predicate', () => {
    const added = store.addTransactions([
      { id: 'mock_1', type: 'expense', amount: 100, date: '2025-03-01' },
      { id: 'mock_1', type: 'expense', amount: 100, date: '2025-03-01' },
      { id: 'mock_2', type: 'income', amount: 500, date: '2025-03-02' },
    ]);
    expect(added.map((t) => t.id)).toEqual(['mock_1', 'mock_2']);
    expect(() => store.addTransactions([{ id: 'x', type: 'expense', amount: -1, date: '2025-03-01' }])).toThrow();
    expect(store.getState().transactions).toHaveLength(2);
    expect(store.removeTransactionsWhere((t) => t.id.startsWith('mock_'))).toHaveLength(2);
    expect(store.getState().transactions).toHaveLength(0);
  });

  it('exports, imports and clears', () => {
    store.addTransaction({ type: 'expense', amount: 100, date: '2025-03-10' });
    const data = store.exportData();
    expect(data.app).toBe(STORAGE_KEY);
    store.clearAll();
    expect(store.getState().transactions).toHaveLength(0);
    store.importData(data);
    expect(store.getState().transactions).toHaveLength(1);
    expect(() => store.importData({ nope: true })).toThrow(/Unrecognised/);
  });

  it('notifies subscribers and reports save failures', () => {
    const seen: number[] = [];
    const unsubscribe = store.subscribe((s) => seen.push(s.transactions.length));
    store.addTransaction({ type: 'expense', amount: 100, date: '2025-03-10' });
    unsubscribe();
    store.addTransaction({ type: 'expense', amount: 100, date: '2025-03-10' });
    expect(seen).toEqual([1]);

    const failing = createStore({ storage: { key: 'k', load: () => null, save: () => false, clear: () => {} } });
    expect(failing.saveFailed).toBe(false);
    failing.setPreferences({ currency: 'EUR' });
    expect(failing.saveFailed).toBe(true);
  });
});
