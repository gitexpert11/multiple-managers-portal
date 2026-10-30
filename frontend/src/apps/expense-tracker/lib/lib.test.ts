import { describe, expect, it } from 'vitest';
import { generateMockTransactions, isMockTransaction } from '../data/mockData';
import { clampMonthKey, currentMonthKey, defaultDateForMonth, formatDay, isValidDayKey, isValidMonthKey, monthLabel, shiftMonth, todayKey } from './dates';
import { buildPdfDocument, buildWorkbook, createExportFile, monthsInRange, selectForExport, validateExportRange } from './export/exportData';
import { centsToInput, currencySymbol, formatMoney, parseAmount } from './money';
import { sortTransactions, summarize, totalsByCategory, transactionsInMonth } from './stats';
import { DEFAULT_CATEGORIES } from '../data/defaultCategories';
import type { Transaction } from '../types';

const NOW = new Date(2025, 2, 15, 10);

describe('dates', () => {
  it('builds and validates keys', () => {
    expect(todayKey(NOW)).toBe('2025-03-15');
    expect(currentMonthKey(NOW)).toBe('2025-03');
    expect(isValidDayKey('2024-02-29')).toBe(true);
    expect(isValidDayKey('2025-02-29')).toBe(false);
    expect(isValidDayKey('2025-13-01')).toBe(false);
    expect(isValidMonthKey('2025-12')).toBe(true);
    expect(isValidMonthKey('2025-13')).toBe(false);
  });

  it('shifts, clamps and labels months', () => {
    expect(shiftMonth('2025-01', -1)).toBe('2024-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2025-03', -27)).toBe('2022-12');
    expect(clampMonthKey('2025-06', '2025-03')).toBe('2025-03');
    expect(clampMonthKey('2025-01', '2025-03')).toBe('2025-01');
    expect(monthLabel('2025-03')).toBe('March 2025');
    expect(defaultDateForMonth('2025-03', NOW)).toBe('2025-03-15');
    expect(defaultDateForMonth('2025-01', NOW)).toBe('2025-01-01');
    expect(formatDay('2025-03-05')).toBe('Mar 5');
  });
});

describe('money', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['.5', 50],
    ['1,234.56', 123456],
    ['1.234,56', 123456],
    ['12,50', 1250],
    ['1,234', 123400],
    ['1 000.25', 100025],
  ])('parses %s -> %d cents', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '-5', '0', '0.00', '12.345', '.', null, undefined, '1e5'])('rejects %s', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('formats and converts', () => {
    expect(centsToInput(1250)).toBe('12.50');
    expect(centsToInput(-199)).toBe('-1.99');
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(-1250)).toBe('-$12.50');
    expect(formatMoney(1250, { signed: true })).toBe('+$12.50');
    expect(formatMoney(1000, { currency: 'EUR' })).toBe('€10.00');
    expect(() => formatMoney(100, { currency: 'NOPE' })).not.toThrow();
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('CAD')).toBe('CA$');
  });
});

const tx = (over: Partial<Transaction>): Transaction => ({ id: 'x', type: 'expense', amount: 100, date: '2025-03-10', categoryId: 'cat_food', description: '', createdAt: 1, updatedAt: 1, ...over });

