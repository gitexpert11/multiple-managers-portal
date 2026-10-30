import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExportDialog } from '../src/ui/exportDialog.js';

const NOW = new Date(2025, 2, 15); // 15 March 2025
const TODAY = '2025-03-15';
const task = (over) => ({ id: 'x', name: 'Task', description: '', endDate: '2025-03-10', category: 'office', completed: false, completedAt: null, createdAt: 1, updatedAt: 1, ...over });
const tasks = [
  task({ id: 'a', name: 'Ancient', endDate: '2023-06-05', completed: true, completedAt: 2 }),
  task({ id: 'b', name: 'Feb report', endDate: '2025-02-20' }),
  task({ id: 'c', name: 'Dentist', endDate: '2025-03-05', completed: true, completedAt: 3 }),
  task({ id: 'd', name: 'Fix tap', endDate: '2025-03-12' }),
  task({ id: 'e', name: 'Book flights', endDate: '2025-03-28' }),
  task({ id: 'f', name: 'Far future', endDate: '2028-01-10' }),
];
const base = { tasks, selectedMonth: '2025-03', today: TODAY };

let host;
let onDownload;
let onError;
let dlg;

const q = (sel) => {
  const el = host.querySelector(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el;
};
const setSelect = (sel, value) => {
  const el = q(sel);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const choose = (id) => {
  const el = q(`#${id}`);
  el.checked = true;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const preview = () => q('[data-testid=todo-export-preview]').textContent;
const error = () => q('#todo-export-error').textContent;
const download = () => q('[data-testid=todo-export-download]');
const submit = () => q('form.todo-export-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const yearOptions = (id) => [...q(`#${id}`).options].map((o) => Number(o.value));

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  onDownload = vi.fn();
  onError = vi.fn();
  dlg = createExportDialog(host, { onDownload, onError, now: () => NOW });
  dlg.update(base);
});

afterEach(() => host.remove());

describe('opening and defaults', () => {
  it('renders closed with the expected controls', () => {
    const dialog = q('[data-testid=todo-export-dialog]');
    expect(dialog.open).toBe(false);
    expect(dialog.getAttribute('aria-labelledby')).toBe('todo-export-title');
    expect(q('#todo-export-title').textContent).toBe('Export tasks');
    expect([...host.querySelectorAll('[data-preset]')].map((b) => b.dataset.preset)).toEqual(['this-month', 'around-now', 'this-year', 'all']);
    expect([...host.querySelectorAll('input[name=todo-export-scope]')].map((i) => i.value)).toEqual(['all', 'open', 'completed']);
    expect([...host.querySelectorAll('input[name=todo-export-format]')].map((i) => i.value)).toEqual(['xlsx', 'pdf']);
    expect(q('#todo-export-start-month').getAttribute('aria-label')).toBe('Start month: month');
    expect(q('#todo-export-end-year').getAttribute('aria-label')).toBe('End month: year');
  });

  it('opens on the dashboard month with "all tasks" + Excel selected and a live preview', () => {
    dlg.open();
    expect(q('[data-testid=todo-export-dialog]').open).toBe(true);
    expect(dlg.getState()).toEqual({ startMonth: '2025-03', endMonth: '2025-03', scope: 'all', format: 'xlsx' });
    expect(preview()).toBe('3 tasks · 2 open · 1 overdue · 1 completed');
    expect(download().disabled).toBe(false);
    expect(error()).toBe('');
  });

  it('offers years spanning two years around today plus every year that has a task', () => {
    const years = yearOptions('todo-export-start-year');
    expect(years[0]).toBe(2023);
    expect(years.at(-1)).toBe(2028);
    expect(years).toContain(2027);
    expect(yearOptions('todo-export-end-year')).toEqual(years);
  });

  it('re-opens on the new dashboard month after update()', () => {
    dlg.update({ selectedMonth: '2025-02' });
    dlg.open();
    expect(dlg.getState().startMonth).toBe('2025-02');
    expect(preview()).toBe('1 task · 1 open · 1 overdue · 0 completed');
  });
});

describe('range selection', () => {
  beforeEach(() => dlg.open());

  it('updates the preview when the month/year selects change', () => {
    setSelect('#todo-export-start-month', '2');
    expect(dlg.getState().startMonth).toBe('2025-02');
    expect(preview()).toBe('4 tasks · 3 open · 2 overdue · 1 completed');
    setSelect('#todo-export-start-year', '2023');
    setSelect('#todo-export-start-month', '1');
    expect(preview()).toBe('5 tasks · 3 open · 2 overdue · 2 completed');
  });

  it('allows future months — tasks are due in the future', () => {
    setSelect('#todo-export-end-year', '2028');
    setSelect('#todo-export-end-month', '12');
    expect(error()).toBe('');
    expect(preview()).toBe('4 tasks · 3 open · 1 overdue · 1 completed');
    expect(download().disabled).toBe(false);
  });

  it('blocks an end month before the start month', () => {
    setSelect('#todo-export-end-month', '2');
    expect(error()).toMatch(/after the start/);
    expect(preview()).toBe('');
    expect(download().disabled).toBe(true);
    submit();
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('disables download for an empty range', () => {
    setSelect('#todo-export-start-year', '2026');
    setSelect('#todo-export-end-year', '2026');
    expect(preview()).toBe('No tasks in this range.');
    expect(download().disabled).toBe(true);
  });

  it('applies the quick-range presets', () => {
    q('[data-preset=around-now]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2025-02', endMonth: '2025-04' });
    q('[data-preset=this-year]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2025-01', endMonth: '2025-12' });
    q('[data-preset=all]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2023-06', endMonth: '2028-01' });
    expect(preview()).toBe('6 tasks · 4 open · 2 overdue · 2 completed');
    q('[data-preset=this-month]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2025-03', endMonth: '2025-03' });
  });

  it('"All tasks" falls back to the selected month when there are no tasks', () => {
    dlg.update({ tasks: [] });
    q('[data-preset=all]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2025-03', endMonth: '2025-03' });
    expect(preview()).toBe('No tasks in this range.');
  });
});

