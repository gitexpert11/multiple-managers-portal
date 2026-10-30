import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { DEFAULT_CATEGORIES } from '../src/data/defaultCategories.js';
import { generateMockTransactions } from '../src/data/mockData.js';
import {
  buildExportFilename,
  buildPdfDocument,
  buildWorkbook,
  createExportFile,
  EXPORT_FORMATS,
  EXPORT_TYPES,
  monthsInRange,
  rangeLabel,
  resolveTypes,
  selectForExport,
  validateExportRange,
} from '../src/lib/export/exportData.js';

const tx = (over) => ({ id: 'x', type: 'expense', amount: 1000, categoryId: 'cat_food', description: '', date: '2025-03-10', createdAt: 1, ...over });
const data = [
  tx({ id: 'a', date: '2025-01-31', amount: 500, description: 'Jan expense' }),
  tx({ id: 'b', date: '2025-02-01', type: 'income', categoryId: 'cat_salary', amount: 400000, description: 'Feb salary' }),
  tx({ id: 'c', date: '2025-02-14', amount: 1250, description: 'Feb expense' }),
  tx({ id: 'd', date: '2025-03-01', type: 'income', categoryId: 'cat_salary', amount: 400000, description: 'Mar salary' }),
  tx({ id: 'e', date: '2025-03-15', amount: 2000, categoryId: 'ghost', description: 'Mar expense' }),
  tx({ id: 'f', date: '2025-04-01', amount: 99, description: 'Apr expense' }),
  tx({ id: 'g', date: '2025-02-14', amount: 1, createdAt: 0, description: 'Feb earlier' }),
];
const opts = { categories: DEFAULT_CATEGORIES, currency: 'USD', locale: 'en-US' };

describe('validateExportRange', () => {
  it('accepts a valid range and rejects bad ones', () => {
    expect(validateExportRange({ startMonth: '2025-01', endMonth: '2025-03' })).toBeNull();
    expect(validateExportRange({ startMonth: '2025-03', endMonth: '2025-03' })).toBeNull();
    expect(validateExportRange({ startMonth: '2025-04', endMonth: '2025-03' })).toMatch(/after the start/);
    expect(validateExportRange({ startMonth: '2025-1', endMonth: '2025-03' })).toMatch(/Choose/);
    expect(validateExportRange({ startMonth: undefined, endMonth: '2025-03' })).toMatch(/Choose/);
  });

  it('rejects future months when a maximum is given', () => {
    expect(validateExportRange({ startMonth: '2025-01', endMonth: '2025-04', maxMonth: '2025-03' })).toMatch(/End month cannot be in the future/);
    expect(validateExportRange({ startMonth: '2025-05', endMonth: '2025-06', maxMonth: '2025-03' })).toMatch(/Start month cannot be in the future/);
    expect(validateExportRange({ startMonth: '2025-01', endMonth: '2025-03', maxMonth: '2025-03' })).toBeNull();
  });
});

