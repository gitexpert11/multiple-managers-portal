import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '@shared/ui/Dialog';
import { Icon } from '@shared/ui/Icon';
import { MONTH_NAMES, clampMonthKey, makeMonthKey, shiftMonth, splitMonthKey } from '../lib/dates';
import { createExportFile, selectForExport, validateExportRange, type ExportFile, type ExportFormat, type ExportSelection, type ExportTypeChoice } from '../lib/export/exportData';
import { formatMoney } from '../lib/money';
import type { Category, Preferences, Transaction } from '../types';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  transactions: Transaction[];
  categories: Category[];
  preferences: Preferences;
  selectedMonth: string;
  maxMonth: string;
  now: () => Date;
  onDownload: (file: ExportFile, info: { selection: ExportSelection; format: ExportFormat }) => void;
  onError?: (err: Error) => void;
}

/**
 * Export dialog: month range (with presets), data type, file format, a live
 * preview of what will be exported, and a Download button.
 */
export function ExportDialog({ open, onClose, ...rest }: ExportDialogProps) {
  // The form is mounted only while the dialog is open, so every opening starts
  // fresh from the month shown on the dashboard.
  return (
    <Dialog open={open} onClose={onClose} className="dialog" aria-labelledby="export-title" data-testid="export-dialog">
      {open && <ExportForm onClose={onClose} {...rest} />}
    </Dialog>
  );
}

function ExportForm({ onClose, transactions, categories, preferences, selectedMonth, maxMonth, now, onDownload, onError }: Omit<ExportDialogProps, 'open'>) {
  const [startMonth, setStartMonth] = useState(selectedMonth);
  const [endMonth, setEndMonth] = useState(selectedMonth);
  const [typeChoice, setTypeChoice] = useState<ExportTypeChoice>('both');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [submitError, setSubmitError] = useState('');

  const { minYear, maxYear } = useMemo(() => {
    const { year: maxY } = splitMonthKey(maxMonth);
    let earliest: string | null = null;
    for (const t of transactions) {
      const m = t.date.slice(0, 7);
      if (!earliest || m < earliest) earliest = m;
    }
    return { minYear: Math.min(maxY - 10, earliest ? splitMonthKey(earliest).year : maxY), maxYear: maxY };
  }, [transactions, maxMonth]);

  const presets = [
    { id: 'this-month', label: 'This month', range: () => [selectedMonth, selectedMonth] as const },
    { id: 'last-3', label: 'Last 3 months', range: () => [shiftMonth(maxMonth, -2), maxMonth] as const },
    { id: 'last-12', label: 'Last 12 months', range: () => [shiftMonth(maxMonth, -11), maxMonth] as const },
    { id: 'this-year', label: 'This year', range: () => [`${maxMonth.slice(0, 4)}-01`, maxMonth] as const },
  ];

  const problem = validateExportRange({ startMonth, endMonth, maxMonth });
  const selection = problem ? null : selectForExport(transactions, { startMonth, endMonth, types: typeChoice });
  const { currency, locale } = preferences;
  const money = (c: number) => formatMoney(c, { currency, locale });

  let preview = '';
  if (selection) {
    if (!selection.totals.count) preview = 'No transactions in this range.';
    else {
      const parts = [`${selection.totals.count} ${selection.totals.count === 1 ? 'transaction' : 'transactions'}`];
      if (selection.types.includes('income')) parts.push(`income ${money(selection.totals.income)}`);
      if (selection.types.includes('expense')) parts.push(`expenses ${money(selection.totals.expenses)}`);
      preview = parts.join(' · ');
    }
  }
  const canDownload = Boolean(selection && selection.totals.count);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selection || !canDownload) return;
    try {
      const file = createExportFile(selection, format, { categories, currency, locale, generatedAt: now() });
      onDownload(file, { selection, format });
      onClose();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Export failed');
      setSubmitError(error.message || 'Export failed');
      onError?.(error);
    }
  }

  return (
    <>
      <div className="dialog__head">
        <h2 id="export-title" className="panel__title">
          Export data
        </h2>
        <button type="button" className="icon-btn" aria-label="Close export" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="dialog__body">
        <form className="export-form" noValidate onSubmit={handleSubmit}>
          <div className="field">
            <span className="field__label">Quick ranges</span>
            <div className="preset-row" role="group" aria-label="Quick ranges">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn--sm"
                  data-preset={p.id}
                  onClick={() => {
                    const [s, e] = p.range();
                    setStartMonth(clampMonthKey(s, maxMonth));
                    setEndMonth(clampMonthKey(e, maxMonth));
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="export-range">
            <MonthField idPrefix="export-start" label="Start month" value={startMonth} minYear={minYear} maxYear={maxYear} maxMonth={maxMonth} onChange={setStartMonth} />
            <MonthField idPrefix="export-end" label="End month" value={endMonth} minYear={minYear} maxYear={maxYear} maxMonth={maxMonth} onChange={setEndMonth} />
          </div>
          <p className="field__error" id="export-error" role="alert">
            {problem || submitError}
          </p>
          <RadioGroup name="export-type" legend="What to export" value={typeChoice} onChange={(v) => setTypeChoice(v as ExportTypeChoice)} options={[['both', 'Expenses & income'], ['expense', 'Expenses only'], ['income', 'Income only']]} />
          <RadioGroup name="export-format" legend="File type" value={format} onChange={(v) => setFormat(v as ExportFormat)} options={[['xlsx', 'Excel (.xlsx)'], ['pdf', 'PDF (.pdf)']]} />
          <p className="export-preview" data-testid="export-preview" aria-live="polite">
            {preview}
          </p>
          <div className="dialog__actions dialog__actions--end">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" data-testid="export-download" disabled={!canDownload}>
              <Icon name="download" size={16} />
              <span>Download</span>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

interface MonthFieldProps {
  idPrefix: string;
  label: string;
  value: string;
  minYear: number;
  maxYear: number;
  maxMonth: string;
  onChange: (monthKey: string) => void;
}

function MonthField({ idPrefix, label, value, minYear, maxYear, maxMonth, onChange }: MonthFieldProps) {
  const { year, month } = splitMonthKey(value);
  const { year: maxY, month: maxM } = splitMonthKey(maxMonth);
  const years = Array.from({ length: Math.max(maxYear, year) - Math.min(minYear, year) + 1 }, (_, i) => Math.min(minYear, year) + i);
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="field__inline">
        <select id={`${idPrefix}-month`} className="field__input" aria-label={`${label}: month`} value={String(month)} onChange={(e) => onChange(makeMonthKey(year, Number(e.target.value)))}>
          {MONTH_NAMES.map((n, i) => (
            <option key={n} value={String(i + 1)} disabled={year === maxY && i + 1 > maxM}>
              {n}
            </option>
          ))}
        </select>
        <select
          id={`${idPrefix}-year`}
          className="field__input"
          aria-label={`${label}: year`}
          value={String(year)}
          onChange={(e) => {
            const y = Number(e.target.value);
            onChange(makeMonthKey(y, y === maxY && month > maxM ? maxM : month));
          }}
        >
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface RadioGroupProps {
  name: string;
  legend: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}

function RadioGroup({ name, legend, value, options, onChange }: RadioGroupProps) {
  return (
    <fieldset className="choice-group">
      <legend className="field__label">{legend}</legend>
      <div className="choice-row">
        {options.map(([v, label]) => (
          <label key={v} className="choice" htmlFor={`${name}-${v}`}>
            <input type="radio" name={name} id={`${name}-${v}`} value={v} className="choice__input" checked={value === v} onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
