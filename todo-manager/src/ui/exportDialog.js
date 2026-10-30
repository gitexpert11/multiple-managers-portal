import { MONTH_NAMES, currentMonthKey, makeMonthKey, shiftMonth, splitMonthKey } from '../lib/dates.js';
import { createExportFile, EXPORT_FORMATS, EXPORT_SCOPES, selectForExport, validateExportRange } from '../lib/export/exportData.js';
import { h, icon, replaceChildren } from './dom.js';

/** Years offered in the range selects around today, even with no task in them. */
const YEARS_BACK = 2;
const YEARS_AHEAD = 2;

/**
 * Export dialog: month range (with presets), which tasks, file format, a live
 * preview of what will be exported, and a Download button.
 *
 * The dialog is given the current data via update(); it computes the preview
 * and builds the file itself, then hands the bytes to `onDownload`.
 */
export function createExportDialog(container, { onDownload, onError, now = () => new Date() }) {
  let data = { tasks: [], selectedMonth: '', today: '' };
  let scope = 'all';
  let format = 'xlsx';

  // --- range fields ---------------------------------------------------------
  const startField = createMonthField({ idPrefix: 'todo-export-start', onChange: refresh });
  const endField = createMonthField({ idPrefix: 'todo-export-end', onChange: refresh });

  const thisMonth = () => currentMonthKey(now());
  const presets = [
    { id: 'this-month', label: 'This month', range: () => [data.selectedMonth, data.selectedMonth] },
    { id: 'around-now', label: 'Last, this & next month', range: () => [shiftMonth(thisMonth(), -1), shiftMonth(thisMonth(), 1)] },
    { id: 'this-year', label: 'This year', range: () => [`${thisMonth().slice(0, 4)}-01`, `${thisMonth().slice(0, 4)}-12`] },
    { id: 'all', label: 'All tasks', range: () => taskBounds() || [data.selectedMonth, data.selectedMonth] },
  ];
  const presetRow = h(
    'div',
    { class: 'todo-preset-row', role: 'group', 'aria-label': 'Quick ranges' },
    ...presets.map((p) =>
      h(
        'button',
        {
          type: 'button',
          class: 'todo-btn todo-btn--sm',
          'data-preset': p.id,
          onclick: () => {
            const [s, e] = p.range();
            startField.set(s);
            endField.set(e);
            refresh();
          },
        },
        p.label,
      ),
    ),
  );

  // --- scope + format ------------------------------------------------------------
  const scopeGroup = radioGroup('todo-export-scope', 'Which tasks', [
    ['all', 'All tasks'],
    ['open', 'Open only'],
    ['completed', 'Completed only'],
  ], () => refresh());
  const formatGroup = radioGroup('todo-export-format', 'File type', [
    ['xlsx', 'Excel (.xlsx)'],
    ['pdf', 'PDF (.pdf)'],
  ], () => refresh());

  // --- preview / error / actions -------------------------------------------------
  const preview = h('p', { class: 'todo-export-preview', 'data-testid': 'todo-export-preview', 'aria-live': 'polite' });
  const error = h('p', { class: 'todo-field__error', id: 'todo-export-error', role: 'alert' });
  const downloadBtn = h('button', { type: 'submit', class: 'todo-btn todo-btn--primary', 'data-testid': 'todo-export-download' }, icon('download', 16), h('span', {}, 'Download'));
  const cancelBtn = h('button', { type: 'button', class: 'todo-btn todo-btn--ghost', onclick: () => dialog.close() }, 'Cancel');

  const form = h(
    'form',
    { class: 'todo-export-form', novalidate: true, onsubmit: handleSubmit },
    h('div', { class: 'todo-field' }, h('span', { class: 'todo-field__label' }, 'Quick ranges'), presetRow),
    h('div', { class: 'todo-export-range' }, startField.root, endField.root),
    error,
    scopeGroup.root,
    formatGroup.root,
    preview,
    h('div', { class: 'todo-dialog__actions' }, cancelBtn, downloadBtn),
  );

  const dialog = h(
    'dialog',
    { class: 'todo-dialog', 'aria-labelledby': 'todo-export-title', 'data-testid': 'todo-export-dialog' },
    h(
      'div',
      { class: 'todo-dialog__head' },
      h('h2', { id: 'todo-export-title', class: 'todo-panel__title' }, 'Export tasks'),
      h('button', { type: 'button', class: 'todo-icon-btn', 'aria-label': 'Close export', onclick: () => dialog.close() }, icon('x')),
    ),
    h('div', { class: 'todo-dialog__body' }, form),
  );
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  container.append(dialog);

  // --- behaviour -------------------------------------------------------------------

  /** [earliest, latest] month with a task, or null when there are none. */
  function taskBounds() {
    let min = null;
    let max = null;
    for (const t of data.tasks) {
      const m = t.endDate.slice(0, 7);
      if (!min || m < min) min = m;
      if (!max || m > max) max = m;
    }
    return min ? [min, max] : null;
  }

  function yearBounds() {
    const { year: thisYear } = splitMonthKey(thisMonth());
    const bounds = taskBounds();
    const selectedYear = data.selectedMonth ? splitMonthKey(data.selectedMonth).year : thisYear;
    return {
      minYear: Math.min(thisYear - YEARS_BACK, selectedYear, bounds ? splitMonthKey(bounds[0]).year : thisYear),
      maxYear: Math.max(thisYear + YEARS_AHEAD, selectedYear, bounds ? splitMonthKey(bounds[1]).year : thisYear),
    };
  }

  function currentRange() {
    return { startMonth: startField.get(), endMonth: endField.get() };
  }

  function refresh() {
    scope = scopeGroup.get();
    format = formatGroup.get();
    const { startMonth, endMonth } = currentRange();
    const problem = validateExportRange({ startMonth, endMonth });
    error.textContent = problem || '';
    if (problem) {
      preview.textContent = '';
      downloadBtn.disabled = true;
      return;
    }
    const selection = selectForExport(data.tasks, { startMonth, endMonth, scope, today: data.today });
    if (!selection.totals.count) {
      preview.textContent = 'No tasks in this range.';
      downloadBtn.disabled = true;
      return;
    }
    const t = selection.totals;
    const parts = [`${t.count} ${t.count === 1 ? 'task' : 'tasks'}`];
    if (scope !== 'completed') parts.push(`${t.open} open`, `${t.overdue} overdue`);
    if (scope !== 'open') parts.push(`${t.completed} completed`);
    preview.textContent = parts.join(' · ');
    downloadBtn.disabled = false;
  }

  function handleSubmit(e) {
    e.preventDefault();
    refresh();
    if (downloadBtn.disabled) return;
    const { startMonth, endMonth } = currentRange();
    try {
      const selection = selectForExport(data.tasks, { startMonth, endMonth, scope, today: data.today });
      const file = createExportFile(selection, format, { generatedAt: now() });
      onDownload(file, { selection, format });
      dialog.close();
    } catch (err) {
      error.textContent = err.message || 'Export failed';
      onError?.(err);
    }
  }

  return {
    dialog,
    /** @param {{tasks?: object[], selectedMonth?: string, today?: string}} next */
    update(next) {
      data = { ...data, ...next };
      const { minYear, maxYear } = yearBounds();
      startField.configure({ minYear, maxYear });
      endField.configure({ minYear, maxYear });
      if (dialog.open) refresh();
    },
    open() {
      const month = data.selectedMonth || thisMonth(); // opened before any update(): default to today
      startField.set(month);
      endField.set(month);
      refresh();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    },
    /** Current form state, for tests. */
    getState: () => ({ ...currentRange(), scope, format }),
  };
}