describe('resolveTypes / monthsInRange / rangeLabel', () => {
  it('expands the type choice', () => {
    expect(resolveTypes('both')).toEqual(['expense', 'income']);
    expect(resolveTypes('expense')).toEqual(['expense']);
    expect(resolveTypes('income')).toEqual(['income']);
    expect(() => resolveTypes('transfer')).toThrow(/types/);
    expect(EXPORT_TYPES).toEqual(['both', 'expense', 'income']);
    expect(EXPORT_FORMATS).toEqual(['xlsx', 'pdf']);
  });

  it('lists every month inclusively, across year boundaries', () => {
    expect(monthsInRange('2025-03', '2025-03')).toEqual(['2025-03']);
    expect(monthsInRange('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
  });

  it('labels single months and ranges', () => {
    expect(rangeLabel('2025-03', '2025-03')).toBe('March 2025');
    expect(rangeLabel('2025-01', '2025-03')).toBe('January 2025 – March 2025');
  });
});

describe('selectForExport', () => {
  it('includes both boundary months and excludes the rest', () => {
    const sel = selectForExport(data, { startMonth: '2025-02', endMonth: '2025-03' });
    expect(sel.transactions.map((t) => t.id)).toEqual(['b', 'g', 'c', 'd', 'e']);
    expect(sel.totals).toEqual({ income: 800000, expenses: 3251, net: 796749, count: 5 });
  });

  it('sorts by date ascending, then by creation order', () => {
    const sel = selectForExport(data, { startMonth: '2025-02', endMonth: '2025-02' });
    expect(sel.transactions.map((t) => t.id)).toEqual(['b', 'g', 'c']);
  });

  it('filters by type', () => {
    const exp = selectForExport(data, { startMonth: '2025-01', endMonth: '2025-04', types: 'expense' });
    expect(exp.types).toEqual(['expense']);
    expect(exp.transactions.every((t) => t.type === 'expense')).toBe(true);
    expect(exp.byType.income).toEqual([]);
    expect(exp.totals.income).toBe(0);

    const inc = selectForExport(data, { startMonth: '2025-01', endMonth: '2025-04', types: 'income' });
    expect(inc.transactions.map((t) => t.id)).toEqual(['b', 'd']);
    expect(inc.totals).toEqual({ income: 800000, expenses: 0, net: 800000, count: 2 });
  });

  it('summarises every month in the range, including empty ones', () => {
    const sel = selectForExport(data, { startMonth: '2024-12', endMonth: '2025-02' });
    expect(sel.months).toEqual([
      { month: '2024-12', income: 0, expenses: 0, net: 0, count: 0 },
      { month: '2025-01', income: 0, expenses: 500, net: -500, count: 1 },
      { month: '2025-02', income: 400000, expenses: 1251, net: 398749, count: 3 },
    ]);
  });

  it('returns an empty selection for a range with no data', () => {
    const sel = selectForExport(data, { startMonth: '2023-01', endMonth: '2023-02' });
    expect(sel.transactions).toEqual([]);
    expect(sel.months).toHaveLength(2);
    expect(sel.totals).toEqual({ income: 0, expenses: 0, net: 0, count: 0 });
  });

  it('throws on an invalid range or type', () => {
    expect(() => selectForExport(data, { startMonth: '2025-03', endMonth: '2025-02' })).toThrow(/after the start/);
    expect(() => selectForExport(data, { startMonth: '2025-02', endMonth: '2025-03', types: 'nope' })).toThrow(/types/);
  });

  it('does not mutate the input', () => {
    const copy = JSON.stringify(data);
    selectForExport(data, { startMonth: '2025-01', endMonth: '2025-04' });
    expect(JSON.stringify(data)).toBe(copy);
  });
});

describe('buildExportFilename', () => {
  it('encodes range, scope and format', () => {
    expect(buildExportFilename({ startMonth: '2025-01', endMonth: '2025-03', types: 'both', format: 'xlsx' })).toBe('expense-tracker_2025-01_to_2025-03_all.xlsx');
    expect(buildExportFilename({ startMonth: '2025-03', endMonth: '2025-03', types: 'expense', format: 'pdf' })).toBe('expense-tracker_2025-03_expenses.pdf');
    expect(buildExportFilename({ startMonth: '2025-03', endMonth: '2025-04', types: 'income', format: 'pdf' })).toBe('expense-tracker_2025-03_to_2025-04_income.pdf');
  });
});

describe('buildWorkbook', () => {
  const sel = selectForExport(data, { startMonth: '2025-02', endMonth: '2025-03' });

  it('creates Summary + one sheet per type, with amounts in major units', () => {
    const wb = buildWorkbook(sel, opts);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Summary', 'Expenses', 'Income']);
    const [summary, expenses, income] = wb.sheets;
    expect(summary.columns.map((c) => c.header)).toEqual(['Month', 'Income (USD)', 'Expenses (USD)', 'Net (USD)', 'Transactions']);
    expect(summary.rows[0]).toEqual(['February 2025', { type: 'number', value: 4000 }, { type: 'number', value: 12.51 }, { type: 'number', value: 3987.49 }, { type: 'number', value: 3 }]);
    expect(summary.totals[0]).toBe('Total');
    expect(expenses.rows[0]).toEqual([{ type: 'date', value: '2025-02-14' }, 'Food & Dining', 'Feb earlier', { type: 'number', value: 0.01 }]);
    expect(expenses.rows.at(-1)[1]).toBe('Uncategorized'); // unknown category id
    expect(expenses.totals).toEqual(['Total', '', '3 transactions', { type: 'number', value: 32.51 }]);
    expect(income.rows).toHaveLength(2);
    expect(income.totals[3]).toEqual({ type: 'number', value: 8000 });
  });

  it('omits the other type and the Net column when only one type is selected', () => {
    const wb = buildWorkbook(selectForExport(data, { startMonth: '2025-02', endMonth: '2025-03', types: 'income' }), opts);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Summary', 'Income']);
    expect(wb.sheets[0].columns.map((c) => c.header)).toEqual(['Month', 'Income (USD)', 'Transactions']);
  });

  it('labels amount columns with the chosen currency', () => {
    const wb = buildWorkbook(sel, { ...opts, currency: 'INR' });
    expect(wb.sheets[1].columns[3].header).toBe('Amount (INR)');
  });
});

describe('buildPdfDocument', () => {
  const sel = selectForExport(data, { startMonth: '2025-02', endMonth: '2025-03' });

  it('describes title, subtitle, meta and sections', () => {
    const d = buildPdfDocument(sel, { ...opts, generatedAt: new Date(Date.UTC(2025, 3, 1)) });
    expect(d.title).toBe('Expense Tracker report');
    expect(d.subtitle).toBe('February 2025 – March 2025 · Expenses & income');
    expect(d.metaLines[0]).toBe('Currency: USD · Generated 2025-04-01 · 5 transactions');
    expect(d.sections.map((s) => s.heading)).toEqual(['Monthly summary', 'Expenses', 'Income']);
    expect(d.sections[0].rows[0]).toEqual(['February 2025', '4,000.00', '12.51', '3,987.49', '3']);
    expect(d.sections[1].rows[0]).toEqual(['2025-02-14', 'Food & Dining', 'Feb earlier', '0.01']);
    expect(d.sections[1].totals).toEqual(['Total', '', '3 transactions', '32.51']);
    expect(d.sections[1].columns[3]).toEqual({ label: 'Amount (USD)', width: 2, align: 'right' });
  });

  it('uses ISO currency codes instead of symbols (PDF-safe) and a single-type subtitle', () => {
    const d = buildPdfDocument(selectForExport(data, { startMonth: '2025-02', endMonth: '2025-02', types: 'expense' }), { ...opts, currency: 'INR' });
    expect(d.subtitle).toBe('February 2025 · Expenses');
    expect(d.sections[1].columns[3].label).toBe('Amount (INR)');
    expect(JSON.stringify(d)).not.toContain('₹');
  });

  it('formats negative net with a leading minus', () => {
    const d = buildPdfDocument(selectForExport(data, { startMonth: '2025-01', endMonth: '2025-01' }), opts);
    expect(d.sections[0].rows[0]).toEqual(['January 2025', '0.00', '5.00', '-5.00', '1']);
  });
});

describe('createExportFile', () => {
  const sel = selectForExport(data, { startMonth: '2025-02', endMonth: '2025-03' });

  it('renders xlsx bytes with the right mime and filename', () => {
    const f = createExportFile(sel, 'xlsx', opts);
    expect(f.filename).toBe('expense-tracker_2025-02_to_2025-03_all.xlsx');
    expect(f.mime).toContain('spreadsheetml');
    const files = unzipSync(f.bytes);
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Income"');
    expect(strFromU8(files['xl/worksheets/sheet2.xml'])).toContain('Feb earlier');
  });

  it('renders pdf bytes with the right mime and filename', () => {
    const f = createExportFile(sel, 'pdf', opts);
    expect(f.filename).toBe('expense-tracker_2025-02_to_2025-03_all.pdf');
    expect(f.mime).toBe('application/pdf');
    expect(String.fromCharCode(...f.bytes.slice(0, 8))).toBe('%PDF-1.4');
  });

  it('rejects unknown formats', () => {
    expect(() => createExportFile(sel, 'csv', opts)).toThrow(/format/);
  });

  it('handles two years of sample data in both formats without error', () => {
    const now = new Date(2026, 9, 27);
    const all = generateMockTransactions({ now });
    const big = selectForExport(all, { startMonth: '2024-11', endMonth: '2026-10' });
    expect(big.totals.count).toBe(all.length);
    expect(big.months).toHaveLength(24);
    const xlsx = createExportFile(big, 'xlsx', opts);
    const pdf = createExportFile(big, 'pdf', opts);
    expect(xlsx.bytes.length).toBeGreaterThan(1000);
    const pdfText = Array.from(pdf.bytes, (b) => String.fromCharCode(b)).join('');
    expect(Number(/\/Count (\d+)/.exec(pdfText)[1])).toBeGreaterThan(3);
  });
});

describe('pdf money formatting fallback', () => {
  it('negative: an invalid locale falls back to en-US formatting instead of throwing', () => {
    const sel = selectForExport([{ id: 'a', type: 'expense', amount: 123456, categoryId: 'cat_food', description: '', date: '2025-03-10', createdAt: 1 }], { startMonth: '2025-03', endMonth: '2025-03' });
    const doc = buildPdfDocument(sel, { categories: DEFAULT_CATEGORIES, currency: 'USD', locale: 'not a locale!!' });
    expect(doc.sections[1].rows[0][3]).toBe('1,234.56');
  });
});
