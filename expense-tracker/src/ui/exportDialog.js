import { MONTH_NAMES, clampMonthKey, makeMonthKey, shiftMonth, splitMonthKey } from '../lib/dates.js';
import { createExportFile, EXPORT_FORMATS, EXPORT_TYPES, selectForExport, validateExportRange } from '../lib/export/exportData.js';
import { formatMoney } from '../lib/money.js';
import { h, icon, replaceChildren } from './dom.js';

/**
 * Export dialog: month range (with presets), data type, file format, a live
 * preview of what will be exported, and a Download button.
 *
 * The dialog is given the current data via update(); it computes the preview
 * and builds the file itself, then hands the bytes to `onDownload`.
 */
export function createExportDialog(container, { onDownload, onError }) {
  let data = { transactions: [], categories: [], preferences: { currency: 'USD', locale: 'en-US' }, selectedMonth: '', maxMonth: '' };
  let typeChoice = 'both';
  let format = 'xlsx';

  // --- range fields ---------------------------------------------------------
  const startField = createMonthField({ idPrefix: 'export-start', onChange: refresh });
  const endField = createMonthField({ idPrefix: 'export-end', onChange: refresh });

  const presets = [
    { id: 'this-month', label: 'This month', range: () => [data.selectedMonth, data.selectedMonth] },
    { id: 'last-3', label: 'Last 3 months', range: () => [shiftMonth(data.maxMonth, -2), data.maxMonth] },
    { id: 'last-12', label: 'Last 12 months', range: () => [shiftMonth(data.maxMonth, -11), data.maxMonth] },
    { id: 'all', label: 'All data', range: () => [earliestMonth() || data.maxMonth, data.maxMonth] },
  ];
  const presetRow = h(
    'div',
    { class: 'preset-row', role: 'group', 'aria-label': 'Quick ranges' },
    ...presets.map((p) =>
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--sm',
          'data-preset': p.id,
          onclick: () => {
            const [s, e] = p.range();
            startField.set(clampMonthKey(s, data.maxMonth));
            endField.set(clampMonthKey(e, data.maxMonth));
            refresh();
          },
        },
        p.label,
      ),
    ),
  );

  // --- type + format ------------------------------------------------------------
  const typeGroup = radioGroup('export-type', 'What to export', [
    ['both', 'Expenses & income'],
    ['expense', 'Expenses only'],
    ['income', 'Income only'],
  ], () => refresh());
  const formatGroup = radioGroup('export-format', 'File type', [
    ['xlsx', 'Excel (.xlsx)'],
    ['pdf', 'PDF (.pdf)'],
  ], () => refresh());

  // --- preview / error / actions -------------------------------------------------
  const preview = h('p', { class: 'export-preview', 'data-testid': 'export-preview', 'aria-live': 'polite' });
  const error = h('p', { class: 'field__error', id: 'export-error', role: 'alert' });
  const downloadBtn = h('button', { type: 'submit', class: 'btn btn--primary', 'data-testid': 'export-download' }, icon('download', 16), h('span', {}, 'Download'));
  const cancelBtn = h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => dialog.close() }, 'Cancel');

  const form = h(
    'form',
    { class: 'export-form', novalidate: true, onsubmit: handleSubmit },
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Quick ranges'), presetRow),
    h('div', { class: 'export-range' }, startField.root, endField.root),
    error,
    typeGroup.root,
    formatGroup.root,
    preview,
    h('div', { class: 'dialog__actions dialog__actions--end' }, cancelBtn, downloadBtn),
  );

  const dialog = h(
    'dialog',
    { class: 'dialog', 'aria-labelledby': 'export-title', 'data-testid': 'export-dialog' },
    h(
      'div',
      { class: 'dialog__head' },
      h('h2', { id: 'export-title', class: 'panel__title' }, 'Export data'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close export', onclick: () => dialog.close() }, icon('x')),
    ),
    h('div', { class: 'dialog__body' }, form),
  );
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  container.append(dialog);

  // --- behaviour -------------------------------------------------------------------

  function earliestMonth() {
    let min = null;
    for (const t of data.transactions) {
      const m = t.date.slice(0, 7);
      if (!min || m < min) min = m;
    }
    return min;
  }

  function yearBounds() {
    const { year: maxYear } = splitMonthKey(data.maxMonth);
    const earliest = earliestMonth();
    const minYear = Math.min(maxYear - 10, earliest ? splitMonthKey(earliest).year : maxYear);
    return { minYear, maxYear };
  }

  function currentRange() {
    return { startMonth: startField.get(), endMonth: endField.get() };
  }

  function refresh() {
    typeChoice = typeGroup.get();
    format = formatGroup.get();
    const { startMonth, endMonth } = currentRange();
    const problem = validateExportRange({ startMonth, endMonth, maxMonth: data.maxMonth });
    error.textContent = problem || '';
    if (problem) {
      preview.textContent = '';
      downloadBtn.disabled = true;
      return;
    }
    const selection = selectForExport(data.transactions, { startMonth, endMonth, types: typeChoice });
    const { currency, locale } = data.preferences;
    const money = (c) => formatMoney(c, { currency, locale });
    if (!selection.totals.count) {
      preview.textContent = 'No transactions in this range.';
      downloadBtn.disabled = true;
      return;
    }
    const parts = [`${selection.totals.count} ${selection.totals.count === 1 ? 'transaction' : 'transactions'}`];
    if (selection.types.includes('income')) parts.push(`income ${money(selection.totals.income)}`);
    if (selection.types.includes('expense')) parts.push(`expenses ${money(selection.totals.expenses)}`);
    preview.textContent = parts.join(' · ');
    downloadBtn.disabled = false;
  }

  function handleSubmit(e) {
    e.preventDefault();
    refresh();
    if (downloadBtn.disabled) return;
    const { startMonth, endMonth } = currentRange();
    try {
      const selection = selectForExport(data.transactions, { startMonth, endMonth, types: typeChoice });
      const file = createExportFile(selection, format, { categories: data.categories, currency: data.preferences.currency, locale: data.preferences.locale });
      onDownload(file, { selection, format });
      dialog.close();
    } catch (err) {
      error.textContent = err.message || 'Export failed';
      onError?.(err);
    }
  }

  return {
    dialog,
    update(next) {
      data = { ...data, ...next };
      const { minYear, maxYear } = yearBounds();
      startField.configure({ minYear, maxYear, maxMonth: data.maxMonth });
      endField.configure({ minYear, maxYear, maxMonth: data.maxMonth });
      if (dialog.open) refresh();
    },
    open() {
      startField.set(data.selectedMonth);
      endField.set(data.selectedMonth);
      refresh();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    },
    /** Current form state, for tests. */
    getState: () => ({ ...currentRange(), types: typeChoice, format }),
  };
}

