import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/data/defaultCategories.js';
import { createExportDialog } from '../src/ui/exportDialog.js';

const tx = (over) => ({ id: 'x', type: 'expense', amount: 1000, categoryId: 'cat_food', description: '', date: '2025-03-10', createdAt: 1, ...over });
const transactions = [
  tx({ id: 'a', date: '2023-06-05', amount: 700, description: 'old' }),
  tx({ id: 'b', date: '2025-01-10', type: 'income', categoryId: 'cat_salary', amount: 300000 }),
  tx({ id: 'c', date: '2025-02-10', amount: 2500 }),
  tx({ id: 'd', date: '2025-03-01', type: 'income', categoryId: 'cat_salary', amount: 300000 }),
  tx({ id: 'e', date: '2025-03-12', amount: 1250 }),
];
const base = {
  transactions,
  categories: DEFAULT_CATEGORIES,
  preferences: { currency: 'USD', locale: 'en-US' },
  selectedMonth: '2025-03',
  maxMonth: '2025-03',
};

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
const preview = () => q('[data-testid=export-preview]').textContent;
const error = () => q('#export-error').textContent;
const download = () => q('[data-testid=export-download]');
const submit = () => q('form.export-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  onDownload = vi.fn();
  onError = vi.fn();
  dlg = createExportDialog(host, { onDownload, onError });
  dlg.update(base);
});

afterEach(() => host.remove());

describe('export dialog: opening and defaults', () => {
  it('renders closed with the expected controls', () => {
    const dialog = q('[data-testid=export-dialog]');
    expect(dialog.open).toBe(false);
    expect(dialog.getAttribute('aria-labelledby')).toBe('export-title');
    expect(q('#export-title').textContent).toBe('Export data');
    expect([...host.querySelectorAll('[data-preset]')].map((b) => b.dataset.preset)).toEqual(['this-month', 'last-3', 'last-12', 'all']);
    expect([...host.querySelectorAll('input[name=export-type]')].map((i) => i.value)).toEqual(['both', 'expense', 'income']);
    expect([...host.querySelectorAll('input[name=export-format]')].map((i) => i.value)).toEqual(['xlsx', 'pdf']);
  });

  it('opens on the dashboard month with "both" + Excel selected and a live preview', () => {
    dlg.open();
    expect(q('[data-testid=export-dialog]').open).toBe(true);
    expect(dlg.getState()).toEqual({ startMonth: '2025-03', endMonth: '2025-03', types: 'both', format: 'xlsx' });
    expect(q('#export-start-month').value).toBe('3');
    expect(q('#export-start-year').value).toBe('2025');
    expect(preview()).toBe('2 transactions · income $3,000.00 · expenses $12.50');
    expect(download().disabled).toBe(false);
    expect(error()).toBe('');
  });

  it('year selects span from the earliest data year to the current year only', () => {
    dlg.open();
    const years = [...q('#export-start-year').options].map((o) => Number(o.value));
    expect(years[0]).toBeLessThanOrEqual(2015); // at least ten years back
    expect(years).toContain(2023);
    expect(years.at(-1)).toBe(2025);
  });

  it('disables months after the current month in the current year', () => {
    dlg.open();
    const disabled = [...q('#export-end-month').options].filter((o) => o.disabled).map((o) => o.value);
    expect(disabled).toEqual(['4', '5', '6', '7', '8', '9', '10', '11', '12']);
    setSelect('#export-end-year', '2024');
    expect([...q('#export-end-month').options].some((o) => o.disabled)).toBe(false);
  });

  it('re-opening resets the range to the dashboard month but keeps type and format', () => {
    dlg.open();
    choose('export-type-income');
    choose('export-format-pdf');
    q('[data-preset=last-12]').click();
    q('[data-testid=export-dialog]').close();
    dlg.update({ ...base, selectedMonth: '2025-02' });
    dlg.open();
    expect(dlg.getState()).toEqual({ startMonth: '2025-02', endMonth: '2025-02', types: 'income', format: 'pdf' });
  });

  it('closes via the close button, Cancel, and backdrop click', () => {
    const dialog = q('[data-testid=export-dialog]');
    dlg.open();
    q('[aria-label="Close export"]').click();
    expect(dialog.open).toBe(false);
    dlg.open();
    [...host.querySelectorAll('.export-form .btn--ghost')].find((b) => b.textContent === 'Cancel').click();
    expect(dialog.open).toBe(false);
    dlg.open();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog.open).toBe(false);
  });
});