describe('scope and format', () => {
  beforeEach(() => dlg.open());

  it('narrows the preview to open or completed tasks', () => {
    choose('todo-export-scope-open');
    expect(dlg.getState().scope).toBe('open');
    expect(preview()).toBe('2 tasks · 2 open · 1 overdue');
    choose('todo-export-scope-completed');
    expect(preview()).toBe('1 task · 1 completed');
  });

  it('downloads an Excel file by default and a PDF when chosen', () => {
    submit();
    expect(onDownload).toHaveBeenCalledTimes(1);
    let [file, meta] = onDownload.mock.calls[0];
    expect(file.filename).toBe('todo-manager_2025-03_all.xlsx');
    expect(file.mime).toContain('spreadsheetml');
    expect(file.bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(meta.format).toBe('xlsx');
    expect(meta.selection.totals.count).toBe(3);
    expect(q('[data-testid=todo-export-dialog]').open).toBe(false); // closes after download

    dlg.open();
    choose('todo-export-format-pdf');
    choose('todo-export-scope-open');
    setSelect('#todo-export-start-month', '2');
    submit();
    [file, meta] = onDownload.mock.calls[1];
    expect(file.filename).toBe('todo-manager_2025-02_to_2025-03_open.pdf');
    expect(file.mime).toBe('application/pdf');
    expect(String.fromCharCode(...file.bytes.slice(0, 8))).toBe('%PDF-1.4');
    expect(meta.selection.tasks.map((t) => t.name)).toEqual(['Feb report', 'Fix tap', 'Book flights']);
  });

  it('reports a failure through onError and keeps the dialog open', () => {
    // Force a failure inside file creation by smuggling an unknown format through the radio.
    q('#todo-export-format-xlsx').value = 'csv';
    choose('todo-export-format-xlsx');
    submit();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(error()).toMatch(/format/);
    expect(q('[data-testid=todo-export-dialog]').open).toBe(true);
    expect(onDownload).not.toHaveBeenCalled();
  });
});

describe('closing', () => {
  it('closes via Cancel, the X button and a backdrop click', () => {
    const dialog = q('[data-testid=todo-export-dialog]');
    dlg.open();
    q('.todo-dialog__actions .todo-btn--ghost').click();
    expect(dialog.open).toBe(false);
    dlg.open();
    q('[aria-label="Close export"]').click();
    expect(dialog.open).toBe(false);
    dlg.open();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog.open).toBe(false);
  });
});

describe('edge cases', () => {
  it('edge: open() before any update() defaults to the current month instead of producing NaN years', () => {
    const host2 = document.createElement('div');
    document.body.append(host2);
    const fresh = createExportDialog(host2, { onDownload, onError, now: () => NOW });
    fresh.open();
    expect(fresh.getState()).toMatchObject({ startMonth: '2025-03', endMonth: '2025-03' });
    expect([...host2.querySelectorAll('#todo-export-start-year option')].map((o) => o.value)).not.toContain('NaN');
    host2.remove();
  });

  it('edge: a preset pointing at a year outside the current list adds that year rather than failing', () => {
    dlg.update({ tasks: [task({ id: 'z', endDate: '2031-05-01' })] });
    dlg.open();
    q('[data-preset=all]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2031-05', endMonth: '2031-05' });
    dlg.update({ tasks: [] }); // year list shrinks again; the field keeps a valid value
    expect(q('#todo-export-start-year').value).not.toBe('');
  });

  it('edge: falls back to the open attribute when showModal is unavailable', () => {
    const dialog = q('[data-testid=todo-export-dialog]');
    const original = dialog.showModal;
    dialog.showModal = undefined;
    try {
      dlg.open();
      expect(dialog.hasAttribute('open')).toBe(true);
    } finally {
      dialog.showModal = original;
    }
  });
});
