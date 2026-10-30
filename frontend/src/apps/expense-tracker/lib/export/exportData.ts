import { buildPdf, PDF_MIME, type PdfColumn, type PdfDocument, type PdfSection } from '@shared/lib/export/pdf';
import { buildXlsx, XLSX_MIME, type XlsxCell, type XlsxColumn, type XlsxSheet, type XlsxWorkbook } from '@shared/lib/export/xlsx';
import type { Category, Transaction, TxType } from '../../types';
import { isValidMonthKey, monthKeyOf, monthLabel, shiftMonth } from '../dates';

/**
 * Export pipeline: pick transactions for a month range and type selection,
 * summarise them per month, and render to .xlsx or .pdf.
 */

export type ExportTypeChoice = 'both' | 'expense' | 'income';
export type ExportFormat = 'xlsx' | 'pdf';

export const EXPORT_TYPES: ExportTypeChoice[] = ['both', 'expense', 'income'];
export const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'pdf'];

const TYPE_LABEL: Record<TxType, string> = { expense: 'Expenses', income: 'Income' };

export interface MonthTotals {
  month: string;
  income: number;
  expenses: number;
  net: number;
  count: number;
}

export interface ExportSelection {
  startMonth: string;
  endMonth: string;
  types: TxType[];
  typeChoice: ExportTypeChoice;
  transactions: Transaction[];
  byType: Record<TxType, Transaction[]>;
  months: MonthTotals[];
  totals: Omit<MonthTotals, 'month'>;
}

/** @returns a human-readable problem, or null when the range is usable */
export function validateExportRange({ startMonth, endMonth, maxMonth }: { startMonth: string; endMonth: string; maxMonth?: string }): string | null {
  if (!isValidMonthKey(startMonth) || !isValidMonthKey(endMonth)) return 'Choose a start and end month.';
  if (endMonth < startMonth) return 'End month must be the same as or after the start month.';
  if (maxMonth && startMonth > maxMonth) return 'Start month cannot be in the future.';
  if (maxMonth && endMonth > maxMonth) return 'End month cannot be in the future.';
  return null;
}

/** Expand a type choice ("both" | "expense" | "income") to concrete types. */
export function resolveTypes(choice: string): TxType[] {
  if (choice === 'both') return ['expense', 'income'];
  if (choice === 'expense' || choice === 'income') return [choice];
  throw new Error('types must be "both", "expense" or "income"');
}

