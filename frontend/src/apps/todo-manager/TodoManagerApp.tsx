import { useEffect, useMemo, useRef, useState } from 'react';
import { useNow } from '@shared/hooks/useNow';
import { useStore } from '@shared/hooks/useStore';
import { downloadBytes } from '@shared/lib/download';
import { Icon } from '@shared/ui/Icon';
import { ToastProvider, useToaster } from '@shared/ui/Toast';
import { useTheme } from '@/shell/theme';
import { CategoryChart } from './components/CategoryChart';
import { Dashboard } from './components/Dashboard';
import { ExportDialog } from './components/ExportDialog';
import { MonthPicker } from './components/MonthPicker';
import { TaskForm, type TaskFormHandle } from './components/TaskForm';
import { DEFAULT_CATEGORY } from './data/categories';
import { generateMockTasks, isMockTask } from './data/mockData';
import { currentMonthKey, isValidMonthKey, monthKeyOf, todayKey } from './lib/dates';
import { filterTasks, overdueOutsideMonth, sortTasks, summarizeTasks, tasksByCategory, tasksInMonth } from './lib/stats';
import { createStore, type TodoStore } from './store/store';
import type { TaskCategoryId, TaskFilter } from './types';
import './styles/todo.css';

export const TODO_PAGES = ['dashboard', 'new'] as const;
export type TodoPage = (typeof TODO_PAGES)[number];

export interface TodoManagerAppProps {
  store?: TodoStore;
  /** Page to show; controlled by the host (the shell mirrors it into the URL). */
  page?: TodoPage;
  /** Called when the app itself navigates (e.g. "New task" button, or after creating a task). */
  onNavigate?: (page: TodoPage) => void;
}

/** Tab 2: the local-first Todo Manager. */
export function TodoManagerApp({ store, page, onNavigate }: TodoManagerAppProps) {
  const [ownStore] = useState(() => store ?? createStore());
  return (
    <div className="todo">
      <ToastProvider>
        <TodoManager store={store ?? ownStore} page={page} onNavigate={onNavigate} />
      </ToastProvider>
    </div>
  );
}