// ---------------------------------------------------------------------------

function createMonthField({ idPrefix, onChange }) {
  let maxMonth = '';
  const label = idPrefix.endsWith('start') ? 'Start month' : 'End month';
  const monthSelect = h('select', { id: `${idPrefix}-month`, class: 'field__input', 'aria-label': `${label}: month`, onchange: onChange }, ...MONTH_NAMES.map((n, i) => h('option', { value: String(i + 1) }, n)));
  const yearSelect = h('select', { id: `${idPrefix}-year`, class: 'field__input', 'aria-label': `${label}: year`, onchange: () => { applyMonthLimits(); onChange(); } });
  const root = h('div', { class: 'field' }, h('span', { class: 'field__label' }, label), h('div', { class: 'field__inline' }, monthSelect, yearSelect));

  function applyMonthLimits() {
    if (!maxMonth) return;
    const { year: maxYear, month: maxM } = splitMonthKey(maxMonth);
    const year = Number(yearSelect.value);
    for (const opt of monthSelect.options) opt.disabled = year === maxYear && Number(opt.value) > maxM;
    if (year === maxYear && Number(monthSelect.value) > maxM) monthSelect.value = String(maxM);
  }

  return {
    root,
    configure({ minYear, maxYear, maxMonth: max }) {
      maxMonth = max;
      const current = yearSelect.value;
      replaceChildren(yearSelect, ...Array.from({ length: maxYear - minYear + 1 }, (_, i) => h('option', { value: String(minYear + i) }, String(minYear + i))));
      yearSelect.value = [...yearSelect.options].some((o) => o.value === current) ? current : String(maxYear);
      applyMonthLimits();
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
      applyMonthLimits();
      monthSelect.value = String(month);
    },
  };
}

function radioGroup(name, legend, options, onChange) {
  const inputs = options.map(([value, label], i) =>
    h('input', { type: 'radio', name, id: `${name}-${value}`, value, class: 'choice__input', checked: i === 0, onchange: onChange }),
  );
  const root = h(
    'fieldset',
    { class: 'choice-group' },
    h('legend', { class: 'field__label' }, legend),
    h('div', { class: 'choice-row' }, ...options.map(([value, label], i) => h('label', { class: 'choice', for: `${name}-${value}` }, inputs[i], h('span', {}, label)))),
  );
  return {
    root,
    get: () => inputs.find((i) => i.checked)?.value ?? options[0][0],
    set: (value) => inputs.forEach((i) => (i.checked = i.value === value)),
  };
}

export { EXPORT_FORMATS, EXPORT_TYPES };