/** Every month key from start to end inclusive. */
export function monthsInRange(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  for (let m = startMonth; m <= endMonth; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/** Select and summarise transactions for export. */
export function selectForExport(transactions: Transaction[], { startMonth, endMonth, types = 'both' }: { startMonth: string; endMonth: string; types?: ExportTypeChoice }): ExportSelection {
  const problem = validateExportRange({ startMonth, endMonth });
  if (problem) throw new Error(problem);
  const wanted = resolveTypes(types);

  const picked = transactions
    .filter((t) => wanted.includes(t.type))
    .filter((t) => {
      const m = monthKeyOf(t.date);
      return m >= startMonth && m <= endMonth;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));

  const months: MonthTotals[] = monthsInRange(startMonth, endMonth).map((month) => ({ month, income: 0, expenses: 0, net: 0, count: 0 }));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const totals = { income: 0, expenses: 0, net: 0, count: 0 };
  for (const t of picked) {
    const m = byMonth.get(monthKeyOf(t.date)) as MonthTotals;
    if (t.type === 'income') {
      m.income += t.amount;
      totals.income += t.amount;
    } else {
      m.expenses += t.amount;
      totals.expenses += t.amount;
    }
    m.count += 1;
    totals.count += 1;
  }
  for (const m of months) m.net = m.income - m.expenses;
  totals.net = totals.income - totals.expenses;

  return {
    startMonth,
    endMonth,
    types: wanted,
    typeChoice: types,
    transactions: picked,
    byType: {
      expense: picked.filter((t) => t.type === 'expense'),
      income: picked.filter((t) => t.type === 'income'),
    },
    months,
    totals,
  };
}

export function buildExportFilename({ startMonth, endMonth, types, format }: { startMonth: string; endMonth: string; types: ExportTypeChoice; format: ExportFormat }): string {
  const scope = types === 'both' ? 'all' : types === 'expense' ? 'expenses' : 'income';
  const range = startMonth === endMonth ? startMonth : `${startMonth}_to_${endMonth}`;
  return `expense-tracker_${range}_${scope}.${format}`;
}

export function rangeLabel(startMonth: string, endMonth: string): string {
  return startMonth === endMonth ? monthLabel(startMonth) : `${monthLabel(startMonth)} – ${monthLabel(endMonth)}`;
}

// ---------------------------------------------------------------------------

const categoryName = (categories: Category[], id: string) => categories.find((c) => c.id === id)?.name || 'Uncategorized';

export interface ExportOptions {
  categories: Category[];
  currency: string;
  locale: string;
  generatedAt?: Date;
}

/** Workbook spec for buildXlsx. Amounts are numbers (major units) so Excel can sum them. */
export function buildWorkbook(selection: ExportSelection, { categories, currency }: Pick<ExportOptions, 'categories' | 'currency'>): XlsxWorkbook {
  const money = (cents: number): XlsxCell => ({ type: 'number', value: cents / 100 });
  const amountHeader = `Amount (${currency})`;
  const sheets: XlsxSheet[] = [];

  const summaryColumns: XlsxColumn[] = [{ header: 'Month', width: 16 }];
  if (selection.types.includes('income')) summaryColumns.push({ header: `Income (${currency})`, width: 16 });
  if (selection.types.includes('expense')) summaryColumns.push({ header: `Expenses (${currency})`, width: 16 });
  if (selection.types.length === 2) summaryColumns.push({ header: `Net (${currency})`, width: 16 });
  summaryColumns.push({ header: 'Transactions', width: 14 });

  const summaryRow = (label: string, m: Omit<MonthTotals, 'month'>): XlsxCell[] => {
    const row: XlsxCell[] = [label];
    if (selection.types.includes('income')) row.push(money(m.income));
    if (selection.types.includes('expense')) row.push(money(m.expenses));
    if (selection.types.length === 2) row.push(money(m.net));
    row.push({ type: 'number', value: m.count });
    return row;
  };
  sheets.push({
    name: 'Summary',
    columns: summaryColumns,
    rows: selection.months.map((m) => summaryRow(monthLabel(m.month), m)),
    totals: summaryRow('Total', selection.totals),
  });

  for (const type of selection.types) {
    const list = selection.byType[type];
    sheets.push({
      name: TYPE_LABEL[type],
      columns: [
        { header: 'Date', width: 12 },
        { header: 'Category', width: 20 },
        { header: 'Description', width: 40 },
        { header: amountHeader, width: 16 },
      ],
      rows: list.map((t) => [{ type: 'date', value: t.date }, categoryName(categories, t.categoryId), t.description || '', money(t.amount)]),
      totals: ['Total', '', `${list.length} ${list.length === 1 ? 'transaction' : 'transactions'}`, money(list.reduce((a, t) => a + t.amount, 0))],
    });
  }
  return { sheets };
}

/** Document spec for buildPdf. Currency is written as an ISO code to stay within WinAnsi. */
export function buildPdfDocument(selection: ExportSelection, { categories, currency, locale, generatedAt = new Date() }: ExportOptions): PdfDocument {
  const fmt = pdfMoneyFormatter(locale);
  const sections: PdfSection[] = [];

  const summaryColumns: PdfColumn[] = [{ label: 'Month', width: 3 }];
  if (selection.types.includes('income')) summaryColumns.push({ label: 'Income', width: 2, align: 'right' });
  if (selection.types.includes('expense')) summaryColumns.push({ label: 'Expenses', width: 2, align: 'right' });
  if (selection.types.length === 2) summaryColumns.push({ label: 'Net', width: 2, align: 'right' });
  summaryColumns.push({ label: 'Transactions', width: 1.4, align: 'right' });
  const summaryRow = (label: string, m: Omit<MonthTotals, 'month'>): string[] => {
    const row = [label];
    if (selection.types.includes('income')) row.push(fmt(m.income));
    if (selection.types.includes('expense')) row.push(fmt(m.expenses));
    if (selection.types.length === 2) row.push(fmt(m.net));
    row.push(String(m.count));
    return row;
  };
  sections.push({
    heading: 'Monthly summary',
    columns: summaryColumns,
    rows: selection.months.map((m) => summaryRow(monthLabel(m.month), m)),
    totals: summaryRow('Total', selection.totals),
  });

  for (const type of selection.types) {
    const list = selection.byType[type];
    sections.push({
      heading: TYPE_LABEL[type],
      columns: [
        { label: 'Date', width: 1.3 },
        { label: 'Category', width: 2.2 },
        { label: 'Description', width: 4.5 },
        { label: `Amount (${currency})`, width: 2, align: 'right' },
      ],
      rows: list.map((t) => [t.date, categoryName(categories, t.categoryId), t.description || '', fmt(t.amount)]),
      totals: ['Total', '', `${list.length} ${list.length === 1 ? 'transaction' : 'transactions'}`, fmt(list.reduce((a, t) => a + t.amount, 0))],
      emptyText: `No ${TYPE_LABEL[type].toLowerCase()} in this range`,
    });
  }

  const scope = selection.types.length === 2 ? 'Expenses & income' : TYPE_LABEL[selection.types[0] as TxType];
  return {
    title: 'Expense Tracker report',
    subtitle: `${rangeLabel(selection.startMonth, selection.endMonth)} · ${scope}`,
    metaLines: [`Currency: ${currency} · Generated ${generatedAt.toISOString().slice(0, 10)} · ${selection.totals.count} transactions`],
    sections,
    footerText: 'Expense Tracker',
  };
}

function pdfMoneyFormatter(locale: string) {
  let nf: Intl.NumberFormat;
  try {
    nf = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return (cents: number) => {
    const value = cents / 100;
    return `${value < 0 ? '-' : ''}${nf.format(Math.abs(value))}`;
  };
}

export interface ExportFile {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}

/** Render the selection to a downloadable file. */
export function createExportFile(selection: ExportSelection, format: ExportFormat, opts: ExportOptions): ExportFile {
  const filename = buildExportFilename({ startMonth: selection.startMonth, endMonth: selection.endMonth, types: selection.typeChoice, format });
  if (format === 'xlsx') return { bytes: buildXlsx(buildWorkbook(selection, opts)), mime: XLSX_MIME, filename };
  if (format === 'pdf') return { bytes: buildPdf(buildPdfDocument(selection, opts)), mime: PDF_MIME, filename };
  throw new Error('format must be "xlsx" or "pdf"');
}
