import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '@shared/ui/Dialog';
import { Icon } from '@shared/ui/Icon';
import { MONTH_NAMES, currentMonthKey, makeMonthKey, shiftMonth, splitMonthKey } from '../lib/dates';
import { createExportFile, selectForExport, validateExportRange, type ExportFile, type ExportFormat, type ExportScope, type ExportSelection } from '../lib/export/exportData';
import type { Task } from '../types';

/** Years offered in the range selects around today, even with no task in them. */
const YEARS_BACK = 2;
const YEARS_AHEAD = 2;

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  selectedMonth: string;
  today: string;
  now: () => Date;
  onDownload: (file: ExportFile, info: { selection: ExportSelection; format: ExportFormat }) => void;
  onError?: (err: Error) => void;
}

/**
 * Export dialog: month range (with presets), which tasks, file format, a live
 * preview of what will be exported, and a Download button.
 */
export function ExportDialog({ open, onClose, ...rest }: ExportDialogProps) {
  // The form is mounted only while the dialog is open, so every opening starts
  // fresh from the month shown on the dashboard.
  return (
    <Dialog open={open} onClose={onClose} className="todo-dialog" aria-labelledby="todo-export-title" data-testid="todo-export-dialog">
      {open && <ExportForm onClose={onClose} {...rest} />}
    </Dialog>
  );
}

function ExportForm({ onClose, tasks, selectedMonth, today, now, onDownload, onError }: Omit<ExportDialogProps, 'open'>) {
  const thisMonth = currentMonthKey(now());
  const [startMonth, setStartMonth] = useState(selectedMonth || thisMonth);
  const [endMonth, setEndMonth] = useState(selectedMonth || thisMonth);
  const [scope, setScope] = useState<ExportScope>('all');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [submitError, setSubmitError] = useState('');

  /** [earliest, latest] month with a task, or null when there are none. */
  const taskBounds = useMemo((): [string, string] | null => {
    let min: string | null = null;
    let max: string | null = null;
    for (const t of tasks) {
      const m = t.endDate.slice(0, 7);
      if (!min || m < min) min = m;
      if (!max || m > max) max = m;
    }
    return min && max ? [min, max] : null;
  }, [tasks]);

  const { minYear, maxYear } = useMemo(() => {
    const { year: thisYear } = splitMonthKey(thisMonth);
    const selectedYear = selectedMonth ? splitMonthKey(selectedMonth).year : thisYear;
    return {
      minYear: Math.min(thisYear - YEARS_BACK, selectedYear, taskBounds ? splitMonthKey(taskBounds[0]).year : thisYear),
      maxYear: Math.max(thisYear + YEARS_AHEAD, selectedYear, taskBounds ? splitMonthKey(taskBounds[1]).year : thisYear),
    };
  }, [thisMonth, selectedMonth, taskBounds]);

  const presets = [
    { id: 'this-month', label: 'This month', range: (): [string, string] => [selectedMonth, selectedMonth] },
    { id: 'around-now', label: 'Last, this & next month', range: (): [string, string] => [shiftMonth(thisMonth, -1), shiftMonth(thisMonth, 1)] },
    { id: 'this-year', label: 'This year', range: (): [string, string] => [`${thisMonth.slice(0, 4)}-01`, `${thisMonth.slice(0, 4)}-12`] },
    { id: 'all', label: 'All tasks', range: (): [string, string] => taskBounds || [selectedMonth, selectedMonth] },
  ];

  const problem = validateExportRange({ startMonth, endMonth });
  const selection = problem ? null : selectForExport(tasks, { startMonth, endMonth, scope, today });
  let preview = '';
  if (selection) {
    const t = selection.totals;
    if (!t.count) preview = 'No tasks in this range.';
    else {
      const parts = [`${t.count} ${t.count === 1 ? 'task' : 'tasks'}`];
      if (scope !== 'completed') parts.push(`${t.open} open`, `${t.overdue} overdue`);
      if (scope !== 'open') parts.push(`${t.completed} completed`);
      preview = parts.join(' · ');
    }
  }
  const canDownload = Boolean(selection && selection.totals.count);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selection || !canDownload) return;
    try {
      const file = createExportFile(selection, format, { generatedAt: now() });
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
      <div className="todo-dialog__head">
        <h2 id="todo-export-title" className="todo-panel__title">
          Export tasks
        </h2>
        <button type="button" className="todo-icon-btn" aria-label="Close export" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="todo-dialog__body">
        <form className="todo-export-form" noValidate onSubmit={handleSubmit}>
          <div className="todo-field">
            <span className="todo-field__label">Quick ranges</span>
            <div className="todo-preset-row" role="group" aria-label="Quick ranges">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="todo-btn todo-btn--sm"
                  data-preset={p.id}
                  onClick={() => {
                    const [s, e] = p.range();
                    setStartMonth(s);
                    setEndMonth(e);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="todo-export-range">
            <MonthField idPrefix="todo-export-start" label="Start month" value={startMonth} minYear={minYear} maxYear={maxYear} onChange={setStartMonth} />
            <MonthField idPrefix="todo-export-end" label="End month" value={endMonth} minYear={minYear} maxYear={maxYear} onChange={setEndMonth} />
          </div>
          <p className="todo-field__error" id="todo-export-error" role="alert">
            {problem || submitError}
          </p>
          <RadioGroup name="todo-export-scope" legend="Which tasks" value={scope} onChange={(v) => setScope(v as ExportScope)} options={[['all', 'All tasks'], ['open', 'Open only'], ['completed', 'Completed only']]} />
          <RadioGroup name="todo-export-format" legend="File type" value={format} onChange={(v) => setFormat(v as ExportFormat)} options={[['xlsx', 'Excel (.xlsx)'], ['pdf', 'PDF (.pdf)']]} />
          <p className="todo-export-preview" data-testid="todo-export-preview" aria-live="polite">
            {preview}
          </p>
          <div className="todo-dialog__actions">
            <button type="button" className="todo-btn todo-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="todo-btn todo-btn--primary" data-testid="todo-export-download" disabled={!canDownload}>
              <Icon name="download" size={16} />
              <span>Download</span>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function MonthField({ idPrefix, label, value, minYear, maxYear, onChange }: { idPrefix: string; label: string; value: string; minYear: number; maxYear: number; onChange: (m: string) => void }) {
  const { year, month } = splitMonthKey(value);
  const lo = Math.min(minYear, year);
  const hi = Math.max(maxYear, year);
  const years = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  return (
    <div className="todo-field">
      <span className="todo-field__label">{label}</span>
      <div className="todo-field__inline">
        <select id={`${idPrefix}-month`} className="todo-field__input" aria-label={`${label}: month`} value={String(month)} onChange={(e) => onChange(makeMonthKey(year, Number(e.target.value)))}>
          {MONTH_NAMES.map((n, i) => (
            <option key={n} value={String(i + 1)}>
              {n}
            </option>
          ))}
        </select>
        <select id={`${idPrefix}-year`} className="todo-field__input" aria-label={`${label}: year`} value={String(year)} onChange={(e) => onChange(makeMonthKey(Number(e.target.value), month))}>
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

function RadioGroup({ name, legend, value, options, onChange }: { name: string; legend: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <fieldset className="todo-choice-group">
      <legend className="todo-field__label">{legend}</legend>
      <div className="todo-option-row">
        {options.map(([v, label]) => (
          <label key={v} className="todo-option" htmlFor={`${name}-${v}`}>
            <input type="radio" name={name} id={`${name}-${v}`} value={v} className="todo-option__input" checked={value === v} onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
