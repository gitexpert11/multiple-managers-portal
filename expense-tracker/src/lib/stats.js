import { monthKeyOf } from './dates.js';

/** Transactions whose date falls within the given "YYYY-MM" month. */
export function transactionsInMonth(transactions, monthKey) {
  return transactions.filter((t) => monthKeyOf(t.date) === monthKey);
}

/** Totals (in cents) for a set of transactions. */
export function summarize(transactions) {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else expenses += t.amount;
  }
  return { income, expenses, remaining: income - expenses, count: transactions.length };
}

/**
 * Totals of one transaction type grouped by category, sorted by amount
 * descending. Categories with no activity are omitted. Unknown category ids
 * are grouped under a synthetic "Uncategorized" bucket so money is never
 * silently dropped.
 */
export function totalsByCategory(transactions, categories, type) {
  if (type !== 'expense' && type !== 'income') throw new Error('type must be "expense" or "income"');
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map();
  for (const t of transactions) {
    if (t.type !== type) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + t.amount);
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([categoryId, amount]) => {
      const cat = byId.get(categoryId);
      return {
        categoryId,
        name: cat ? cat.name : 'Uncategorized',
        color: cat ? cat.color : '#9ca3af',
        amount,
        share: grand ? amount / grand : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export function expensesByCategory(transactions, categories) {
  return totalsByCategory(transactions, categories, 'expense');
}

export function incomeByCategory(transactions, categories) {
  return totalsByCategory(transactions, categories, 'income');
}

/** Sort a copy of transactions by a column. */
export function sortTransactions(transactions, { key = 'date', dir = 'desc' } = {}, categories = []) {
  const byId = new Map(categories.map((c) => [c.id, c.name]));
  const mult = dir === 'asc' ? 1 : -1;
  const cmp = {
    date: (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
    amount: (a, b) => signed(a) - signed(b),
    category: (a, b) => (byId.get(a.categoryId) || '').localeCompare(byId.get(b.categoryId) || ''),
    description: (a, b) => (a.description || '').localeCompare(b.description || ''),
  }[key] || ((a, b) => a.date.localeCompare(b.date));
  return transactions.slice().sort((a, b) => mult * cmp(a, b));
}

function signed(t) {
  return t.type === 'income' ? t.amount : -t.amount;
}
