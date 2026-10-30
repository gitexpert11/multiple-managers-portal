import { buildPdf, PDF_MIME, type PdfColumn, type PdfDocument } from '@shared/lib/export/pdf';
import { buildXlsx, XLSX_MIME, type XlsxCell, type XlsxColumn, type XlsxWorkbook } from '@shared/lib/export/xlsx';
import { plural } from '@shared/lib/plural';
import { getCategory } from '../../data/categories';
import type { DueStatus, Task } from '../../types';
import { describeDue, isValidMonthKey, monthKeyOf, monthLabel, shiftMonth, todayKey } from '../dates';

/**
 * Export pipeline: pick tasks due in a month range (optionally only open or
 * only completed ones), summarise them per month, and render to .xlsx or .pdf.
 *
 * "Status" is computed relative to `today` at export time, so a report made
 * next week can show a task as overdue that was merely "open" today.
 */

export type ExportScope = 'all' | 'open' | 'completed';
export type ExportFormat = 'xlsx' | 'pdf';
export type TaskStatus = 'completed' | DueStatus;

export const EXPORT_SCOPES: ExportScope[] = ['all', 'open', 'completed'];
export const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'pdf'];

export const SCOPE_LABEL: Record<ExportScope, string> = { all: 'All tasks', open: 'Open tasks', completed: 'Completed tasks' };
const STATUS_LABEL: Record<TaskStatus, string> = { completed: 'Completed', overdue: 'Overdue', today: 'Due today', upcoming: 'Open' };

export interface MonthBucket {
  month: string;
  count: number;
  open: number;
  completed: number;
  overdue: number;
}

export type ExportedTask = Task & { status: TaskStatus };

export interface ExportSelection {
  startMonth: string;
  endMonth: string;
  scope: ExportScope;
  today: string;
  tasks: ExportedTask[];
  months: MonthBucket[];
  totals: Omit<MonthBucket, 'month'>;
}

/** @returns a human-readable problem, or null when the range is usable */
export function validateExportRange({ startMonth, endMonth }: { startMonth: string; endMonth: string }): string | null {
  if (!isValidMonthKey(startMonth) || !isValidMonthKey(endMonth)) return 'Choose a start and end month.';
  if (endMonth < startMonth) return 'End month must be the same as or after the start month.';
  return null;
}

/** Every month key from start to end inclusive. */
export function monthsInRange(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  for (let m = startMonth; m <= endMonth; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/** Status of a task as of `today`. */
export function taskStatus(task: Task, today: string): TaskStatus {
  return task.completed ? 'completed' : describeDue(task.endDate, today).status;
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status as TaskStatus] || 'Open';
}

export function selectForExport(tasks: Task[], { startMonth, endMonth, scope = 'all', today = todayKey() }: { startMonth: string; endMonth: string; scope?: ExportScope; today?: string }): ExportSelection {
  const problem = validateExportRange({ startMonth, endMonth });
  if (problem) throw new Error(problem);
  if (!EXPORT_SCOPES.includes(scope)) throw new Error('scope must be "all", "open" or "completed"');

  const picked: ExportedTask[] = tasks
    .filter((t) => {
      const m = monthKeyOf(t.endDate);
      return m >= startMonth && m <= endMonth;
    })
    .filter((t) => (scope === 'open' ? !t.completed : scope === 'completed' ? t.completed : true))
    .map((t) => ({ ...t, status: taskStatus(t, today) }))
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || (a.createdAt || 0) - (b.createdAt || 0));

  const months: MonthBucket[] = monthsInRange(startMonth, endMonth).map((month) => ({ month, count: 0, open: 0, completed: 0, overdue: 0 }));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const totals = { count: 0, open: 0, completed: 0, overdue: 0 };
  for (const t of picked) {
    const m = byMonth.get(monthKeyOf(t.endDate)) as MonthBucket;
    for (const bucket of [m, totals]) {
      bucket.count += 1;
      if (t.completed) bucket.completed += 1;
      else {
        bucket.open += 1;
        if (t.status === 'overdue') bucket.overdue += 1;
      }
    }
  }

  return { startMonth, endMonth, scope, today, tasks: picked, months, totals };
}

export function buildExportFilename({ startMonth, endMonth, scope, format }: { startMonth: string; endMonth: string; scope: ExportScope; format: ExportFormat }): string {
  const range = startMonth === endMonth ? startMonth : `${startMonth}_to_${endMonth}`;
  return `todo-manager_${range}_${scope}.${format}`;
}

export function rangeLabel(startMonth: string, endMonth: string): string {
  return startMonth === endMonth ? monthLabel(startMonth) : `${monthLabel(startMonth)} – ${monthLabel(endMonth)}`;
}

// ---------------------------------------------------------------------------

const categoryLabel = (id: string) => getCategory(id)?.label || 'Uncategorised';
const dayOf = (epochMs: number | null | undefined) => (Number.isFinite(epochMs) ? new Date(epochMs as number).toISOString().slice(0, 10) : '');
const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

