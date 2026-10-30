import { DEFAULT_CATEGORY } from './data/categories.js';
import { generateMockTasks, isMockTask } from './data/mockData.js';
import { currentMonthKey, isValidMonthKey, monthKeyOf, todayKey } from './lib/dates.js';
import { filterTasks, overdueOutsideMonth, sortTasks, summarizeTasks, tasksByCategory, tasksInMonth } from './lib/stats.js';
import { createStore } from './store/store.js';
import { createCategoryChart } from './ui/categoryChart.js';
import { createDashboard } from './ui/dashboard.js';
import { h, icon } from './ui/dom.js';
import { createExportDialog } from './ui/exportDialog.js';
import { createMonthPicker } from './ui/monthPicker.js';
import { createTaskForm } from './ui/taskForm.js';
import { createToaster } from './ui/toast.js';

export const PAGES = ['dashboard', 'new'];

/**
 * Wires the store to the two pages (dashboard, create task). Persistent data
 * lives in the store; transient UI state (current page, selected month,
 * filters) lives here. The dashboard is scoped to the tasks due in the
 * selected month.
 *
 * @param {HTMLElement} rootEl
 * @param {{store?: object, now?: () => Date, onNavigate?: (page: string) => void}} opts
 *   `onNavigate` lets a host (the tab shell) mirror in-app page changes into
 *   the URL; the host calls `showPage()` back when the URL changes.
 */