describe('stats', () => {
  const list = [
    tx({ id: 'a', amount: 1200, date: '2025-03-01', categoryId: 'cat_food', description: 'Lunch', createdAt: 1 }),
    tx({ id: 'b', amount: 300, date: '2025-03-02', categoryId: 'cat_transport', description: 'Bus', createdAt: 2 }),
    tx({ id: 'c', type: 'income', amount: 5000, date: '2025-03-01', categoryId: 'cat_salary', description: 'Pay', createdAt: 3 }),
    tx({ id: 'd', amount: 999, date: '2025-02-28', categoryId: 'cat_food' }),
  ];

  it('scopes to a month and summarises', () => {
    const inMonth = transactionsInMonth(list, '2025-03');
    expect(inMonth.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(summarize(inMonth)).toEqual({ income: 5000, expenses: 1500, remaining: 3500, count: 3 });
  });

  it('groups by category with shares, largest first, and buckets unknown ids', () => {
    const slices = totalsByCategory([...list, tx({ id: 'e', amount: 100, categoryId: 'gone' })], DEFAULT_CATEGORIES, 'expense');
    expect(slices.map((s) => [s.name, s.amount])).toEqual([
      ['Food & Dining', 2199],
      ['Transport', 300],
      ['Uncategorized', 100],
    ]);
    expect(slices[0]?.share).toBeCloseTo(2199 / 2599);
    expect(() => totalsByCategory(list, DEFAULT_CATEGORIES, 'nope' as never)).toThrow();
  });

  it('sorts by every column in both directions', () => {
    const ids = (sorted: Transaction[]) => sorted.map((t) => t.id);
    expect(ids(sortTransactions(list, { key: 'date', dir: 'desc' }))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(sortTransactions(list, { key: 'amount', dir: 'desc' }))).toEqual(['c', 'b', 'd', 'a']);
    expect(ids(sortTransactions(list, { key: 'category', dir: 'asc' }, DEFAULT_CATEGORIES))).toEqual(['a', 'd', 'c', 'b']);
    expect(ids(sortTransactions(list, { key: 'description', dir: 'asc' }))).toEqual(['d', 'b', 'a', 'c']);
  });
});

describe('mock data', () => {
  it('is deterministic, never in the future and only uses built-in categories', () => {
    const a = generateMockTransactions({ now: NOW });
    const b = generateMockTransactions({ now: NOW });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(200);
    expect(a.every((t) => t.date <= '2025-03-15')).toBe(true);
    expect(a.every((t) => isMockTransaction(t))).toBe(true);
    const ids = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    expect(a.every((t) => ids.has(t.categoryId))).toBe(true);
    expect(generateMockTransactions({ now: NOW, months: 1 }).every((t) => t.date.startsWith('2025-03'))).toBe(true);
    expect(() => generateMockTransactions({ months: 0 })).toThrow();
  });
});

describe('export', () => {
  const list = [
    tx({ id: 'a', amount: 1200, date: '2025-02-10', description: 'Lunch' }),
    tx({ id: 'b', type: 'income', amount: 5000, date: '2025-03-01', categoryId: 'cat_salary', description: 'Pay' }),
    tx({ id: 'c', amount: 300, date: '2025-03-20', categoryId: 'cat_transport', description: 'Bus' }),
  ];

  it('validates ranges', () => {
    expect(validateExportRange({ startMonth: '2025-01', endMonth: '2025-03', maxMonth: '2025-03' })).toBeNull();
    expect(validateExportRange({ startMonth: '2025-04', endMonth: '2025-03' })).toMatch(/after the start/);
    expect(validateExportRange({ startMonth: '2025-01', endMonth: '2025-04', maxMonth: '2025-03' })).toMatch(/future/);
    expect(validateExportRange({ startMonth: 'x', endMonth: '2025-03' })).toMatch(/Choose/);
    expect(monthsInRange('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
  });

  it('selects and summarises per month', () => {
    const sel = selectForExport(list, { startMonth: '2025-02', endMonth: '2025-03', types: 'both' });
    expect(sel.transactions.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(sel.months.map((m) => [m.month, m.income, m.expenses, m.net, m.count])).toEqual([
      ['2025-02', 0, 1200, -1200, 1],
      ['2025-03', 5000, 300, 4700, 2],
    ]);
    expect(sel.totals).toEqual({ income: 5000, expenses: 1500, net: 3500, count: 3 });
    expect(selectForExport(list, { startMonth: '2025-03', endMonth: '2025-03', types: 'expense' }).transactions.map((t) => t.id)).toEqual(['c']);
  });

  it('builds workbook and pdf specs and files', () => {
    const sel = selectForExport(list, { startMonth: '2025-02', endMonth: '2025-03', types: 'both' });
    const wb = buildWorkbook(sel, { categories: DEFAULT_CATEGORIES, currency: 'USD' });
    expect(wb.sheets.map((s) => s.name)).toEqual(['Summary', 'Expenses', 'Income']);
    expect(wb.sheets[0]?.columns.map((c) => c.header)).toEqual(['Month', 'Income (USD)', 'Expenses (USD)', 'Net (USD)', 'Transactions']);
    expect(wb.sheets[1]?.rows[0]).toEqual([{ type: 'date', value: '2025-02-10' }, 'Food & Dining', 'Lunch', { type: 'number', value: 12 }]);
    const pdf = buildPdfDocument(sel, { categories: DEFAULT_CATEGORIES, currency: 'USD', locale: 'en-US', generatedAt: NOW });
    expect(pdf.subtitle).toBe('February 2025 – March 2025 · Expenses & income');
    expect(pdf.sections).toHaveLength(3);
    const xlsx = createExportFile(sel, 'xlsx', { categories: DEFAULT_CATEGORIES, currency: 'USD', locale: 'en-US' });
    expect(xlsx.filename).toBe('expense-tracker_2025-02_to_2025-03_all.xlsx');
    expect(xlsx.bytes.length).toBeGreaterThan(500);
    const pdfFile = createExportFile(sel, 'pdf', { categories: DEFAULT_CATEGORIES, currency: 'USD', locale: 'en-US' });
    expect(pdfFile.mime).toBe('application/pdf');
    expect(() => createExportFile(sel, 'csv' as never, { categories: [], currency: 'USD', locale: 'en-US' })).toThrow();
  });
});