// ---------------------------------------------------------------------------

function createMonthField({ idPrefix, onChange }) {
  const label = idPrefix.endsWith('start') ? 'Start month' : 'End month';
  const monthSelect = h('select', { id: `${idPrefix}-month`, class: 'todo-field__input', 'aria-label': `${label}: month`, onchange: onChange }, ...MONTH_NAMES.map((n, i) => h('option', { value: String(i + 1) }, n)));
  const yearSelect = h('select', { id: `${idPrefix}-year`, class: 'todo-field__input', 'aria-label': `${label}: year`, onchange: onChange });
  const root = h('div', { class: 'todo-field' }, h('span', { class: 'todo-field__label' }, label), h('div', { class: 'todo-field__inline' }, monthSelect, yearSelect));

  return {
    root,
    configure({ minYear, maxYear }) {
      const current = yearSelect.value;
      replaceChildren(yearSelect, ...Array.from({ length: maxYear - minYear + 1 }, (_, i) => h('option', { value: String(minYear + i) }, String(minYear + i))));
      yearSelect.value = [...yearSelect.options].some((o) => o.value === current) ? current : String(maxYear);
    },
    get() {
      return makeMonthKey(Number(yearSelect.value), Number(monthSelect.value));
    },
    set(monthKey) {
      const { year, month } = splitMonthKey(monthKey);
      if (![...yearSelect.options].some((o) => o.value === String(year))) {
        yearSelect.append(h('option', { value: String(year) }, String(year)));
      }
      yearSelect.value = String(year);
      monthSelect.value = String(month);
    },
  };
}

function radioGroup(name, legend, options, onChange) {
  const inputs = options.map(([value], i) =>
    h('input', { type: 'radio', name, id: `${name}-${value}`, value, class: 'todo-option__input', checked: i === 0, onchange: onChange }),
  );
  const root = h(
    'fieldset',
    { class: 'todo-choice-group' },
    h('legend', { class: 'todo-field__label' }, legend),
    h('div', { class: 'todo-option-row' }, ...options.map(([value, label], i) => h('label', { class: 'todo-option', for: `${name}-${value}` }, inputs[i], h('span', {}, label)))),
  );
  return {
    root,
    get: () => inputs.find((i) => i.checked)?.value ?? options[0][0],
    set: (value) => inputs.forEach((i) => (i.checked = i.value === value)),
  };
}

export { EXPORT_FORMATS, EXPORT_SCOPES };
