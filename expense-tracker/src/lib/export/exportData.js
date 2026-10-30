import { isValidMonthKey, monthKeyOf, monthLabel, shiftMonth } from '../dates.js';
import { buildPdf, PDF_MIME } from './pdf.js';
import { buildXlsx, XLSX_MIME } from './xlsx.js';

/**
 * Export pipeline: pick transactions for a month range and type selection,
 * summarise them per month, and render to .xlsx or .pdf.
 */

export const EXPORT_TYPES = ['both', 'expense', 'income'];
export const EXPORT_FORMATS = ['xlsx', 'pdf'];

const TYPE_LABEL = { expense: 'Expenses', income: 'Income' };

/** @returns {string|null} a human-readable problem, or null when the range is usable */
export function validateExportRange({ startMonth, endMonth, maxMonth }) {
  if (!isValidMonthKey(startMonth) || !isValidMonthKey(endMonth)) return 'Choose a start and end month.';
  if (endMonth < startMonth) return 'End month must be the same as or after the start month.';
  if (maxMonth && startMonth > maxMonth) return 'Start month cannot be in the future.';
  if (maxMonth && endMonth > maxMonth) return 'End month cannot be in the future.';
  return null;
}

/** Expand a type choice ("both" | "expense" | "income") to concrete types. */
export function resolveTypes(choice) {
  if (choice === 'both') return ['expense', 'income'];
  if (choice === 'expense' || choice === 'income') return [choice];
  throw new Error('types must be "both", "expense" or "income"');
}

/** Every month key from start to end inclusive. */
export function monthsInRange(startMonth, endMonth) {
  const out = [];
  for (let m = startMonth; m <= endMonth; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/**
 * Select and summarise transactions for export.
 * @returns {{
 *   startMonth: string, endMonth: string, types: string[], typeChoice: string,
 *   transactions: object[], byType: {expense: object[], income: object[]},
 *   months: {month: string, income: number, expenses: number, net: number, count: number}[],
 *   totals: {income: number, expenses: number, net: number, count: number},
 * }}
 */
export function selectForExport(transactions, { startMonth, endMonth, types = 'both' }) {
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

  const months = monthsInRange(startMonth, endMonth).map((month) => ({ month, income: 0, expenses: 0, net: 0, count: 0 }));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const totals = { income: 0, expenses: 0, net: 0, count: 0 };
  for (const t of picked) {
    const m = byMonth.get(monthKeyOf(t.date));
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

export function buildExportFilename({ startMonth, endMonth, types, format }) {
  const scope = types === 'both' ? 'all' : types === 'expense' ? 'expenses' : 'income';
  const range = startMonth === endMonth ? startMonth : `${startMonth}_to_${endMonth}`;
  return `expense-tracker_${range}_${scope}.${format}`;
}

export function rangeLabel(startMonth, endMonth) {
  return startMonth === endMonth ? monthLabel(startMonth) : `${monthLabel(startMonth)} – ${monthLabel(endMonth)}`;
}

// ---------------------------------------------------------------------------

const categoryName = (categories, id) => categories.find((c) => c.id === id)?.name || 'Uncategorized';

/** Workbook spec for buildXlsx. Amounts are numbers (major units) so Excel can sum them. */
export function buildWorkbook(selection, { categories, currency }) {
  const money = (cents) => ({ type: 'number', value: cents / 100 });
  const amountHeader = `Amount (${currency})`;
  const sheets = [];

  const summaryColumns = [{ header: 'Month', width: 16 }];
  if (selection.types.includes('income')) summaryColumns.push({ header: `Income (${currency})`, width: 16 });
  if (selection.types.includes('expense')) summaryColumns.push({ header: `Expenses (${currency})`, width: 16 });
  if (selection.types.length === 2) summaryColumns.push({ header: `Net (${currency})`, width: 16 });
  summaryColumns.push({ header: 'Transactions', width: 14 });

  const summaryRow = (label, m) => {
    const row = [label];
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
export function buildPdfDocument(selection, { categories, currency, locale, generatedAt = new Date() }) {
  const fmt = pdfMoneyFormatter(currency, locale);
  const sections = [];

  const summaryColumns = [{ label: 'Month', width: 3 }];
  if (selection.types.includes('income')) summaryColumns.push({ label: 'Income', width: 2, align: 'right' });
  if (selection.types.includes('expense')) summaryColumns.push({ label: 'Expenses', width: 2, align: 'right' });
  if (selection.types.length === 2) summaryColumns.push({ label: 'Net', width: 2, align: 'right' });
  summaryColumns.push({ label: 'Transactions', width: 1.4, align: 'right' });
  const summaryRow = (label, m) => {
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

  const scope = selection.types.length === 2 ? 'Expenses & income' : TYPE_LABEL[selection.types[0]];
  return {
    title: 'Expense Tracker report',
    subtitle: `${rangeLabel(selection.startMonth, selection.endMonth)} · ${scope}`,
    metaLines: [`Currency: ${currency} · Generated ${generatedAt.toISOString().slice(0, 10)} · ${selection.totals.count} transactions`],
    sections,
    footerText: 'Expense Tracker',
  };
}

function pdfMoneyFormatter(currency, locale) {
  let nf;
  try {
    nf = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return (cents) => {
    const value = cents / 100;
    return `${value < 0 ? '-' : ''}${nf.format(Math.abs(value))}`;
  };
}

/**
 * Render the selection to a downloadable file.
 * @returns {{bytes: Uint8Array, mime: string, filename: string}}
 */
export function createExportFile(selection, format, opts) {
  const filename = buildExportFilename({ startMonth: selection.startMonth, endMonth: selection.endMonth, types: selection.typeChoice, format });
  if (format === 'xlsx') return { bytes: buildXlsx(buildWorkbook(selection, opts)), mime: XLSX_MIME, filename };
  if (format === 'pdf') return { bytes: buildPdf(buildPdfDocument(selection, opts)), mime: PDF_MIME, filename };
  throw new Error('format must be "xlsx" or "pdf"');
}
