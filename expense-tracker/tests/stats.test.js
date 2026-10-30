import { describe, expect, it } from 'vitest';
import { expensesByCategory, incomeByCategory, sortTransactions, summarize, totalsByCategory, transactionsInMonth } from '../src/lib/stats.js';

const cats = [
  { id: 'food', name: 'Food', type: 'expense', color: '#f00' },
  { id: 'rent', name: 'Rent', type: 'expense', color: '#0f0' },
  { id: 'salary', name: 'Salary', type: 'income', color: '#00f' },
];

const tx = (over) => ({ id: 'x', type: 'expense', amount: 100, categoryId: 'food', description: '', date: '2025-03-10', createdAt: 1, ...over });

describe('transactionsInMonth', () => {
  it('filters by month key', () => {
    const list = [tx({ date: '2025-03-01' }), tx({ date: '2025-04-01' }), tx({ date: '2025-03-31' })];
    expect(transactionsInMonth(list, '2025-03')).toHaveLength(2);
    expect(transactionsInMonth(list, '2025-05')).toHaveLength(0);
  });
});

describe('summarize', () => {
  it('totals income, expenses and remaining', () => {
    const list = [tx({ type: 'income', amount: 5000, categoryId: 'salary' }), tx({ amount: 1250 }), tx({ amount: 750 })];
    expect(summarize(list)).toEqual({ income: 5000, expenses: 2000, remaining: 3000, count: 3 });
  });

  it('handles an empty month', () => {
    expect(summarize([])).toEqual({ income: 0, expenses: 0, remaining: 0, count: 0 });
  });

  it('is exact with cent amounts (no float drift)', () => {
    const list = Array.from({ length: 10 }, () => tx({ amount: 10 })); // 10 × $0.10
    expect(summarize(list).expenses).toBe(100);
  });
});

describe('expensesByCategory', () => {
  it('groups expenses only, sorted by amount desc, with shares', () => {
    const list = [
      tx({ amount: 300, categoryId: 'food' }),
      tx({ amount: 700, categoryId: 'rent' }),
      tx({ type: 'income', amount: 9999, categoryId: 'salary' }),
    ];
    const out = expensesByCategory(list, cats);
    expect(out.map((s) => s.name)).toEqual(['Rent', 'Food']);
    expect(out[0].share).toBeCloseTo(0.7);
    expect(out[1].color).toBe('#f00');
  });

  it('buckets unknown categories instead of dropping money', () => {
    const out = expensesByCategory([tx({ categoryId: 'ghost', amount: 50 })], cats);
    expect(out).toEqual([{ categoryId: 'ghost', name: 'Uncategorized', color: '#9ca3af', amount: 50, share: 1 }]);
  });

  it('returns an empty array when there are no expenses', () => {
    expect(expensesByCategory([tx({ type: 'income', categoryId: 'salary' })], cats)).toEqual([]);
  });
});

describe('incomeByCategory / totalsByCategory', () => {
  const list = [
    tx({ type: 'income', amount: 4000, categoryId: 'salary' }),
    tx({ type: 'income', amount: 1000, categoryId: 'salary' }),
    tx({ type: 'income', amount: 2500, categoryId: 'bonus' }), // unknown category
    tx({ amount: 900, categoryId: 'food' }),
  ];

  it('groups income only, sorted by amount desc, with shares of total income', () => {
    const out = incomeByCategory(list, cats);
    expect(out.map((s) => [s.name, s.amount])).toEqual([
      ['Salary', 5000],
      ['Uncategorized', 2500],
    ]);
    expect(out[0].share).toBeCloseTo(5000 / 7500);
    expect(out[1].share).toBeCloseTo(2500 / 7500);
    expect(out[0].color).toBe('#00f');
  });

  it('returns an empty array when there is no income', () => {
    expect(incomeByCategory([tx({ amount: 5 })], cats)).toEqual([]);
    expect(incomeByCategory([], cats)).toEqual([]);
  });

  it('expense and income breakdowns partition the same data', () => {
    const exp = totalsByCategory(list, cats, 'expense');
    const inc = totalsByCategory(list, cats, 'income');
    expect(exp.reduce((a, s) => a + s.amount, 0)).toBe(900);
    expect(inc.reduce((a, s) => a + s.amount, 0)).toBe(7500);
    expect(expensesByCategory(list, cats)).toEqual(exp);
  });

  it('rejects an unknown type', () => {
    expect(() => totalsByCategory(list, cats, 'transfer')).toThrow(/type/);
  });
});

describe('sortTransactions', () => {
  const list = [
    tx({ id: 'a', date: '2025-03-02', amount: 500, categoryId: 'rent', description: 'b', createdAt: 1 }),
    tx({ id: 'b', date: '2025-03-01', amount: 100, categoryId: 'food', description: 'a', createdAt: 2 }),
    tx({ id: 'c', date: '2025-03-02', type: 'income', amount: 300, categoryId: 'salary', description: 'c', createdAt: 3 }),
  ];

  it('sorts by date desc by default, newest created first on ties', () => {
    expect(sortTransactions(list).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by signed amount', () => {
    expect(sortTransactions(list, { key: 'amount', dir: 'asc' }).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by category name', () => {
    expect(sortTransactions(list, { key: 'category', dir: 'asc' }, cats).map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input', () => {
    const copy = list.slice();
    sortTransactions(list, { key: 'amount', dir: 'asc' });
    expect(list).toEqual(copy);
  });
});
