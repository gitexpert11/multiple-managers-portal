import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNow } from '@shared/hooks/useNow';
import { useStore } from '@shared/hooks/useStore';
import { downloadBytes } from '@shared/lib/download';
import { Icon } from '@shared/ui/Icon';
import { ToastProvider, useToaster } from '@shared/ui/Toast';
import { useTheme } from '@/shell/theme';
import { CategoryChart } from './components/CategoryChart';
import { ExportDialog } from './components/ExportDialog';
import { MonthPicker } from './components/MonthPicker';
import { SettingsDialog } from './components/SettingsDialog';
import { SummaryCards } from './components/SummaryCards';
import { TransactionForm, type TransactionFormHandle } from './components/TransactionForm';
import { TransactionGrid } from './components/TransactionGrid';
import { generateMockTransactions, isMockTransaction } from './data/mockData';
import { clampMonthKey, currentMonthKey, monthKeyOf, todayKey } from './lib/dates';
import { currencySymbol, formatMoney } from './lib/money';
import { sortTransactions, summarize, totalsByCategory, transactionsInMonth } from './lib/stats';
import { createStore, type ExpenseStore } from './store/store';
import type { TxType } from './types';
import './styles/layout.css';
import './styles/components.css';

const TYPES: TxType[] = ['expense', 'income'];

export interface ExpenseTrackerAppProps {
  /** Inject a store (e.g. backed by a memory backend in tests); a localStorage one is created otherwise. */
  store?: ExpenseStore;
}

/** Tab 1: the local-first Expense Tracker. */
export function ExpenseTrackerApp({ store }: ExpenseTrackerAppProps) {
  const [ownStore] = useState(() => store ?? createStore());
  return (
    <ToastProvider>
      <ExpenseTracker store={store ?? ownStore} />
    </ToastProvider>
  );
}