export function createTodoApp(rootEl, { store = createStore(), now = () => new Date(), onNavigate } = {}) {
  const ui = {
    page: 'dashboard',
    month: currentMonthKey(now()),
    filter: { status: 'all', category: null },
    lastCategory: DEFAULT_CATEGORY,
  };

  // ---- layout --------------------------------------------------------------
  rootEl.classList.add('todo');
  const pickerHost = h('div', { class: 'todo-topbar__picker' });
  const topbarAction = h('div', { class: 'todo-topbar__actions' });
  const dashboardHost = h('div', { class: 'todo-page', 'data-page': 'dashboard' });
  const createHost = h('div', { class: 'todo-page todo-page--narrow', 'data-page': 'new', hidden: true });
  const storageWarning = h('p', { class: 'todo-banner todo-banner--warning', hidden: true, role: 'alert' }, 'Changes could not be saved — your browser storage may be full or blocked.');

  rootEl.append(
    h(
      'header',
      { class: 'todo-topbar' },
      h('div', { class: 'todo-topbar__brand' }, h('span', { class: 'todo-topbar__logo' }, icon('listChecks', 22)), h('h1', { class: 'todo-topbar__title' }, 'Todo Manager')),
      h('nav', { class: 'todo-topbar__nav', 'aria-label': 'Todo pages' }, pageLink('dashboard', 'Dashboard'), pageLink('new', 'Create task')),
      pickerHost,
      topbarAction,
    ),
    storageWarning,
    h('main', { class: 'todo-layout' }, dashboardHost, createHost),
    h('footer', { class: 'todo-footer' }, 'Tasks are stored locally in your browser, separately from your expenses.'),
  );

  const toaster = createToaster(rootEl);

  function pageLink(page, label) {
    return h('button', { type: 'button', class: 'todo-topbar__link', 'data-page-link': page, onclick: () => navigate(page) }, label);
  }

  // ---- month picker --------------------------------------------------------
  const monthPicker = createMonthPicker(pickerHost, {
    now,
    onChange: (month) => {
      setMonth(month);
      render();
    },
  });

  function setMonth(month) {
    if (isValidMonthKey(month)) ui.month = month;
  }

  // ---- sample data toggle --------------------------------------------------
  const sampleLabel = h('span', {}, 'Load sample data');
  const sampleBtn = h(
    'button',
    {
      type: 'button',
      class: 'todo-btn todo-btn--sm todo-sample-toggle',
      'data-testid': 'todo-sample-data-toggle',
      'aria-pressed': 'false',
      title: 'Adds sample tasks for last month, this month and next month. Click again to remove them.',
      onclick: () => {
        const hasMock = store.getState().tasks.some(isMockTask);
        try {
          if (hasMock) {
            const removed = store.removeTasksWhere(isMockTask);
            toaster.show(`Removed ${removed.length} sample tasks`, { duration: 3000 });
          } else {
            const added = store.addTasks(generateMockTasks({ now: now() }));
            toaster.show(`Added ${added.length} sample tasks across last month, this month and next month`, { tone: 'success', duration: 3500 });
            setMonth(currentMonthKey(now())); // where most of them are
          }
        } catch (err) {
          toaster.show(err.message || 'Could not update sample data', { tone: 'error' });
        }
        ui.filter = { status: 'all', category: null };
        render();
      },
    },
    icon('database', 16),
    sampleLabel,
  );
  topbarAction.append(sampleBtn);

  // ---- export ----------------------------------------------------------------
  const exportDialog = createExportDialog(rootEl, {
    now,
    onDownload: (file, { selection, format }) => {
      downloadBytes(file.bytes, file.mime, file.filename);
      toaster.show(`Exported ${selection.totals.count} ${selection.totals.count === 1 ? 'task' : 'tasks'} as ${format === 'pdf' ? 'PDF' : 'Excel'}`, { tone: 'success', duration: 3500 });
    },
    onError: (err) => toaster.show(err.message || 'Export failed', { tone: 'error' }),
  });
  const exportBtn = h(
    'button',
    { type: 'button', class: 'todo-btn todo-btn--sm todo-export-open', 'data-testid': 'todo-export-open', title: 'Export tasks to Excel or PDF', onclick: () => exportDialog.open() },
    icon('download', 16),
    h('span', {}, 'Export'),
  );
  topbarAction.append(exportBtn);

  // ---- pages ---------------------------------------------------------------
  const dashboard = createDashboard(dashboardHost, {
    onToggle: (id) => {
      try {
        const task = store.toggleTask(id);
        render();
        toaster.show(task.completed ? `Completed “${task.name}”` : `Reopened “${task.name}”`, { tone: task.completed ? 'success' : 'neutral', duration: 2500 });
      } catch (err) {
        toaster.show(err.message || 'Could not update task', { tone: 'error' });
      }
    },
    onDelete: (id) => {
      const removed = store.deleteTask(id);
      if (!removed) return;
      render();
      toaster.show(`Deleted “${removed.name}”`, {
        action: 'Undo',
        onAction: () => {
          store.restoreTask(removed);
          render();
        },
        duration: 6000,
      });
    },
    onFilter: (patch) => {
      ui.filter = { ...ui.filter, ...patch };
      render();
    },
    onCreate: () => navigate('new'),
    onGoToMonth: (month) => {
      setMonth(month);
      render();
    },
  });

  // Doughnut of the month's tasks by category; selecting a section is the
  // same as picking a category chip, so the two always agree.
  const chart = createCategoryChart(dashboard.chartHost, {
    onSelect: (categoryId) => {
      ui.filter = { ...ui.filter, category: categoryId };
      render();
    },
  });

  const form = createTaskForm(createHost, {
    onSubmit: (payload) => {
      try {
        const task = store.addTask(payload);
        ui.lastCategory = task.category;
        // Make sure the new task is actually visible on the dashboard: clear
        // the filters and follow it to its month.
        ui.filter = { status: 'all', category: null };
        setMonth(monthKeyOf(task.endDate));
        render();
        toaster.show(`Task “${task.name}” created`, { tone: 'success', duration: 3000 });
        navigate('dashboard');
        return true;
      } catch (err) {
        toaster.show(err.message || 'Could not save task', { tone: 'error' });
        return false;
      }
    },
    onCancel: () => navigate('dashboard'),
  });

  // ---- navigation ----------------------------------------------------------
  function showPage(page) {
    if (!PAGES.includes(page)) page = 'dashboard';
    const changed = ui.page !== page;
    ui.page = page;
    dashboardHost.hidden = page !== 'dashboard';
    createHost.hidden = page !== 'new';
    for (const link of rootEl.querySelectorAll('[data-page-link]')) {
      const active = link.dataset.pageLink === page;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (changed && page === 'new') form.focus();
    return page;
  }

  /** Switch page and let the host (if any) mirror it into the URL. */
  function navigate(page) {
    showPage(page);
    onNavigate?.(ui.page);
  }

  // ---- render --------------------------------------------------------------
  function render() {
    const { tasks } = store.getState();
    const today = todayKey(now());

    storageWarning.hidden = !store.saveFailed;

    const hasMock = tasks.some(isMockTask);
    sampleLabel.textContent = hasMock ? 'Remove sample data' : 'Load sample data';
    sampleBtn.setAttribute('aria-label', sampleLabel.textContent); // text is hidden on phones
    sampleBtn.setAttribute('aria-pressed', hasMock ? 'true' : 'false');
    sampleBtn.classList.toggle('is-active', hasMock);

    monthPicker.update({
      month: ui.month,
      availableYears: [...new Set(tasks.map((t) => Number(t.endDate.slice(0, 4))))],
    });

    const inMonth = tasksInMonth(tasks, ui.month);
    // The chart follows the status filter (so it never disagrees with the
    // list) but not the category filter, which it is the control for.
    const charted = filterTasks(inMonth, { status: ui.filter.status });
    chart.update({
      slices: tasksByCategory(charted, today),
      selectedCategoryId: ui.filter.category,
      month: ui.month,
      scopeLabel: ui.filter.status === 'open' ? 'Open tasks' : ui.filter.status === 'completed' ? 'Completed tasks' : 'All tasks',
    });
    dashboard.update({
      tasks: sortTasks(filterTasks(inMonth, ui.filter)),
      summary: summarizeTasks(inMonth, today),
      filter: ui.filter,
      month: ui.month,
      today,
      hasAnyTasks: inMonth.length > 0,
      overdueElsewhere: overdueOutsideMonth(tasks, ui.month, today),
    });
    form.update({ today, month: ui.month, lastCategory: ui.lastCategory });
    exportDialog.update({ tasks, selectedMonth: ui.month, today });
  }

  render();
  showPage('dashboard');

  return {
    render,
    showPage,
    store,
    /** Exposed for tests. */
    get ui() {
      return { ...ui, filter: { ...ui.filter } };
    },
  };
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
