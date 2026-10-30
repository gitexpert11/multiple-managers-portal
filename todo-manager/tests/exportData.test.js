import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import {
  buildExportFilename,
  buildPdfDocument,
  buildWorkbook,
  createExportFile,
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  monthsInRange,
  rangeLabel,
  selectForExport,
  statusLabel,
  taskStatus,
  validateExportRange,
} from '../src/lib/export/exportData.js';
import { generateMockTasks } from '../src/data/mockData.js';
import { PDF_MIME } from '../src/lib/export/pdf.js';
import { XLSX_MIME } from '../src/lib/export/xlsx.js';

const TODAY = '2025-03-15';
const DAY = 86_400_000;
const task = (over) => ({ id: 'x', name: 'Task', description: '', endDate: '2025-03-10', category: 'office', completed: false, completedAt: null, createdAt: Date.UTC(2025, 2, 1), updatedAt: 1, ...over });

const tasks = [
  task({ id: 'old', name: 'Old done', endDate: '2024-12-20', completed: true, completedAt: Date.UTC(2024, 11, 19) }),
  task({ id: 'feb-overdue', name: 'Feb report', endDate: '2025-02-20', category: 'office', description: 'Still pending' }),
  task({ id: 'mar-done', name: 'Dentist', endDate: '2025-03-05', category: 'personal', completed: true, completedAt: Date.UTC(2025, 2, 4) }),
  task({ id: 'mar-overdue', name: 'Fix tap', endDate: '2025-03-12', category: 'home' }),
  task({ id: 'mar-today', name: 'Call Mum', endDate: '2025-03-15', category: 'personal', createdAt: Date.UTC(2025, 2, 10) }),
  task({ id: 'mar-today-2', name: 'Submit timesheet', endDate: '2025-03-15', category: 'office', createdAt: Date.UTC(2025, 2, 2) }),
  task({ id: 'mar-up', name: 'Book flights', endDate: '2025-03-28', category: 'travel', description: 'Compare fares' }),
  task({ id: 'apr', name: 'Visa', endDate: '2025-04-02', category: 'travel' }),
];