describe('export dialog: range selection', () => {
  beforeEach(() => dlg.open());

  it('applies the quick-range presets, clamped to the current month', () => {
    q('[data-preset=last-3]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2025-01', endMonth: '2025-03' });
    expect(preview()).toBe('4 transactions · income $6,000.00 · expenses $37.50');

    q('[data-preset=last-12]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2024-04', endMonth: '2025-03' });

    q('[data-preset=all]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2023-06', endMonth: '2025-03' });
    expect(preview()).toBe('5 transactions · income $6,000.00 · expenses $44.50');

    q('[data-preset=this-month]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2025-03', endMonth: '2025-03' });
  });

  it('"All data" falls back to the current month when there are no transactions', () => {
    dlg.update({ ...base, transactions: [] });
    q('[data-preset=all]').click();
    expect(dlg.getState()).toMatchObject({ startMonth: '2025-03', endMonth: '2025-03' });
    expect(preview()).toBe('No transactions in this range.');
    expect(download().disabled).toBe(true);
  });

  it('updates the preview when the selects change', () => {
    setSelect('#export-start-month', '1');
    expect(dlg.getState().startMonth).toBe('2025-01');
    expect(preview()).toBe('4 transactions · income $6,000.00 · expenses $37.50');
    setSelect('#export-start-year', '2023');
    expect(preview()).toBe('5 transactions · income $6,000.00 · expenses $44.50');
  });

  it('shows an error and disables Download when end is before start', () => {
    setSelect('#export-end-year', '2024');
    expect(error()).toBe('End month must be the same as or after the start month.');
    expect(download().disabled).toBe(true);
    expect(preview()).toBe('');
    submit();
    expect(onDownload).not.toHaveBeenCalled();

    setSelect('#export-end-year', '2025');
    expect(error()).toBe('');
    expect(download().disabled).toBe(false);
  });

  it('snaps a future month back when switching the year to the current one', () => {
    setSelect('#export-start-year', '2024');
    setSelect('#export-start-month', '11');
    expect(dlg.getState().startMonth).toBe('2024-11');
    setSelect('#export-start-year', '2025'); // November 2025 is in the future
    expect(dlg.getState().startMonth).toBe('2025-03');
    expect(error()).toBe('');
  });

  it('shows "No transactions" and disables Download for an empty range', () => {
    setSelect('#export-start-year', '2024');
    setSelect('#export-end-year', '2024');
    expect(preview()).toBe('No transactions in this range.');
    expect(download().disabled).toBe(true);
  });
});

describe('export dialog: type and format', () => {
  beforeEach(() => {
    dlg.open();
    q('[data-preset=all]').click();
  });

  it('filters the preview by type', () => {
    choose('export-type-expense');
    expect(preview()).toBe('3 transactions · expenses $44.50');
    choose('export-type-income');
    expect(preview()).toBe('2 transactions · income $6,000.00');
    choose('export-type-both');
    expect(preview()).toBe('5 transactions · income $6,000.00 · expenses $44.50');
  });

  it('uses singular wording for one transaction', () => {
    q('[data-preset=this-month]').click();
    choose('export-type-income');
    expect(preview()).toBe('1 transaction · income $3,000.00');
  });

  it('disables Download when the chosen type has no rows in range', () => {
    setSelect('#export-start-year', '2023'); // June 2023 (month kept from "All data")
    setSelect('#export-end-year', '2023');
    setSelect('#export-end-month', '12'); // June–December 2023: one expense, no income
    choose('export-type-income');
    expect(preview()).toBe('No transactions in this range.');
    expect(download().disabled).toBe(true);
    choose('export-type-expense');
    expect(download().disabled).toBe(false);
  });

  it('formats the preview in the configured currency', () => {
    dlg.update({ ...base, preferences: { currency: 'EUR', locale: 'en-US' } });
    expect(preview()).toBe('5 transactions · income €6,000.00 · expenses €44.50');
  });
});