function ExpenseTracker({ store }: { store: ExpenseStore }) {
  const now = useNow();
  const theme = useTheme();
  const toaster = useToaster();
  const state = useStore(store);
  const { transactions, categories, preferences } = state;
  const { currency, locale } = preferences;

  const thisMonth = currentMonthKey(now());
  const [month, setMonthState] = useState(thisMonth);
  // One independent category filter per type: picking an expense category
  // never hides income rows, and vice versa.
  const [selectedCategory, setSelectedCategory] = useState<Record<TxType, string | null>>({ expense: null, income: null });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const formRef = useRef<TransactionFormHandle>(null);
  const formHostRef = useRef<HTMLDivElement>(null);
  const gridRefs = { expense: useRef<HTMLDivElement>(null), income: useRef<HTMLDivElement>(null) };

  const clearSelections = () => setSelectedCategory({ expense: null, income: null });
  const setMonth = (next: string) => setMonthState(clampMonthKey(next, currentMonthKey(now())));

  // ---- keyboard shortcut: N focuses the amount field -------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      // Only while this tab is visible.
      if (formHostRef.current?.closest('[hidden]')) return;
      e.preventDefault();
      formRef.current?.focusAmount();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ---- derived data -------------------------------------------------------------
  const effectiveMonth = clampMonthKey(month, thisMonth);
  const inMonth = useMemo(() => transactionsInMonth(transactions, effectiveMonth), [transactions, effectiveMonth]);
  const summary = summarize(inMonth);
  const counts = { income: inMonth.filter((t) => t.type === 'income').length, expenses: inMonth.filter((t) => t.type === 'expense').length };
  const editing = editingId ? (transactions.find((t) => t.id === editingId) ?? null) : null;
  const availableYears = useMemo(() => [...new Set(transactions.map((t) => Number(t.date.slice(0, 4))))], [transactions]);
  const hasMock = transactions.some(isMockTransaction);

  const selectCategory = useCallback((type: TxType, categoryId: string | null) => {
    setSelectedCategory((prev) => ({ ...prev, [type]: categoryId }));
    if (categoryId) gridRefs[type].current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- actions ------------------------------------------------------------------
  function toggleSampleData() {
    try {
      if (hasMock) {
        const removed = store.removeTransactionsWhere(isMockTransaction);
        toaster.show(`Removed ${removed.length} sample transactions`, { duration: 3000 });
      } else {
        const added = store.addTransactions(generateMockTransactions({ now: now() }));
        toaster.show(`Added ${added.length} sample transactions across the last 2 years`, { tone: 'success', duration: 3500 });
      }
    } catch (err) {
      toaster.show(err instanceof Error ? err.message : 'Could not update sample data', { tone: 'error' });
    }
    clearSelections();
    setEditingId(null);
  }

  const sampleLabel = hasMock ? 'Remove sample data' : 'Load sample data';

  return (
    <>
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">
            <Icon name="wallet" size={22} />
          </span>
          <h1 className="topbar__title">Expense Tracker</h1>
        </div>
        <div className="topbar__picker">
          <MonthPicker
            month={effectiveMonth}
            maxMonth={thisMonth}
            currentMonth={thisMonth}
            availableYears={availableYears}
            onChange={(m) => {
              setMonth(m);
              clearSelections();
            }}
          />
        </div>
        <div className="topbar__actions">
          <button
            type="button"
            className={`btn btn--sm sample-toggle${hasMock ? ' is-active' : ''}`}
            data-testid="sample-data-toggle"
            aria-pressed={hasMock ? 'true' : 'false'}
            aria-label={sampleLabel}
            title="Adds two years of sample transactions for trying out the UI. Click again to remove them."
            onClick={toggleSampleData}
          >
            <Icon name="database" size={16} />
            <span>{sampleLabel}</span>
          </button>
          <button type="button" className="btn btn--sm" data-testid="export-open" title="Export transactions to Excel or PDF" onClick={() => setExportOpen(true)}>
            <Icon name="download" size={16} />
            <span>Export</span>
          </button>
          <button type="button" className="icon-btn" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" size={20} />
          </button>
        </div>
      </header>

      <p className="banner banner--warning" hidden={!store.saveFailed} role="alert">
        Changes could not be saved — your browser storage may be full or blocked.
      </p>

      <main className="layout">
        <SummaryCards summary={summary} counts={counts} currency={currency} locale={locale} />
        <div className="layout__row">
          <div className="layout__form" ref={formHostRef}>
            <TransactionForm
              ref={formRef}
              categories={categories}
              month={effectiveMonth}
              lastCategory={preferences.lastCategory}
              editing={editing}
              currencySymbol={currencySymbol(currency, locale)}
              maxDate={todayKey(now())}
              now={now}
              onSubmit={(payload, id) => {
                try {
                  if (id) {
                    store.updateTransaction(id, payload);
                    setEditingId(null);
                    toaster.show('Transaction updated', { tone: 'success', duration: 2500 });
                  } else {
                    const tx = store.addTransaction(payload);
                    toaster.show(`${tx.type === 'income' ? 'Income' : 'Expense'} of ${formatMoney(tx.amount, preferences)} added`, { tone: 'success', duration: 2500 });
                    // If the user entered a date outside the selected month, follow it so the entry is visible.
                    if (monthKeyOf(tx.date) !== effectiveMonth) {
                      setMonth(monthKeyOf(tx.date));
                      clearSelections();
                    }
                  }
                  return true;
                } catch (err) {
                  toaster.show(err instanceof Error ? err.message : 'Could not save transaction', { tone: 'error' });
                  return false;
                }
              }}
              onCancelEdit={() => setEditingId(null)}
              onAddCategory={(name, type) => {
                try {
                  return store.addCategory({ name, type });
                } catch (err) {
                  toaster.show(err instanceof Error ? err.message : 'Could not add category', { tone: 'error' });
                  return null;
                }
              }}
            />
          </div>
          <div className="layout__charts">
            {TYPES.map((type) => (
              <CategoryChart
                key={type}
                type={type}
                slices={totalsByCategory(inMonth, categories, type)}
                selectedCategoryId={selectedCategory[type]}
                currency={currency}
                locale={locale}
                theme={theme}
                onSelect={(id) => selectCategory(type, id)}
              />
            ))}
          </div>
        </div>
        {TYPES.map((type) => {
          // Drop a stale filter (category deleted, or of the wrong type).
          const selectedId = selectedCategory[type];
          const selected = (selectedId && categories.find((c) => c.id === selectedId && c.type === type)) || null;
          const ofType = inMonth.filter((t) => t.type === type);
          const listed = sortTransactions(selected ? ofType.filter((t) => t.categoryId === selected.id) : ofType, preferences.gridSort, categories);
          return (
            <div key={type} className="layout__grid" ref={gridRefs[type]}>
              <TransactionGrid
                type={type}
                transactions={listed}
                categories={categories}
                month={effectiveMonth}
                selectedCategory={selected}
                sort={preferences.gridSort}
                currency={currency}
                locale={locale}
                editingId={editingId}
                onEdit={(id) => {
                  setEditingId(id);
                  formHostRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                }}
                onDelete={(id) => {
                  const removed = store.deleteTransaction(id);
                  if (!removed) return;
                  if (editingId === id) setEditingId(null);
                  toaster.show('Transaction deleted', {
                    action: 'Undo',
                    onAction: () => store.restoreTransaction(removed),
                    duration: 6000,
                  });
                }}
                // Sorting is a shared preference so both grids stay consistent.
                onSort={(gridSort) => store.setPreferences({ gridSort })}
                // Toggle: clicking the already-selected category's pill clears it.
                onSelectCategory={(categoryId) => selectCategory(type, selectedCategory[type] === categoryId ? null : categoryId)}
              />
            </div>
          );
        })}
      </main>
      <footer className="footer">
        Data is stored locally in your browser · Press <kbd>N</kbd> to jump to the amount field
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
        categories={categories}
        onPreferences={(patch) => store.setPreferences(patch)}
        onExport={() => downloadBytes(JSON.stringify(store.exportData(), null, 2), 'application/json', `expense-tracker-${now().toISOString().slice(0, 10)}.json`)}
        onImport={(data) => {
          try {
            if (!data) throw new Error('That file is not valid JSON');
            const count = (data as { transactions?: unknown[] }).transactions?.length ?? 0;
            if (!window.confirm(`Import ${count} transactions? This replaces your current data.`)) return;
            store.importData(data);
            clearSelections();
            setEditingId(null);
            toaster.show(`Imported ${count} transactions`, { tone: 'success' });
          } catch (err) {
            toaster.show(err instanceof Error ? err.message : 'Import failed', { tone: 'error' });
          }
        }}
        onReset={() => {
          store.clearAll();
          clearSelections();
          setEditingId(null);
          toaster.show('All data deleted');
        }}
        onDeleteCategory={(id) => {
          store.deleteCategory(id);
          setSelectedCategory((prev) => ({ expense: prev.expense === id ? null : prev.expense, income: prev.income === id ? null : prev.income }));
        }}
        onRenameCategory={(id, name) => store.renameCategory(id, name)}
      />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        transactions={transactions}
        categories={categories}
        preferences={preferences}
        selectedMonth={effectiveMonth}
        maxMonth={thisMonth}
        now={now}
        onDownload={(file, { selection, format }) => {
          downloadBytes(file.bytes, file.mime, file.filename);
          toaster.show(`Exported ${selection.totals.count} transactions as ${format === 'pdf' ? 'PDF' : 'Excel'}`, { tone: 'success', duration: 3500 });
        }}
        onError={(err) => toaster.show(err.message || 'Export failed', { tone: 'error' })}
      />
    </>
  );
}