const unzip = (bytes) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));
const toLatin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('validateExportRange / monthsInRange / labels', () => {
  it('accepts ordered ranges, including future months, and rejects bad ones', () => {
    expect(validateExportRange({ startMonth: '2025-03', endMonth: '2025-03' })).toBeNull();
    expect(validateExportRange({ startMonth: '2025-03', endMonth: '2027-12' })).toBeNull(); // future is fine for tasks
    expect(validateExportRange({ startMonth: '2025-04', endMonth: '2025-03' })).toMatch(/after the start/);
    expect(validateExportRange({ startMonth: '', endMonth: '2025-03' })).toMatch(/choose/i);
    expect(validateExportRange({ startMonth: '2025-13', endMonth: '2025-03' })).toMatch(/choose/i);
  });

  it('lists months inclusively across year boundaries', () => {
    expect(monthsInRange('2025-03', '2025-03')).toEqual(['2025-03']);
    expect(monthsInRange('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
  });

  it('labels ranges and statuses', () => {
    expect(rangeLabel('2025-03', '2025-03')).toBe('March 2025');
    expect(rangeLabel('2025-01', '2025-03')).toBe('January 2025 – March 2025');
    expect(statusLabel('completed')).toBe('Completed');
    expect(statusLabel('overdue')).toBe('Overdue');
    expect(statusLabel('today')).toBe('Due today');
    expect(statusLabel('upcoming')).toBe('Open');
    expect(EXPORT_SCOPES).toEqual(['all', 'open', 'completed']);
    expect(EXPORT_FORMATS).toEqual(['xlsx', 'pdf']);
  });

  it('computes task status relative to a given day', () => {
    expect(taskStatus(task({ completed: true, endDate: '2025-01-01' }), TODAY)).toBe('completed');
    expect(taskStatus(task({ endDate: '2025-03-01' }), TODAY)).toBe('overdue');
    expect(taskStatus(task({ endDate: '2025-03-15' }), TODAY)).toBe('today');
    expect(taskStatus(task({ endDate: '2025-03-16' }), TODAY)).toBe('upcoming');
  });
});

describe('selectForExport', () => {
  it('picks tasks due in the range, sorted by end date then creation, with a status each', () => {
    const sel = selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-03', today: TODAY });
    expect(sel.tasks.map((t) => t.id)).toEqual(['mar-done', 'mar-overdue', 'mar-today-2', 'mar-today', 'mar-up']);
    expect(sel.tasks.map((t) => t.status)).toEqual(['completed', 'overdue', 'today', 'today', 'upcoming']);
    expect(sel.months).toEqual([{ month: '2025-03', count: 5, open: 4, completed: 1, overdue: 1 }]);
    expect(sel.totals).toEqual({ count: 5, open: 4, completed: 1, overdue: 1 });
    expect(sel).toMatchObject({ startMonth: '2025-03', endMonth: '2025-03', scope: 'all', today: TODAY });
  });

  it('summarises every month of the range, including empty ones', () => {
    const sel = selectForExport(tasks, { startMonth: '2025-01', endMonth: '2025-04', today: TODAY });
    expect(sel.months.map((m) => [m.month, m.count, m.open, m.overdue, m.completed])).toEqual([
      ['2025-01', 0, 0, 0, 0],
      ['2025-02', 1, 1, 1, 0],
      ['2025-03', 5, 4, 1, 1],
      ['2025-04', 1, 1, 0, 0],
    ]);
    expect(sel.totals).toEqual({ count: 7, open: 6, overdue: 2, completed: 1 });
    expect(sel.tasks.some((t) => t.id === 'old')).toBe(false);
  });

  it('scopes to open or completed tasks only', () => {
    const open = selectForExport(tasks, { startMonth: '2025-02', endMonth: '2025-04', scope: 'open', today: TODAY });
    expect(open.tasks.every((t) => !t.completed)).toBe(true);
    expect(open.totals).toEqual({ count: 6, open: 6, overdue: 2, completed: 0 });
    const done = selectForExport(tasks, { startMonth: '2024-12', endMonth: '2025-04', scope: 'completed', today: TODAY });
    expect(done.tasks.map((t) => t.id)).toEqual(['old', 'mar-done']);
    expect(done.totals).toEqual({ count: 2, open: 0, overdue: 0, completed: 2 });
  });

  it('status follows the "today" passed in (a report made later shows more overdue)', () => {
    const later = selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-04', today: '2025-05-01' });
    expect(later.totals.overdue).toBe(5);
    expect(later.tasks.find((t) => t.id === 'apr').status).toBe('overdue');
  });

  it('rejects invalid ranges and scopes', () => {
    expect(() => selectForExport(tasks, { startMonth: '2025-04', endMonth: '2025-03', today: TODAY })).toThrow(/after the start/);
    expect(() => selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-03', scope: 'urgent', today: TODAY })).toThrow(/scope/);
  });

  it('does not mutate the input tasks', () => {
    const before = JSON.stringify(tasks);
    selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-03', today: TODAY });
    expect(JSON.stringify(tasks)).toBe(before);
    expect('status' in tasks[2]).toBe(false);
  });
});

describe('buildExportFilename', () => {
  it('encodes range, scope and format', () => {
    expect(buildExportFilename({ startMonth: '2025-03', endMonth: '2025-03', scope: 'all', format: 'xlsx' })).toBe('todo-manager_2025-03_all.xlsx');
    expect(buildExportFilename({ startMonth: '2025-01', endMonth: '2025-03', scope: 'open', format: 'pdf' })).toBe('todo-manager_2025-01_to_2025-03_open.pdf');
  });
});

describe('buildWorkbook', () => {
  const sel = selectForExport(tasks, { startMonth: '2025-02', endMonth: '2025-03', today: TODAY });

  it('has a monthly Summary sheet and a Tasks sheet with every field', () => {
    const wb = buildWorkbook(sel);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Summary', 'All tasks']);

    const summary = wb.sheets[0];
    expect(summary.columns.map((c) => c.header)).toEqual(['Month', 'Tasks', 'Open', 'Overdue', 'Completed', 'Completion %']);
    expect(summary.rows[0]).toEqual(['February 2025', { type: 'number', value: 1 }, { type: 'number', value: 1 }, { type: 'number', value: 1 }, { type: 'number', value: 0 }, { type: 'number', value: 0 }]);
    expect(summary.rows[1][0]).toBe('March 2025');
    expect(summary.rows[1][5]).toEqual({ type: 'number', value: 20 }); // 1 of 5 done
    expect(summary.totals[0]).toBe('Total');
    expect(summary.totals[1]).toEqual({ type: 'number', value: 6 });

    const sheet = wb.sheets[1];
    expect(sheet.columns.map((c) => c.header)).toEqual(['End date', 'Task', 'Description', 'Category', 'Status', 'Completed on', 'Created on']);
    expect(sheet.rows).toHaveLength(6);
    expect(sheet.rows[0]).toEqual([{ type: 'date', value: '2025-02-20' }, 'Feb report', 'Still pending', 'Office', 'Overdue', '', { type: 'date', value: '2025-03-01' }]);
    const done = sheet.rows.find((r) => r[1] === 'Dentist');
    expect(done[4]).toBe('Completed');
    expect(done[5]).toEqual({ type: 'date', value: '2025-03-04' });
    expect(sheet.rows.find((r) => r[1] === 'Call Mum')[4]).toBe('Due today');
    expect(sheet.totals[1]).toBe('6 tasks');
    expect(sheet.totals[4]).toBe('5 open · 1 done');
  });

  it('drops columns that cannot apply to a scoped export', () => {
    const open = buildWorkbook(selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-03', scope: 'open', today: TODAY }));
    expect(open.sheets[0].columns.map((c) => c.header)).toEqual(['Month', 'Tasks', 'Open', 'Overdue']);
    expect(open.sheets[1].name).toBe('Open tasks');
    expect(open.sheets[1].columns.map((c) => c.header)).toEqual(['End date', 'Task', 'Description', 'Category', 'Status', 'Created on']); // no "Completed on"
    expect(open.sheets[1].rows[0]).toHaveLength(6);
    expect(open.sheets[1].totals).toHaveLength(6);
    expect(open.sheets[1].totals[4]).toBe('1 overdue');
    const done = buildWorkbook(selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-03', scope: 'completed', today: TODAY }));
    expect(done.sheets[0].columns.map((c) => c.header)).toEqual(['Month', 'Tasks', 'Completed']);
    expect(done.sheets[1].totals[4]).toBe('1 completed');
  });
});

describe('buildPdfDocument', () => {
  it('describes the report with a summary and a tasks section', () => {
    const sel = selectForExport(tasks, { startMonth: '2025-02', endMonth: '2025-03', today: TODAY });
    const doc = buildPdfDocument(sel, { generatedAt: new Date(Date.UTC(2025, 2, 15, 12)) });
    expect(doc.title).toBe('Todo Manager report');
    expect(doc.subtitle).toBe('February 2025 – March 2025 · All tasks');
    expect(doc.metaLines[0]).toBe('Generated 2025-03-15 · status as of 2025-03-15 · 6 tasks');
    expect(doc.sections.map((s) => s.heading)).toEqual(['Monthly summary', 'All tasks']);
    expect(doc.sections[0].columns.map((c) => c.label)).toEqual(['Month', 'Tasks', 'Open', 'Overdue', 'Completed', 'Completion']);
    expect(doc.sections[0].rows[1]).toEqual(['March 2025', '5', '4', '1', '1', '20%']);
    expect(doc.sections[0].totals).toEqual(['Total', '6', '5', '2', '1', '17%']);
    expect(doc.sections[1].columns.map((c) => c.label)).toEqual(['End date', 'Task', 'Description', 'Category', 'Status', 'Completed on']);
    expect(doc.sections[1].rows[0]).toEqual(['2025-02-20', 'Feb report', 'Still pending', 'Office', 'Overdue', '']);
    expect(doc.sections[1].rows.find((r) => r[1] === 'Dentist')).toEqual(['2025-03-05', 'Dentist', '', 'Personal', 'Completed', '2025-03-04']);
    expect(doc.sections[1].emptyText).toBe('No tasks in this range');
    const openDoc = buildPdfDocument(selectForExport(tasks, { startMonth: '2025-03', endMonth: '2025-03', scope: 'open', today: TODAY }));
    expect(openDoc.sections[1].emptyText).toBe('No open tasks in this range');
    expect(openDoc.sections[1].columns.map((c) => c.label)).toEqual(['End date', 'Task', 'Description', 'Category', 'Status']); // no "Completed on"
    expect(openDoc.sections[1].rows[0]).toHaveLength(5);
    expect(openDoc.sections[1].totals).toHaveLength(5);
    expect(doc.footerText).toBe('Todo Manager');
  });
});

describe('createExportFile', () => {
  const sel = selectForExport(tasks, { startMonth: '2025-02', endMonth: '2025-03', today: TODAY });

  it('builds a real .xlsx with the summary and task rows', () => {
    const file = createExportFile(sel, 'xlsx');
    expect(file.mime).toBe(XLSX_MIME);
    expect(file.filename).toBe('todo-manager_2025-02_to_2025-03_all.xlsx');
    expect(file.bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b])); // "PK"
    const files = unzip(file.bytes);
    expect(files['xl/workbook.xml']).toContain('name="Summary"');
    expect(files['xl/workbook.xml']).toContain('name="All tasks"');
    expect(files['xl/worksheets/sheet2.xml']).toContain('Feb report');
    expect(files['xl/worksheets/sheet2.xml']).toContain('Still pending');
    expect(files['xl/worksheets/sheet2.xml']).toContain('Overdue');
    expect(files['xl/worksheets/sheet2.xml']).toContain('Due today');
  });

  it('builds a real PDF with title, summary and rows', () => {
    const file = createExportFile(sel, 'pdf', { generatedAt: new Date(Date.UTC(2025, 2, 15)) });
    expect(file.mime).toBe(PDF_MIME);
    expect(file.filename).toBe('todo-manager_2025-02_to_2025-03_all.pdf');
    const pdf = toLatin1(file.bytes);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    for (const s of ['Todo Manager report', 'Monthly summary', 'All tasks', 'Feb report', 'Book flights', 'Compare fares', 'Travel', 'Overdue', 'Completed', 'Page 1 of 1']) {
      expect(pdf, s).toContain(`(${s}) Tj`);
    }
  });

  it('handles the sample data set and an empty range', () => {
    const now = new Date(2025, 2, 15);
    const mock = generateMockTasks({ now });
    const all = selectForExport(mock, { startMonth: '2025-02', endMonth: '2025-04', today: TODAY });
    expect(all.totals.count).toBe(mock.length);
    expect(() => createExportFile(all, 'xlsx')).not.toThrow();
    expect(() => createExportFile(all, 'pdf')).not.toThrow();

    const empty = selectForExport(mock, { startMonth: '2030-01', endMonth: '2030-01', today: TODAY });
    expect(empty.totals.count).toBe(0);
    expect(toLatin1(createExportFile(empty, 'pdf').bytes)).toContain('(No tasks in this range) Tj');
  });

  it('rejects unknown formats', () => {
    expect(() => createExportFile(sel, 'csv')).toThrow(/format/);
  });
});

describe('remaining edge cases', () => {
  it('edge: a range across a year boundary is labelled and named correctly', () => {
    const sel = selectForExport(tasks, { startMonth: '2024-12', endMonth: '2025-01', today: TODAY });
    expect(sel.months.map((m) => m.month)).toEqual(['2024-12', '2025-01']);
    expect(rangeLabel(sel.startMonth, sel.endMonth)).toBe('December 2024 – January 2025');
    expect(createExportFile(sel, 'pdf').filename).toBe('todo-manager_2024-12_to_2025-01_all.pdf');
    expect(sel.totals).toEqual({ count: 1, open: 0, overdue: 0, completed: 1 });
  });

  it('negative: unknown statuses and non-finite timestamps degrade gracefully in the sheets', () => {
    expect(statusLabel('weird')).toBe('Open');
    const sel = selectForExport([task({ id: 'q', completed: true, completedAt: undefined, createdAt: NaN })], { startMonth: '2025-03', endMonth: '2025-03', today: TODAY });
    const row = buildWorkbook(sel).sheets[1].rows[0];
    expect(row[5]).toBe(''); // no completed-on date
    expect(row[6]).toBe(''); // no created-on date
    expect(buildPdfDocument(sel).sections[1].rows[0][5]).toBe('');
  });

  it('edge: selectForExport defaults "today" to the real date when none is given', () => {
    const sel = selectForExport([task({ id: 'far', endDate: '2099-01-01' })], { startMonth: '2099-01', endMonth: '2099-01' });
    expect(sel.tasks[0].status).toBe('upcoming');
    expect(sel.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
