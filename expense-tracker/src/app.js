import { clampMonthKey, currentMonthKey, monthKeyOf, todayKey } from './lib/dates.js';
import { sortTransactions, summarize, totalsByCategory, transactionsInMonth } from './lib/stats.js';
import { formatMoney } from './lib/money.js';
import { createStore } from './store/store.js';
import { generateMockTransactions, isMockTransaction } from './data/mockData.js';
import { h, icon } from './ui/dom.js';
import { createMonthPicker } from './ui/monthPicker.js';
import { createSummaryCards } from './ui/summaryCards.js';
import { createTransactionForm } from './ui/transactionForm.js';
import { createCategoryChart } from './ui/categoryChart.js';
import { createTransactionGrid } from './ui/transactionGrid.js';
import { createSettings } from './ui/settings.js';
import { createToaster } from './ui/toast.js';
import { createExportDialog } from './ui/exportDialog.js';

/**
 * Wires the store to the UI components. Persistent data lives in the store;
 * transient UI state (selected month, category filter, editing id) lives here.
 */
export function createApp(rootEl, { store = createStore(), now = () => new Date() } = {}) {
  const TYPES = ['expense', 'income'];
  const ui = {
    month: currentMonthKey(now()),
    // One independent category filter per type: picking an expense category
    // never hides income rows, and vice versa.
    selectedCategory: { expense: null, income: null },
    editingId: null,
  };

  // ---- layout --------------------------------------------------------------
  const headerActions = h('div', { class: 'topbar__actions' });
  const pickerHost = h('div', { class: 'topbar__picker' });
  const summaryHost = h('div', {});
  const formHost = h('div', { class: 'layout__form' });
  const chartHost = h('div', { class: 'layout__charts' });
  const gridHosts = { expense: h('div', { class: 'layout__grid' }), income: h('div', { class: 'layout__grid' }) };
  const storageWarning = h('p', { class: 'banner banner--warning', hidden: true, role: 'alert' }, 'Changes could not be saved — your browser storage may be full or blocked.');

  rootEl.append(
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'topbar__brand' }, h('span', { class: 'topbar__logo' }, icon('wallet', 22)), h('h1', { class: 'topbar__title' }, 'Expense Tracker')),
      pickerHost,
      headerActions,
    ),
    storageWarning,
    h('main', { class: 'layout' }, summaryHost, h('div', { class: 'layout__row' }, formHost, chartHost), gridHosts.expense, gridHosts.income),
    h('footer', { class: 'footer' }, 'Data is stored locally in your browser · Press ', h('kbd', {}, 'N'), ' to jump to the amount field'),
  );

  const toaster = createToaster(rootEl);

  // ---- components ----------------------------------------------------------
  const monthPicker = createMonthPicker(pickerHost, {
    onChange: (month) => {
      ui.month = clampMonthKey(month, currentMonthKey(now()));
      clearSelections();
      render();
    },
  });

  const summaryCards = createSummaryCards(summaryHost);

  const form = createTransactionForm(formHost, {
    onSubmit: (payload, editingId) => {
      try {
        if (editingId) {
          store.updateTransaction(editingId, payload);
          ui.editingId = null;
          toaster.show('Transaction updated', { tone: 'success', duration: 2500 });
        } else {
          const tx = store.addTransaction(payload);
          const prefs = store.getState().preferences;
          toaster.show(`${tx.type === 'income' ? 'Income' : 'Expense'} of ${formatMoney(tx.amount, prefs)} added`, { tone: 'success', duration: 2500 });
          // If the user entered a date outside the selected month, follow it so the entry is visible.
          if (monthKeyOf(tx.date) !== ui.month) {
            ui.month = monthKeyOf(tx.date);
            clearSelections();
          }
        }
        render();
        return true;
      } catch (err) {
        toaster.show(err.message || 'Could not save transaction', { tone: 'error' });
        return false;
      }
    },
    onCancelEdit: () => {
      ui.editingId = null;
      render();
    },
    onAddCategory: (name, type) => {
      try {
        const cat = store.addCategory({ name, type });
        render();
        return cat;
      } catch (err) {
        toaster.show(err.message, { tone: 'error' });
        return null;
      }
    },
  });

  function clearSelections() {
    ui.selectedCategory = { expense: null, income: null };
  }

  function selectCategory(type, categoryId) {
    ui.selectedCategory[type] = categoryId;
    render();
    if (categoryId) gridHosts[type].scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }

  const charts = {};
  const grids = {};
  for (const type of TYPES) {
    charts[type] = createCategoryChart(chartHost, {
      type,
      onSelect: (categoryId) => selectCategory(type, categoryId),
    });

    grids[type] = createTransactionGrid(gridHosts[type], {
      type,
      onEdit: (id) => {
        ui.editingId = id;
        render();
        formHost.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      },
      onDelete: (id) => {
        const removed = store.deleteTransaction(id);
        if (!removed) return;
        if (ui.editingId === id) ui.editingId = null;
        render();
        toaster.show('Transaction deleted', {
          action: 'Undo',
          onAction: () => {
            store.restoreTransaction(removed);
            render();
          },
          duration: 6000,
        });
      },
      onSort: (gridSort) => {
        // Sorting is a shared preference so both grids stay consistent.
        store.setPreferences({ gridSort });
        render();
      },
      onSelectCategory: (categoryId) => {
        // Toggle: clicking the already-selected category's pill clears it.
        selectCategory(type, ui.selectedCategory[type] === categoryId ? null : categoryId);
      },
    });
  }

  // ---- sample data toggle --------------------------------------------------
  const sampleLabel = h('span', {}, 'Load sample data');
  const sampleBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--sm sample-toggle',
      'data-testid': 'sample-data-toggle',
      'aria-pressed': 'false',
      title: 'Adds two years of sample transactions for trying out the UI. Click again to remove them.',
      onclick: () => {
        const hasMock = store.getState().transactions.some(isMockTransaction);
        try {
          if (hasMock) {
            const removed = store.removeTransactionsWhere(isMockTransaction);
            toaster.show(`Removed ${removed.length} sample transactions`, { duration: 3000 });
          } else {
            const added = store.addTransactions(generateMockTransactions({ now: now() }));
            toaster.show(`Added ${added.length} sample transactions across the last 2 years`, { tone: 'success', duration: 3500 });
          }
        } catch (err) {
          toaster.show(err.message || 'Could not update sample data', { tone: 'error' });
        }
        // Anything selected/edited may refer to records that just changed.
        clearSelections();
        ui.editingId = null;
        render();
      },
    },
    icon('database', 16),
    sampleLabel,
  );
  headerActions.append(sampleBtn);

  // ---- export ----------------------------------------------------------------
  const exportDialog = createExportDialog(rootEl, {
    onDownload: (file, { selection, format }) => {
      downloadBytes(file.bytes, file.mime, file.filename);
      toaster.show(`Exported ${selection.totals.count} transactions as ${format === 'pdf' ? 'PDF' : 'Excel'}`, { tone: 'success', duration: 3500 });
    },
    onError: (err) => toaster.show(err.message || 'Export failed', { tone: 'error' }),
  });
  const exportBtn = h(
    'button',
    { type: 'button', class: 'btn btn--sm', 'data-testid': 'export-open', title: 'Export transactions to Excel or PDF', onclick: () => exportDialog.open() },
    icon('download', 16),
    h('span', {}, 'Export'),
  );
  headerActions.append(exportBtn);

  const settings = createSettings(headerActions, {
    onPreferences: (patch) => {
      store.setPreferences(patch);
      render();
    },
    onExport: () => downloadBytes(JSON.stringify(store.exportData(), null, 2), 'application/json', `expense-tracker-${new Date().toISOString().slice(0, 10)}.json`),
    onImport: (data) => {
      try {
        if (!data) throw new Error('That file is not valid JSON');
        const count = data.transactions?.length ?? 0;
        if (!window.confirm(`Import ${count} transactions? This replaces your current data.`)) return;
        store.importData(data);
        clearSelections();
        ui.editingId = null;
        render();
        toaster.show(`Imported ${count} transactions`, { tone: 'success' });
      } catch (err) {
        toaster.show(err.message || 'Import failed', { tone: 'error' });
      }
    },
    onReset: () => {
      store.clearAll();
      clearSelections();
      ui.editingId = null;
      render();
      toaster.show('All data deleted');
    },
    onDeleteCategory: (id) => {
      store.deleteCategory(id);
      for (const type of TYPES) if (ui.selectedCategory[type] === id) ui.selectedCategory[type] = null;
      render();
    },
    onRenameCategory: (id, name) => {
      store.renameCategory(id, name);
      render();
    },
  });

  // ---- keyboard shortcut ---------------------------------------------------
  rootEl.ownerDocument.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    e.preventDefault();
    form.focusAmount();
  });

  // ---- render --------------------------------------------------------------
  function render() {
    const state = store.getState();
    const { transactions, categories, preferences } = state;
    const { currency, locale } = preferences;

    storageWarning.hidden = !store.saveFailed;

    const hasMock = transactions.some(isMockTransaction);
    sampleLabel.textContent = hasMock ? 'Remove sample data' : 'Load sample data';
    sampleBtn.setAttribute('aria-label', sampleLabel.textContent); // text is hidden on phones
    sampleBtn.setAttribute('aria-pressed', hasMock ? 'true' : 'false');
    sampleBtn.classList.toggle('is-active', hasMock);

    const inMonth = transactionsInMonth(transactions, ui.month);
    const summary = summarize(inMonth);
    const counts = {
      income: inMonth.filter((t) => t.type === 'income').length,
      expenses: inMonth.filter((t) => t.type === 'expense').length,
    };
    const editing = ui.editingId ? transactions.find((t) => t.id === ui.editingId) || null : null;
    if (ui.editingId && !editing) ui.editingId = null;

    // The picker never shows a future month; keep UI state consistent with that.
    ui.month = clampMonthKey(ui.month, currentMonthKey(now()));
    monthPicker.update({
      month: ui.month,
      maxMonth: currentMonthKey(now()),
      availableYears: [...new Set(transactions.map((t) => Number(t.date.slice(0, 4))))],
    });
    summaryCards.update({ summary, counts, currency, locale });
    form.update({
      categories,
      month: ui.month,
      lastCategory: preferences.lastCategory,
      editing,
      currencySymbol: currencySymbol(currency, locale),
      maxDate: todayKey(now()),
    });
    for (const type of TYPES) {
      // Drop a stale filter (category deleted, or of the wrong type).
      const selectedId = ui.selectedCategory[type];
      if (selectedId && !categories.some((c) => c.id === selectedId && c.type === type)) ui.selectedCategory[type] = null;
      const selectedCategory = categories.find((c) => c.id === ui.selectedCategory[type]) || null;

      const ofType = inMonth.filter((t) => t.type === type);
      const listed = sortTransactions(
        selectedCategory ? ofType.filter((t) => t.categoryId === selectedCategory.id) : ofType,
        preferences.gridSort,
        categories,
      );

      charts[type].update({ slices: totalsByCategory(inMonth, categories, type), selectedCategoryId: ui.selectedCategory[type], currency, locale });
      grids[type].update({ transactions: listed, categories, month: ui.month, selectedCategory, sort: preferences.gridSort, currency, locale, editingId: ui.editingId });
    }
    settings.update({ preferences, categories });
    exportDialog.update({ transactions, categories, preferences, selectedMonth: ui.month, maxMonth: currentMonthKey(now()) });
  }

  render();

  return {
    render,
    store,
    /** Exposed for tests. */
    get ui() {
      return { ...ui, selectedCategory: { ...ui.selectedCategory } };
    },
  };
}

function currencySymbol(currency, locale) {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(1);
    return parts.find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

function downloadBytes(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