describe('export dialog: download', () => {
  beforeEach(() => dlg.open());

  it('builds an Excel file for the chosen range and closes', () => {
    q('[data-preset=last-3]').click();
    submit();
    expect(onDownload).toHaveBeenCalledTimes(1);
    const [file, meta] = onDownload.mock.calls[0];
    expect(file.filename).toBe('expense-tracker_2025-01_to_2025-03_all.xlsx');
    expect(file.mime).toContain('spreadsheetml');
    expect(file.bytes).toBeInstanceOf(Uint8Array);
    expect(file.bytes[0]).toBe(0x50); // "PK" zip signature
    expect(file.bytes[1]).toBe(0x4b);
    expect(meta.format).toBe('xlsx');
    expect(meta.selection.totals.count).toBe(4);
    expect(q('[data-testid=export-dialog]').open).toBe(false);
  });

  it('builds a PDF when that format is chosen', () => {
    choose('export-format-pdf');
    choose('export-type-expense');
    submit();
    const [file, meta] = onDownload.mock.calls[0];
    expect(file.filename).toBe('expense-tracker_2025-03_expenses.pdf');
    expect(file.mime).toBe('application/pdf');
    expect(String.fromCharCode(...file.bytes.slice(0, 5))).toBe('%PDF-');
    expect(meta.selection.types).toEqual(['expense']);
    expect(meta.selection.totals.count).toBe(1);
  });

  it('income-only export carries only income', () => {
    choose('export-type-income');
    submit();
    const [file, meta] = onDownload.mock.calls[0];
    expect(file.filename).toBe('expense-tracker_2025-03_income.xlsx');
    expect(meta.selection.byType.expense).toEqual([]);
    expect(meta.selection.byType.income.map((t) => t.id)).toEqual(['d']);
  });

  it('does nothing when Download is disabled (empty range)', () => {
    setSelect('#export-start-year', '2024');
    setSelect('#export-end-year', '2024');
    submit();
    expect(onDownload).not.toHaveBeenCalled();
    expect(q('[data-testid=export-dialog]').open).toBe(true);
  });

  it('reports a failure inline and via onError, keeping the dialog open', () => {
    onDownload.mockImplementation(() => {
      throw new Error('Disk full');
    });
    submit();
    expect(error()).toBe('Disk full');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(q('[data-testid=export-dialog]').open).toBe(true);
  });

  it('reflects data changes made while the dialog is open', () => {
    expect(preview()).toBe('2 transactions · income $3,000.00 · expenses $12.50');
    dlg.update({ ...base, transactions: [...transactions, tx({ id: 'f', date: '2025-03-20', amount: 100 })] });
    expect(preview()).toBe('3 transactions · income $3,000.00 · expenses $13.50');
  });
});

describe('edge cases', () => {
  it('edge: a dashboard month older than the offered year list adds that year rather than failing', () => {
    dlg.update({ ...base, transactions: [], selectedMonth: '2010-01' });
    dlg.open();
    expect(dlg.getState()).toMatchObject({ startMonth: '2010-01', endMonth: '2010-01' });
    expect([...q('#export-start-year').options].map((o) => o.value)).toContain('2010');
  });

  it('edge: falls back to the open attribute when showModal is unavailable', () => {
    const dialog = q('[data-testid=export-dialog]');
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