/** Workbook spec for buildXlsx: a monthly Summary sheet plus a Tasks sheet with every field. */
export function buildWorkbook(selection: ExportSelection): XlsxWorkbook {
  const num = (n: number): XlsxCell => ({ type: 'number', value: n });
  const date = (d: string): XlsxCell => (d ? { type: 'date', value: d } : '');
  const showOpen = selection.scope !== 'completed';
  const showDone = selection.scope !== 'open';

  const summaryColumns: XlsxColumn[] = [
    { header: 'Month', width: 16 },
    { header: 'Tasks', width: 10 },
  ];
  if (showOpen) summaryColumns.push({ header: 'Open', width: 10 }, { header: 'Overdue', width: 10 });
  if (showDone) summaryColumns.push({ header: 'Completed', width: 12 });
  if (showOpen && showDone) summaryColumns.push({ header: 'Completion %', width: 14 });
  const summaryRow = (label: string, m: Omit<MonthBucket, 'month'>): XlsxCell[] => {
    const row: XlsxCell[] = [label, num(m.count)];
    if (showOpen) row.push(num(m.open), num(m.overdue));
    if (showDone) row.push(num(m.completed));
    if (showOpen && showDone) row.push(num(pct(m.completed, m.count)));
    return row;
  };

  return {
    sheets: [
      {
        name: 'Summary',
        columns: summaryColumns,
        rows: selection.months.map((m) => summaryRow(monthLabel(m.month), m)),
        totals: summaryRow('Total', selection.totals),
      },
      {
        name: SCOPE_LABEL[selection.scope],
        // "Completed on" is meaningless for an open-only export, so it is dropped there.
        columns: [
          { header: 'End date', width: 12 },
          { header: 'Task', width: 32 },
          { header: 'Description', width: 48 },
          { header: 'Category', width: 12 },
          { header: 'Status', width: 12 },
          ...(showDone ? [{ header: 'Completed on', width: 14 }] : []),
          { header: 'Created on', width: 14 },
        ],
        rows: selection.tasks.map((t) => [
          date(t.endDate),
          t.name,
          t.description || '',
          categoryLabel(t.category),
          statusLabel(t.status),
          ...(showDone ? [date(t.completed ? dayOf(t.completedAt) : '')] : []),
          date(dayOf(t.createdAt)),
        ]),
        totals: ['Total', plural(selection.tasks.length, 'task'), '', '', summaryTotalsText(selection), ...(showDone ? [''] : []), ''],
      },
    ],
  };
}

function summaryTotalsText(selection: ExportSelection): string {
  const t = selection.totals;
  if (selection.scope === 'open') return `${t.overdue} overdue`;
  if (selection.scope === 'completed') return `${t.completed} completed`;
  return `${t.open} open · ${t.completed} done`;
}

/** Document spec for buildPdf. */
export function buildPdfDocument(selection: ExportSelection, { generatedAt = new Date() }: { generatedAt?: Date } = {}): PdfDocument {
  const showOpen = selection.scope !== 'completed';
  const showDone = selection.scope !== 'open';

  const summaryColumns: PdfColumn[] = [
    { label: 'Month', width: 3 },
    { label: 'Tasks', width: 1.2, align: 'right' },
  ];
  if (showOpen) summaryColumns.push({ label: 'Open', width: 1.2, align: 'right' }, { label: 'Overdue', width: 1.2, align: 'right' });
  if (showDone) summaryColumns.push({ label: 'Completed', width: 1.4, align: 'right' });
  if (showOpen && showDone) summaryColumns.push({ label: 'Completion', width: 1.4, align: 'right' });
  const summaryRow = (label: string, m: Omit<MonthBucket, 'month'>): string[] => {
    const row = [label, String(m.count)];
    if (showOpen) row.push(String(m.open), String(m.overdue));
    if (showDone) row.push(String(m.completed));
    if (showOpen && showDone) row.push(`${pct(m.completed, m.count)}%`);
    return row;
  };

  return {
    title: 'Todo Manager report',
    subtitle: `${rangeLabel(selection.startMonth, selection.endMonth)} · ${SCOPE_LABEL[selection.scope]}`,
    metaLines: [`Generated ${generatedAt.toISOString().slice(0, 10)} · status as of ${selection.today} · ${plural(selection.totals.count, 'task')}`],
    sections: [
      {
        heading: 'Monthly summary',
        columns: summaryColumns,
        rows: selection.months.map((m) => summaryRow(monthLabel(m.month), m)),
        totals: summaryRow('Total', selection.totals),
      },
      {
        heading: SCOPE_LABEL[selection.scope],
        columns: [
          { label: 'End date', width: 1.3 },
          { label: 'Task', width: 3 },
          { label: 'Description', width: showDone ? 3.6 : 5 },
          { label: 'Category', width: 1.3 },
          { label: 'Status', width: 1.3 },
          ...(showDone ? [{ label: 'Completed on', width: 1.5 }] : []),
        ],
        rows: selection.tasks.map((t) => [t.endDate, t.name, t.description || '', categoryLabel(t.category), statusLabel(t.status), ...(showDone ? [t.completed ? dayOf(t.completedAt) : ''] : [])]),
        totals: ['Total', plural(selection.tasks.length, 'task'), '', '', summaryTotalsText(selection), ...(showDone ? [''] : [])],
        emptyText: `No ${selection.scope === 'all' ? 'tasks' : SCOPE_LABEL[selection.scope].toLowerCase()} in this range`,
      },
    ],
    footerText: 'Todo Manager',
  };
}

export interface ExportFile {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}

export function createExportFile(selection: ExportSelection, format: ExportFormat, opts: { generatedAt?: Date } = {}): ExportFile {
  const filename = buildExportFilename({ startMonth: selection.startMonth, endMonth: selection.endMonth, scope: selection.scope, format });
  if (format === 'xlsx') return { bytes: buildXlsx(buildWorkbook(selection)), mime: XLSX_MIME, filename };
  if (format === 'pdf') return { bytes: buildPdf(buildPdfDocument(selection, opts)), mime: PDF_MIME, filename };
  throw new Error('format must be "xlsx" or "pdf"');
}