function TodoManager({ store, page: controlledPage, onNavigate }: { store: TodoStore } & Pick<TodoManagerAppProps, 'page' | 'onNavigate'>) {
  const now = useNow();
  const theme = useTheme();
  const toaster = useToaster();
  const { tasks } = useStore(store);
  const today = todayKey(now());
  const thisMonth = currentMonthKey(now());

  // The host (hash router) owns the page when it passes one; otherwise the app does.
  const [ownPage, setOwnPage] = useState<TodoPage>('dashboard');
  const page: TodoPage = controlledPage ?? ownPage;
  const [month, setMonthState] = useState(thisMonth);
  const [filter, setFilter] = useState<TaskFilter>({ status: 'all', category: null });
  const [lastCategory, setLastCategory] = useState<TaskCategoryId>(DEFAULT_CATEGORY);
  const [exportOpen, setExportOpen] = useState(false);
  const formRef = useRef<TaskFormHandle>(null);

  // Focus the name field whenever the create page is opened.
  useEffect(() => {
    if (page === 'new') formRef.current?.focus();
  }, [page]);

  const setMonth = (next: string) => {
    if (isValidMonthKey(next)) setMonthState(next);
  };

  function navigate(next: TodoPage) {
    const target = TODO_PAGES.includes(next) ? next : 'dashboard';
    setOwnPage(target);
    onNavigate?.(target);
  }

  const hasMock = tasks.some(isMockTask);
  const sampleLabel = hasMock ? 'Remove sample data' : 'Load sample data';
  const inMonth = useMemo(() => tasksInMonth(tasks, month), [tasks, month]);
  const availableYears = useMemo(() => [...new Set(tasks.map((t) => Number(t.endDate.slice(0, 4))))], [tasks]);
  // The chart follows the status filter (so it never disagrees with the
  // list) but not the category filter, which it is the control for.
  const charted = filterTasks(inMonth, { status: filter.status });
  const scopeLabel = filter.status === 'open' ? 'Open tasks' : filter.status === 'completed' ? 'Completed tasks' : 'All tasks';

  function toggleSampleData() {
    try {
      if (hasMock) {
        const removed = store.removeTasksWhere(isMockTask);
        toaster.show(`Removed ${removed.length} sample tasks`, { duration: 3000 });
      } else {
        const added = store.addTasks(generateMockTasks({ now: now() }));
        toaster.show(`Added ${added.length} sample tasks across last month, this month and next month`, { tone: 'success', duration: 3500 });
        setMonth(thisMonth); // where most of them are
      }
    } catch (err) {
      toaster.show(err instanceof Error ? err.message : 'Could not update sample data', { tone: 'error' });
    }
    setFilter({ status: 'all', category: null });
  }

  const pageLink = (target: TodoPage, label: string) => (
    <button type="button" className={`todo-topbar__link${page === target ? ' is-active' : ''}`} data-page-link={target} aria-current={page === target ? 'page' : undefined} onClick={() => navigate(target)}>
      {label}
    </button>
  );

  return (
    <>
      <header className="todo-topbar">
        <div className="todo-topbar__brand">
          <span className="todo-topbar__logo">
            <Icon name="listChecks" size={22} />
          </span>
          <h1 className="todo-topbar__title">Todo Manager</h1>
        </div>
        <nav className="todo-topbar__nav" aria-label="Todo pages">
          {pageLink('dashboard', 'Dashboard')}
          {pageLink('new', 'Create task')}
        </nav>
        <div className="todo-topbar__picker">
          <MonthPicker month={month} currentMonth={thisMonth} availableYears={availableYears} onChange={setMonth} />
        </div>
        <div className="todo-topbar__actions">
          <button
            type="button"
            className={`todo-btn todo-btn--sm todo-sample-toggle${hasMock ? ' is-active' : ''}`}
            data-testid="todo-sample-data-toggle"
            aria-pressed={hasMock ? 'true' : 'false'}
            aria-label={sampleLabel}
            title="Adds sample tasks for last month, this month and next month. Click again to remove them."
            onClick={toggleSampleData}
          >
            <Icon name="database" size={16} />
            <span>{sampleLabel}</span>
          </button>
          <button type="button" className="todo-btn todo-btn--sm todo-export-open" data-testid="todo-export-open" title="Export tasks to Excel or PDF" onClick={() => setExportOpen(true)}>
            <Icon name="download" size={16} />
            <span>Export</span>
          </button>
        </div>
      </header>

      <p className="todo-banner todo-banner--warning" hidden={!store.saveFailed} role="alert">
        Changes could not be saved — your browser storage may be full or blocked.
      </p>

      <main className="todo-layout">
        <div className="todo-page" data-page="dashboard" hidden={page !== 'dashboard'}>
          <Dashboard
            tasks={sortTasks(filterTasks(inMonth, filter))}
            summary={summarizeTasks(inMonth, today)}
            filter={filter}
            month={month}
            today={today}
            hasAnyTasks={inMonth.length > 0}
            overdueElsewhere={overdueOutsideMonth(tasks, month, today)}
            chart={<CategoryChart slices={tasksByCategory(charted, today)} selectedCategoryId={filter.category} month={month} scopeLabel={scopeLabel} theme={theme} onSelect={(category) => setFilter((f) => ({ ...f, category: category as TaskCategoryId | null }))} />}
            onToggle={(id) => {
              try {
                const task = store.toggleTask(id);
                toaster.show(task.completed ? `Completed “${task.name}”` : `Reopened “${task.name}”`, { tone: task.completed ? 'success' : 'neutral', duration: 2500 });
              } catch (err) {
                toaster.show(err instanceof Error ? err.message : 'Could not update task', { tone: 'error' });
              }
            }}
            onDelete={(id) => {
              const removed = store.deleteTask(id);
              if (!removed) return;
              toaster.show(`Deleted “${removed.name}”`, { action: 'Undo', onAction: () => store.restoreTask(removed), duration: 6000 });
            }}
            onFilter={(patch) => setFilter((f) => ({ ...f, ...patch }))}
            onCreate={() => navigate('new')}
            onGoToMonth={setMonth}
          />
        </div>
        <div className="todo-page todo-page--narrow" data-page="new" hidden={page !== 'new'}>
          <TaskForm
            ref={formRef}
            today={today}
            month={month}
            lastCategory={lastCategory}
            onSubmit={(payload) => {
              try {
                const task = store.addTask(payload);
                setLastCategory(task.category);
                // Make sure the new task is actually visible on the dashboard: clear
                // the filters and follow it to its month.
                setFilter({ status: 'all', category: null });
                setMonth(monthKeyOf(task.endDate));
                toaster.show(`Task “${task.name}” created`, { tone: 'success', duration: 3000 });
                navigate('dashboard');
                return true;
              } catch (err) {
                toaster.show(err instanceof Error ? err.message : 'Could not save task', { tone: 'error' });
                return false;
              }
            }}
            onCancel={() => navigate('dashboard')}
          />
        </div>
      </main>
      <footer className="todo-footer">Tasks are stored locally in your browser, separately from your expenses.</footer>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tasks={tasks}
        selectedMonth={month}
        today={today}
        now={now}
        onDownload={(file, { selection, format }) => {
          downloadBytes(file.bytes, file.mime, file.filename);
          toaster.show(`Exported ${selection.totals.count} ${selection.totals.count === 1 ? 'task' : 'tasks'} as ${format === 'pdf' ? 'PDF' : 'Excel'}`, { tone: 'success', duration: 3500 });
        }}
        onError={(err) => toaster.show(err.message || 'Export failed', { tone: 'error' })}
      />
    </>
  );
}
