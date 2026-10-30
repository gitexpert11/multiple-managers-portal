/**
 * Integration tests: mount the real Todo Manager in jsdom and drive it
 * through the DOM — create tasks on the create page, see them on the
 * dashboard, complete/delete/filter them, and reload to prove persistence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTodoApp } from '../src/app.js';
import { generateMockTasks, isMockTask } from '../src/data/mockData.js';
import { createMemoryBackend, createStorage, STORAGE_KEY } from '../src/store/storage.js';
import { createStore } from '../src/store/store.js';

const NOW = new Date(2025, 2, 15, 10); // 15 March 2025

let root;
let app;
let backend;
let navigations;

function mount(options = {}) {
  root = document.createElement('div');
  document.body.append(root);
  const store = createStore({ storage: createStorage(backend) });
  navigations = [];
  app = createTodoApp(root, { store, now: () => NOW, onNavigate: (p) => navigations.push(p), ...options });
  return app;
}

function q(sel) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function setValue(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function submitForm() {
  q('form.todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function createTask({ name, description = '', endDate, category } = {}) {
  app.showPage('new');
  if (name !== undefined) setValue(q('#task-name'), name);
  setValue(q('#task-description'), description);
  if (endDate !== undefined) setValue(q('#task-end-date'), endDate);
  if (category) {
    const radio = q(`#task-category-${category}`);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
  submitForm();
}

const tasksPanel = () => q('[data-testid=todo-tasks]');
const items = () => [...root.querySelectorAll('.todo-list .todo-item')];
const names = () => items().map((li) => li.querySelector('.todo-item__name').textContent);
const summary = (kind) => q(`[data-testid=todo-summary-${kind}]`).textContent;
const dashboardPage = () => q('[data-page=dashboard]');
const createPage = () => q('[data-page=new]');
const toasts = () => [...root.querySelectorAll('.todo-toast')].map((t) => t.querySelector('.todo-toast__message').textContent);
const monthLabelText = () => q('.todo-month-picker__label').textContent;
const chartPanel = () => q('[data-testid=todo-chart]');
const legendItems = () => [...chartPanel().querySelectorAll('.todo-chart-legend__item[data-category-id]')];
const legendItem = (id) => chartPanel().querySelector(`.todo-chart-legend__item[data-category-id="${id}"]`);
const legendAll = () => chartPanel().querySelector('.todo-chart-legend__item--all');
const chip = (id) => q(`.todo-chip[data-category="${id}"]`);
const prevMonth = () => q('[aria-label="Previous month"]').click();
const nextMonth = () => q('[aria-label="Next month"]').click();
const sampleBtn = () => q('[data-testid=todo-sample-data-toggle]');

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  backend = createMemoryBackend();
  mount();
});

afterEach(() => {
  root.remove();
  vi.useRealTimers();
});

describe('initial render', () => {
  it('opens on the dashboard with an empty state and zeroed summary', () => {
    expect(dashboardPage().hidden).toBe(false);
    expect(createPage().hidden).toBe(true);
    expect(app.ui.page).toBe('dashboard');
    expect(tasksPanel().querySelector('.todo-empty').hidden).toBe(false);
    expect(tasksPanel().querySelector('.todo-empty').textContent).toContain('No tasks due in March 2025');
    expect(q('.todo-list').hidden).toBe(true);
    for (const kind of ['open', 'due-today', 'overdue', 'completed']) expect(summary(kind)).toBe('0');
    expect(root.querySelector('[data-page-link=dashboard]').getAttribute('aria-current')).toBe('page');
  });

  it('adds the `todo` scope class and its own top bar', () => {
    expect(root.classList.contains('todo')).toBe(true);
    expect(q('.todo-topbar__title').textContent).toBe('Todo Manager');
  });
});

describe('navigation between the two pages', () => {
  it('switches to the create page via the "New task" button and focuses the name field', () => {
    q('[data-testid=todo-new-task]').click();
    expect(app.ui.page).toBe('new');
    expect(createPage().hidden).toBe(false);
    expect(dashboardPage().hidden).toBe(true);
    expect(document.activeElement).toBe(q('#task-name'));
    expect(navigations).toEqual(['new']);
    expect(root.querySelector('[data-page-link=new]').getAttribute('aria-current')).toBe('page');
  });

  it('switches via the top-bar links and the empty-state button', () => {
    tasksPanel().querySelector('.todo-empty .todo-btn--primary').click();
    expect(app.ui.page).toBe('new');
    q('[data-page-link=dashboard]').click();
    expect(app.ui.page).toBe('dashboard');
    q('[data-page-link=new]').click();
    expect(app.ui.page).toBe('new');
    expect(navigations).toEqual(['new', 'dashboard', 'new']);
  });

  it('Cancel returns to the dashboard without creating anything', () => {
    app.showPage('new');
    setValue(q('#task-name'), 'Half typed');
    q('.todo-form__actions .todo-btn--ghost').click();
    expect(app.ui.page).toBe('dashboard');
    expect(app.store.getState().tasks).toEqual([]);
  });

  it('showPage() is driven by the host and ignores unknown pages', () => {
    expect(app.showPage('new')).toBe('new');
    expect(app.showPage('bogus')).toBe('dashboard');
    expect(dashboardPage().hidden).toBe(false);
    expect(navigations).toEqual([]); // host-driven changes are not echoed back
  });
});

describe('create task page', () => {
  it('pre-fills the end date with today, caps it at today and defaults to the first category', () => {
    app.showPage('new');
    expect(q('#task-end-date').value).toBe('2025-03-15');
    expect(q('#task-end-date').min).toBe('2025-03-15');
    expect(q('#task-category-office').checked).toBe(true);
  });

  it('creates a task with every field and shows it on the dashboard', () => {
    createTask({ name: 'Book flights', description: 'Compare prices first', endDate: '2025-03-20', category: 'travel' });

    expect(app.ui.page).toBe('dashboard');
    expect(navigations.at(-1)).toBe('dashboard');
    expect(names()).toEqual(['Book flights']);
    const li = items()[0];
    expect(li.querySelector('.todo-item__desc').textContent).toBe('Compare prices first');
    expect(li.querySelector('.todo-category-pill').textContent).toBe('Travel');
    expect(li.querySelector('time').getAttribute('datetime')).toBe('2025-03-20');
    expect(li.querySelector('time').textContent).toBe('Mar 20, 2025');
    expect(li.querySelector('.todo-badge').textContent).toBe('5 days left');
    expect(li.dataset.status).toBe('upcoming');
    expect(summary('open')).toBe('1');
    expect(toasts()).toContain('Task “Book flights” created');

    const stored = app.store.getState().tasks[0];
    expect(stored).toMatchObject({ name: 'Book flights', description: 'Compare prices first', endDate: '2025-03-20', category: 'travel', completed: false });
  });

  it('creates a task with just a name (date defaults to today, category to Office)', () => {
    createTask({ name: 'Call the bank' });
    expect(names()).toEqual(['Call the bank']);
    expect(items()[0].querySelector('.todo-badge').textContent).toBe('Due today');
    expect(items()[0].querySelector('.todo-category-pill').textContent).toBe('Office');
    expect(items()[0].querySelector('.todo-item__desc')).toBeNull();
    expect(summary('due-today')).toBe('1');
  });

  it('resets the form after a successful create and remembers the last category', () => {
    createTask({ name: 'Paint fence', endDate: '2025-03-22', category: 'home', description: 'White' });
    app.showPage('new');
    expect(q('#task-name').value).toBe('');
    expect(q('#task-description').value).toBe('');
    expect(q('#task-end-date').value).toBe('2025-03-15');
    expect(q('#task-category-home').checked).toBe(true);
  });

  it('requires a name and focuses the field', () => {
    createTask({ name: '   ', endDate: '2025-03-20' });
    expect(app.ui.page).toBe('new');
    expect(q('#task-name-error').textContent).toBe('Give the task a name');
    expect(q('#task-name').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(q('#task-name'));
    expect(app.store.getState().tasks).toEqual([]);
    // The error clears as soon as the user starts typing.
    setValue(q('#task-name'), 'Now valid');
    expect(q('#task-name-error').textContent).toBe('');
  });

  it('rejects an empty or past end date', () => {
    createTask({ name: 'Late', endDate: '' });
    expect(q('#task-end-date-error').textContent).toBe('Pick an end date');
    expect(document.activeElement).toBe(q('#task-end-date'));

    createTask({ name: 'Late', endDate: '2025-03-14' });
    expect(q('#task-end-date-error').textContent).toBe('End date cannot be in the past');
    expect(app.store.getState().tasks).toEqual([]);

    createTask({ name: 'On time', endDate: '2025-03-15' });
    expect(app.store.getState().tasks).toHaveLength(1);
    expect(app.ui.page).toBe('dashboard');
  });

  it('reports both errors at once but focuses the first invalid field', () => {
    createTask({ name: '', endDate: '2020-01-01' });
    expect(q('#task-name-error').textContent).not.toBe('');
    expect(q('#task-end-date-error').textContent).not.toBe('');
    expect(document.activeElement).toBe(q('#task-name'));
  });

  it('surfaces store errors as a toast and stays on the page', () => {
    app.showPage('new');
    const spy = vi.spyOn(app.store, 'addTask').mockImplementation(() => {
      throw new Error('Disk is on fire');
    });
    setValue(q('#task-name'), 'Boom');
    submitForm();
    expect(toasts()).toContain('Disk is on fire');
    expect(app.ui.page).toBe('new');
    expect(q('#task-name').value).toBe('Boom'); // not reset
    spy.mockRestore();
  });
});

describe('dashboard', () => {
  beforeEach(() => {
    // The form refuses past dates, so an overdue task can only come from an
    // earlier session: seed it straight into the store, then create the rest via the UI.
    app.store.addTask({ name: 'Overdue report', endDate: '2025-03-10', category: 'office' });
    app.render();
    createTask({ name: 'Dentist', endDate: '2025-03-15', category: 'personal' });
    createTask({ name: 'Fix tap', endDate: '2025-03-18', category: 'home' });
    createTask({ name: 'Visa forms', endDate: '2025-03-28', category: 'travel' });
  });

  it('lists tasks soonest first with status badges and summary counts', () => {
    expect(names()).toEqual(['Overdue report', 'Dentist', 'Fix tap', 'Visa forms']);
    expect(items().map((li) => li.dataset.status)).toEqual(['overdue', 'today', 'upcoming', 'upcoming']);
    expect(items()[0].querySelector('.todo-badge').textContent).toBe('Overdue by 5 days');
    expect(items()[3].querySelector('.todo-badge').textContent).toBe('13 days left');
    expect(summary('open')).toBe('4');
    expect(summary('due-today')).toBe('1');
    expect(summary('overdue')).toBe('1');
    expect(summary('completed')).toBe('0');
    expect(q('.todo-summary-card--overdue').classList.contains('is-alert')).toBe(true);
    expect(tasksPanel().querySelector('.todo-panel__hint').textContent).toBe('March 2025 · 4 tasks');
  });

  it('completes a task via its checkbox, moves it to the bottom, and can reopen it', () => {
    const checkbox = items()[0].querySelector('.todo-item__checkbox');
    expect(checkbox.getAttribute('aria-label')).toBe('Mark "Overdue report" as completed');
    checkbox.click();

    expect(names()).toEqual(['Dentist', 'Fix tap', 'Visa forms', 'Overdue report']);
    const done = items()[3];
    expect(done.classList.contains('is-completed')).toBe(true);
    expect(done.querySelector('.todo-badge').textContent).toBe('Completed');
    expect(done.querySelector('.todo-item__checkbox').checked).toBe(true);
    expect(summary('open')).toBe('3');
    expect(summary('overdue')).toBe('0'); // completed tasks are never overdue
    expect(summary('completed')).toBe('1');
    expect(toasts()).toContain('Completed “Overdue report”');

    done.querySelector('.todo-item__checkbox').click();
    expect(names()[0]).toBe('Overdue report');
    expect(summary('overdue')).toBe('1');
    expect(toasts()).toContain('Reopened “Overdue report”');
  });

  it('deletes a task and offers undo', () => {
    items()[1].querySelector('.todo-icon-btn--danger').click();
    expect(names()).toEqual(['Overdue report', 'Fix tap', 'Visa forms']);
    expect(app.store.getState().tasks).toHaveLength(3);

    const undo = root.querySelector('.todo-toast__action');
    expect(undo.textContent).toContain('Undo');
    undo.click();
    expect(names()).toEqual(['Overdue report', 'Dentist', 'Fix tap', 'Visa forms']);
    expect(app.store.getState().tasks).toHaveLength(4);
  });

  it('filters by status', () => {
    items()[2].querySelector('.todo-item__checkbox').click(); // complete "Fix tap"
    q('#todo-status-open').click();
    expect(app.ui.filter.status).toBe('open');
    expect(names()).toEqual(['Overdue report', 'Dentist', 'Visa forms']);
    q('#todo-status-completed').click();
    expect(names()).toEqual(['Fix tap']);
    q('#todo-status-all').click();
    expect(names()).toHaveLength(4);
  });

  it('filters by category chips and combines with status', () => {
    const chip = (id) => q(`.todo-chip[data-category="${id}"]`);
    chip('home').click();
    expect(names()).toEqual(['Fix tap']);
    expect(chip('home').getAttribute('aria-pressed')).toBe('true');
    expect(chip('').getAttribute('aria-pressed')).toBe('false');
    expect(tasksPanel().querySelector('.todo-panel__hint').textContent).toBe('March 2025 · 1 task matching your filters');

    items()[0].querySelector('.todo-item__checkbox').click();
    q('#todo-status-open').click();
    expect(names()).toEqual([]);
    expect(tasksPanel().querySelector('.todo-empty').hidden).toBe(false);
    expect(tasksPanel().querySelector('.todo-empty').textContent).toContain('No tasks match these filters');

    tasksPanel().querySelector('.todo-empty .todo-btn').click(); // "Clear filters"
    expect(app.ui.filter).toEqual({ status: 'all', category: null });
    expect(names()).toHaveLength(4);
    expect(chip('').getAttribute('aria-pressed')).toBe('true');
  });

  it('clears filters when a new task is created so it is always visible', () => {
    q(`.todo-chip[data-category="travel"]`).click();
    expect(names()).toEqual(['Visa forms']);
    createTask({ name: 'Buy milk', endDate: '2025-03-16', category: 'home' });
    expect(app.ui.filter).toEqual({ status: 'all', category: null });
    expect(names()).toContain('Buy milk');
  });
});

describe('persistence', () => {
  it('writes to its own localStorage key and reloads the same tasks on remount', () => {
    createTask({ name: 'Persist me', endDate: '2025-03-20', category: 'personal', description: 'Survives reload' });
    items()[0].querySelector('.todo-item__checkbox').click();

    expect(backend.getItem(STORAGE_KEY)).not.toBeNull();
    expect(backend.getItem('expense-tracker-ng')).toBeNull();

    const before = app.store.getState().tasks;
    root.remove();
    mount();
    expect(app.store.getState().tasks).toEqual(before);
    expect(names()).toEqual(['Persist me']);
    expect(items()[0].classList.contains('is-completed')).toBe(true);
    expect(summary('completed')).toBe('1');
  });

  it('shows a warning banner when saving fails', () => {
    const failing = createStore({ storage: { load: () => null, save: () => false, clear() {} } });
    root.remove();
    mount({ store: failing });
    expect(q('.todo-banner--warning').hidden).toBe(true);
    createTask({ name: 'Unsaved', endDate: '2025-03-20' });
    expect(q('.todo-banner--warning').hidden).toBe(false);
  });
});

describe('month picker', () => {
  beforeEach(() => {
    app.store.addTask({ name: 'Feb report', endDate: '2025-02-20', category: 'office' }); // last month, overdue
    app.render();
    createTask({ name: 'March dentist', endDate: '2025-03-18', category: 'personal' });
    createTask({ name: 'April flights', endDate: '2025-04-03', category: 'travel' });
    createTask({ name: 'Next year visa', endDate: '2026-01-10', category: 'travel' });
    app.showPage('dashboard');
  });

  it('opens on the current month and only lists tasks due in that month', () => {
    // Creating a task follows it to its month; go back to today first.
    q('.todo-month-picker__today').click();
    expect(app.ui.month).toBe('2025-03');
    expect(monthLabelText()).toBe('March 2025');
    expect(names()).toEqual(['March dentist']);
    expect(summary('open')).toBe('1');
    expect(q('.todo-summary-card--open .todo-summary-card__meta').textContent).toBe('of 1 task in March 2025');
    expect(q('.todo-month-picker__today').hidden).toBe(true);
  });

  it('navigates with previous/next, scoping list, summary and empty state to the month', () => {
    q('.todo-month-picker__today').click();
    prevMonth();
    expect(app.ui.month).toBe('2025-02');
    expect(names()).toEqual(['Feb report']);
    expect(items()[0].dataset.status).toBe('overdue');
    expect(summary('overdue')).toBe('1');
    expect(q('.todo-month-picker__today').hidden).toBe(false);

    nextMonth();
    nextMonth();
    expect(app.ui.month).toBe('2025-04');
    expect(names()).toEqual(['April flights']);
    expect(summary('overdue')).toBe('0');
    expect(summary('open')).toBe('1');

    nextMonth();
    expect(monthLabelText()).toBe('May 2025');
    expect(names()).toEqual([]);
    expect(tasksPanel().querySelector('.todo-empty').textContent).toContain('No tasks due in May 2025');

    q('.todo-month-picker__today').click();
    expect(app.ui.month).toBe('2025-03');
  });

  it('can jump straight to a future month and year via the selects', () => {
    setValue(q('select[aria-label=Year]'), '2026');
    setValue(q('select[aria-label=Month]'), '1');
    expect(app.ui.month).toBe('2026-01');
    expect(names()).toEqual(['Next year visa']);
    // The year list covers the years that have tasks plus a margin around today.
    const years = [...q('select[aria-label=Year]').options].map((o) => o.value);
    expect(years).toContain('2023');
    expect(years).toContain('2027');
  });

  it('keeps the filters while changing month', () => {
    q('.todo-month-picker__today').click();
    q('.todo-chip[data-category="travel"]').click();
    expect(names()).toEqual([]);
    nextMonth();
    expect(app.ui.filter.category).toBe('travel');
    expect(names()).toEqual(['April flights']);
  });

  it('follows a newly created task to its month so it is visible immediately', () => {
    q('.todo-month-picker__today').click();
    createTask({ name: 'Summer trip', endDate: '2025-07-12', category: 'travel' });
    expect(app.ui.page).toBe('dashboard');
    expect(app.ui.month).toBe('2025-07');
    expect(monthLabelText()).toBe('July 2025');
    expect(names()).toEqual(['Summer trip']);
  });

  it('defaults the create form date to the 1st of a future month, and today otherwise', () => {
    q('.todo-month-picker__today').click();
    nextMonth(); // April 2025
    app.showPage('new');
    expect(q('#task-end-date').value).toBe('2025-04-01');
    app.showPage('dashboard');
    prevMonth();
    prevMonth(); // February 2025, in the past
    app.showPage('new');
    expect(q('#task-end-date').value).toBe('2025-03-15');
    // A date the user typed is kept when the month changes.
    setValue(q('#task-end-date'), '2025-03-20');
    app.showPage('dashboard');
    nextMonth();
    nextMonth();
    expect(q('#task-end-date').value).toBe('2025-03-20');
  });

  it('points at overdue tasks that are due in other months, and jumps to them', () => {
    q('.todo-month-picker__today').click();
    const notice = q('[data-testid=todo-overdue-elsewhere]');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('1 overdue task in other months');
    notice.querySelector('.todo-notice__action').click();
    expect(app.ui.month).toBe('2025-02');
    expect(names()).toEqual(['Feb report']);
    expect(notice.hidden).toBe(true); // the overdue task is now on screen

    items()[0].querySelector('.todo-item__checkbox').click(); // complete it
    q('.todo-month-picker__today').click();
    expect(notice.hidden).toBe(true);
  });

  it('ignores an invalid month key', () => {
    const before = app.ui.month;
    const notice = q('[data-testid=todo-overdue-elsewhere]');
    notice.dataset.month = 'garbage';
    notice.querySelector('.todo-notice__action').click();
    expect(app.ui.month).toBe(before);
    expect(monthLabelText()).toBe('January 2026');
  });
});

describe('sample data toggle', () => {
  it('loads sample tasks spanning last/this/next month, lands on the current month, and toggles the label', () => {
    expect(sampleBtn().textContent).toContain('Load sample data');
    expect(sampleBtn().getAttribute('aria-pressed')).toBe('false');

    sampleBtn().click();
    const expected = generateMockTasks({ now: NOW });
    expect(app.store.getState().tasks).toHaveLength(expected.length);
    expect(app.store.getState().tasks.every(isMockTask)).toBe(true);
    expect(app.ui.month).toBe('2025-03');
    expect(sampleBtn().textContent).toContain('Remove sample data');
    expect(sampleBtn().getAttribute('aria-pressed')).toBe('true');
    expect(sampleBtn().classList.contains('is-active')).toBe(true);
    expect(toasts().some((t) => t.startsWith(`Added ${expected.length} sample tasks`))).toBe(true);

    // Every month of the window has rows; the dashboard shows real variety.
    expect(items().length).toBeGreaterThan(0);
    expect(Number(summary('due-today'))).toBeGreaterThan(0);
    prevMonth();
    expect(items().length).toBeGreaterThan(0);
    expect(Number(summary('overdue'))).toBeGreaterThan(0);
    nextMonth();
    nextMonth();
    expect(items().length).toBeGreaterThan(0);
    expect(summary('overdue')).toBe('0');
  });

  it('removes only the sample tasks and keeps user tasks, even after a sample task was completed', () => {
    createTask({ name: 'Mine', endDate: '2025-03-20', category: 'home' });
    sampleBtn().click();
    const total = app.store.getState().tasks.length;
    expect(total).toBeGreaterThan(1);

    // Interact with a sample task: it must still be recognised as sample data.
    const sampleRow = items().find((li) => li.dataset.id.startsWith('mock_'));
    sampleRow.querySelector('.todo-item__checkbox').click();

    sampleBtn().click();
    expect(app.store.getState().tasks.map((t) => t.name)).toEqual(['Mine']);
    expect(sampleBtn().textContent).toContain('Load sample data');
    expect(toasts().some((t) => t.startsWith(`Removed ${total - 1} sample tasks`))).toBe(true);
  });

  it('does not duplicate records when sample ids are already present, and persists across a remount', () => {
    sampleBtn().click();
    const count = app.store.getState().tasks.length;
    app.store.addTasks(generateMockTasks({ now: NOW })); // same ids -> skipped
    expect(app.store.getState().tasks).toHaveLength(count);

    root.remove();
    mount();
    expect(app.store.getState().tasks).toHaveLength(count);
    expect(sampleBtn().textContent).toContain('Remove sample data');
    sampleBtn().click();
    expect(app.store.getState().tasks).toEqual([]);
  });

  it('clears filters when toggling so the result is visible', () => {
    q('.todo-chip[data-category="travel"]').click();
    q('#todo-status-completed').click();
    sampleBtn().click();
    expect(app.ui.filter).toEqual({ status: 'all', category: null });
  });
});

describe('export flow', () => {
  const dialog = () => q('[data-testid=todo-export-dialog]');
  const exportPreview = () => q('[data-testid=todo-export-preview]').textContent;

  beforeEach(() => {
    sampleBtn().click(); // last / this / next month of sample tasks
    q('.todo-month-picker__today').click();
  });

  it('has an Export button next to the sample-data toggle that opens the dialog on the dashboard month', () => {
    const btn = q('[data-testid=todo-export-open]');
    expect(btn.closest('.todo-topbar__actions')).not.toBeNull();
    expect(dialog().open).toBe(false);
    btn.click();
    expect(dialog().open).toBe(true);
    expect(q('#todo-export-start-month').value).toBe('3');
    expect(q('#todo-export-start-year').value).toBe('2025');
    expect(q('#todo-export-end-month').value).toBe('3');
    const inMarch = app.store.getState().tasks.filter((t) => t.endDate.startsWith('2025-03')).length;
    expect(exportPreview()).toMatch(new RegExp(`^${inMarch} tasks · `));
  });

  it('follows the dashboard month: navigating forward then exporting defaults to that month', () => {
    nextMonth();
    q('[data-testid=todo-export-open]').click();
    expect(q('#todo-export-start-month').value).toBe('4');
    const inApril = app.store.getState().tasks.filter((t) => t.endDate.startsWith('2025-04')).length;
    expect(exportPreview()).toMatch(new RegExp(`^${inApril} tasks · `));
  });

  it('downloads an Excel file for the whole sample range and shows a toast', () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:todo');
    const clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push({ href: this.href, download: this.download });
    };
    try {
      q('[data-testid=todo-export-open]').click();
      q('[data-preset=around-now]').click();
      const total = app.store.getState().tasks.length;
      expect(exportPreview()).toMatch(new RegExp(`^${total} tasks · `));
      q('form.todo-export-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      expect(createUrl).toHaveBeenCalledTimes(1);
      const blob = createUrl.mock.calls[0][0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toContain('spreadsheetml');
      expect(clicks).toEqual([{ href: 'blob:todo', download: 'todo-manager_2025-02_to_2025-04_all.xlsx' }]);
      expect(dialog().open).toBe(false);
      expect(toasts()).toContain(`Exported ${total} tasks as Excel`);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
      createUrl.mockRestore();
    }
  });

  it('downloads a PDF of open tasks only', () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:todo');
    const origClick = HTMLAnchorElement.prototype.click;
    const clicks = [];
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(this.download);
    };
    try {
      q('[data-testid=todo-export-open]').click();
      q('#todo-export-scope-open').click();
      q('#todo-export-format-pdf').click();
      q('form.todo-export-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      expect(createUrl.mock.calls[0][0].type).toBe('application/pdf');
      expect(clicks).toEqual(['todo-manager_2025-03_open.pdf']);
      const open = app.store.getState().tasks.filter((t) => t.endDate.startsWith('2025-03') && !t.completed).length;
      expect(toasts()).toContain(`Exported ${open} tasks as PDF`);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
      createUrl.mockRestore();
    }
  });

  it('blocks an invalid range and an empty range', () => {
    q('[data-testid=todo-export-open]').click();
    setValue(q('#todo-export-end-month'), '1');
    expect(q('#todo-export-error').textContent).toMatch(/after the start/);
    expect(q('[data-testid=todo-export-download]').disabled).toBe(true);
    setValue(q('#todo-export-end-month'), '3');
    setValue(q('#todo-export-start-year'), '2027');
    setValue(q('#todo-export-end-year'), '2027');
    expect(exportPreview()).toBe('No tasks in this range.');
    expect(q('[data-testid=todo-export-download]').disabled).toBe(true);
  });

  it('reflects data changes while open (completing a task updates the preview)', () => {
    q('[data-testid=todo-export-open]').click();
    const before = exportPreview();
    const openRow = items().find((li) => li.dataset.status !== 'completed');
    openRow.querySelector('.todo-item__checkbox').click();
    expect(exportPreview()).not.toBe(before);
  });
});

describe('category chart on the dashboard', () => {
  it('sits between the summary cards and the task list, and starts with an empty state', () => {
    const page = dashboardPage();
    const order = [...page.querySelectorAll('.todo-summary, [data-testid=todo-chart], [data-testid=todo-tasks]')].map((el) => el.dataset.testid || 'summary');
    expect(order).toEqual(['summary', 'todo-chart', 'todo-tasks']);
    expect(chartPanel().querySelector('.todo-empty').hidden).toBe(false);
    expect(chartPanel().querySelector('.todo-empty').textContent).toBe('No tasks due in March 2025 to chart.');
    expect(legendItems()).toHaveLength(0);
  });

  describe('with tasks', () => {
    beforeEach(() => {
      app.store.addTask({ name: 'Overdue report', endDate: '2025-03-10', category: 'office' });
      app.render();
      createTask({ name: 'Dentist', endDate: '2025-03-15', category: 'personal' });
      createTask({ name: 'Fix tap', endDate: '2025-03-18', category: 'home' });
      createTask({ name: 'Visa forms', endDate: '2025-03-28', category: 'office' });
      createTask({ name: 'April flights', endDate: '2025-04-03', category: 'travel' });
      q('.todo-month-picker__today').click();
    });

    it('positive: charts the selected month only, largest category first, with a status breakdown per slice', () => {
      expect(legendItems().map((b) => b.querySelector('.todo-chart-legend__name').textContent)).toEqual(['Office', 'Personal', 'Home']);
      expect(legendItems().map((b) => b.querySelector('.todo-chart-legend__count').textContent)).toEqual(['2 tasks', '1 task', '1 task']);
      expect(legendItems().map((b) => b.querySelector('.todo-chart-legend__share').textContent)).toEqual(['50%', '25%', '25%']);
      expect(legendItem('office').querySelector('.todo-chart-legend__meta').textContent).toBe('2 open · 0 done · 1 overdue');
      expect(legendItem('office').title).toContain('1 overdue');
      expect(legendAll().querySelector('.todo-chart-legend__count').textContent).toBe('4 tasks');
      expect(chartPanel().querySelector('.todo-chart__center-value').textContent).toBe('4');
      expect(chartPanel().querySelector('.todo-panel__hint').textContent).toContain('March 2025 · All tasks');
      expect(legendItem('travel')).toBeNull(); // April's task is not charted in March
    });

    it('positive: clicking a legend entry filters the list and selects the matching chip; clicking again clears', () => {
      legendItem('home').click();
      expect(app.ui.filter.category).toBe('home');
      expect(names()).toEqual(['Fix tap']);
      expect(chip('home').getAttribute('aria-pressed')).toBe('true');
      expect(legendItem('home').getAttribute('aria-pressed')).toBe('true');
      expect(chartPanel().querySelector('.todo-chart__center-caption').textContent).toBe('Home');
      expect(legendItems()).toHaveLength(3); // the chart keeps showing every category while one is selected

      legendItem('home').click();
      expect(app.ui.filter.category).toBeNull();
      expect(names()).toHaveLength(4);
      expect(chip('').getAttribute('aria-pressed')).toBe('true');
    });

    it('positive: the chart and the chips are two views of one selection', () => {
      chip('personal').click();
      expect(legendItem('personal').getAttribute('aria-pressed')).toBe('true');
      expect(legendAll().getAttribute('aria-pressed')).toBe('false');
      legendAll().click();
      expect(chip('').getAttribute('aria-pressed')).toBe('true');
      expect(app.ui.filter.category).toBeNull();
    });

    it('positive: follows the status filter so chart and list never disagree', () => {
      items().find((li) => li.querySelector('.todo-item__name').textContent === 'Dentist').querySelector('.todo-item__checkbox').click();
      q('#todo-status-open').click();
      expect(legendItems().map((b) => b.querySelector('.todo-chart-legend__name').textContent)).toEqual(['Office', 'Home']);
      expect(chartPanel().querySelector('.todo-panel__hint').textContent).toContain('Open tasks');
      q('#todo-status-completed').click();
      expect(legendItems().map((b) => b.querySelector('.todo-chart-legend__name').textContent)).toEqual(['Personal']);
      expect(legendItem('personal').querySelector('.todo-chart-legend__meta').textContent).toBe('0 open · 1 done');
    });

    it('positive: follows the month picker', () => {
      nextMonth();
      expect(legendItems().map((b) => b.querySelector('.todo-chart-legend__name').textContent)).toEqual(['Travel']);
      expect(chartPanel().querySelector('.todo-panel__hint').textContent).toContain('April 2025');
      nextMonth();
      expect(legendItems()).toHaveLength(0);
      expect(chartPanel().querySelector('.todo-empty').textContent).toBe('No tasks due in May 2025 to chart.');
    });

    it('edge: a category filter survives a month change but the chart shows it as "All" when that category has no tasks there', () => {
      chip('home').click();
      nextMonth(); // April has only a Travel task
      expect(app.ui.filter.category).toBe('home');
      expect(names()).toEqual([]); // list is filtered (no Home tasks in April)
      expect(legendAll().getAttribute('aria-pressed')).toBe('true'); // chart cannot show a Home section, so nothing is highlighted
      prevMonth();
      expect(legendItem('home').getAttribute('aria-pressed')).toBe('true');
    });

    it('negative: completing, deleting and undoing a task keeps the chart in sync', () => {
      const tap = items().find((li) => li.querySelector('.todo-item__name').textContent === 'Fix tap');
      tap.querySelector('.todo-item__checkbox').click();
      expect(legendItem('home').querySelector('.todo-chart-legend__meta').textContent).toBe('0 open · 1 done');

      tap.querySelector('.todo-icon-btn--danger').click();
      expect(legendItem('home')).toBeNull();
      expect(legendAll().querySelector('.todo-chart-legend__count').textContent).toBe('3 tasks');

      root.querySelector('.todo-toast__action').click(); // Undo
      expect(legendItem('home')).not.toBeNull();
      expect(legendAll().querySelector('.todo-chart-legend__count').textContent).toBe('4 tasks');
    });
  });

  it('edge: sample data charts all four categories and removing it empties the chart again', () => {
    sampleBtn().click();
    expect(legendItems().map((b) => b.dataset.categoryId).sort()).toEqual(['home', 'office', 'personal', 'travel']);
    const total = legendItems().reduce((a, b) => a + parseInt(b.querySelector('.todo-chart-legend__count').textContent, 10), 0);
    expect(String(total)).toBe(chartPanel().querySelector('.todo-chart__center-value').textContent);
    sampleBtn().click();
    expect(legendItems()).toHaveLength(0);
    expect(chartPanel().querySelector('.todo-empty').hidden).toBe(false);
  });
});

describe('error handling', () => {
  it('negative: a store failure while loading sample data shows an error toast and leaves data untouched', () => {
    const spy = vi.spyOn(app.store, 'addTasks').mockImplementation(() => {
      throw new Error('Storage exploded');
    });
    sampleBtn().click();
    expect(toasts()).toContain('Storage exploded');
    expect(app.store.getState().tasks).toEqual([]);
    expect(sampleBtn().textContent).toContain('Load sample data');
    spy.mockRestore();
  });

  it('negative: a store failure while toggling shows an error toast and keeps the task as it was', () => {
    createTask({ name: 'Sticky', endDate: '2025-03-20' });
    const spy = vi.spyOn(app.store, 'toggleTask').mockImplementation(() => {
      throw new Error('Nope');
    });
    items()[0].querySelector('.todo-item__checkbox').click();
    expect(toasts()).toContain('Nope');
    expect(app.store.getState().tasks[0].completed).toBe(false);
    spy.mockRestore();
  });

  it('negative: deleting a task that has already vanished is a no-op', () => {
    createTask({ name: 'Ghost', endDate: '2025-03-20' });
    const id = items()[0].dataset.id;
    app.store.deleteTask(id); // removed behind the UI's back
    items()[0].querySelector('.todo-icon-btn--danger').click();
    expect(root.querySelector('.todo-toast__action')).toBeNull(); // no Undo offered
    expect(app.store.getState().tasks).toEqual([]);
  });

  it('edge: the storage warning banner appears when a write fails and clears once writes succeed again', () => {
    expect(q('.todo-banner--warning').hidden).toBe(true);
    const original = backend.setItem;
    backend.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    createTask({ name: 'Unsaved', endDate: '2025-03-20' });
    expect(q('.todo-banner--warning').hidden).toBe(false);
    backend.setItem = original;
    createTask({ name: 'Saved', endDate: '2025-03-20' });
    expect(q('.todo-banner--warning').hidden).toBe(true);
  });
});

describe('input edge cases', () => {
  it('edge: the name field caps at 120 characters and the store stores the trimmed value', () => {
    expect(q('#task-name').maxLength).toBe(120);
    expect(q('#task-description').maxLength).toBe(500);
    createTask({ name: '   Trim me   ', endDate: '2025-03-20' });
    expect(app.store.getState().tasks[0].name).toBe('Trim me');
    expect(names()).toEqual(['Trim me']);
  });

  it('negative: markup typed into a task is rendered as plain text', () => {
    createTask({ name: '<b>bold</b>', description: '<img src=x onerror=alert(1)>', endDate: '2025-03-20' });
    expect(root.querySelector('.todo-item b')).toBeNull();
    expect(root.querySelector('.todo-item img')).toBeNull();
    expect(names()).toEqual(['<b>bold</b>']);
  });

  it('edge: a leap-day end date is accepted', () => {
    createTask({ name: 'Leap', endDate: '2028-02-29' });
    expect(app.ui.month).toBe('2028-02');
    expect(names()).toEqual(['Leap']);
  });

  it('edge: undoing a delete after navigating to another month restores the task in its own month', () => {
    createTask({ name: 'April task', endDate: '2025-04-10' });
    items()[0].querySelector('.todo-icon-btn--danger').click();
    q('.todo-month-picker__today').click(); // March
    root.querySelector('.todo-toast__action').click(); // Undo
    expect(names()).toEqual([]); // not in March
    nextMonth();
    expect(names()).toEqual(['April task']);
  });

  it('edge: the export dialog can be opened straight away on a fresh app (defaults to the current month)', () => {
    q('[data-testid=todo-export-open]').click();
    expect(q('#todo-export-start-month').value).toBe('3');
    expect(q('#todo-export-start-year').value).toBe('2025');
    expect(q('[data-testid=todo-export-preview]').textContent).toBe('No tasks in this range.');
  });
});
