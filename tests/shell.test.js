/**
 * Shell integration tests: mount the three-tab shell with all real apps,
 * drive the tabs through the hash router and verify that each app keeps its
 * own data under its own localStorage key and loads it on start-up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShell, hashFor, parseRoute, TABS } from '../src/shell.js';
import { createThemeStorage, THEME_STORAGE_KEY } from '../src/theme.js';
import { createMemoryBackend as expenseBackend, createStorage as expenseStorage, STORAGE_KEY as EXPENSE_KEY } from '../expense-tracker/src/store/storage.js';
import { createStore as createExpenseStore } from '../expense-tracker/src/store/store.js';
import { createStorage as todoStorage, STORAGE_KEY as TODO_KEY } from '../todo-manager/src/store/storage.js';
import { createStore as createTodoStore } from '../todo-manager/src/store/store.js';
import { createStorage as adsStorage, STORAGE_KEY as ADS_KEY } from '../ads-campaign-manager/src/store/storage.js';
import { createStore as createAdsStore } from '../ads-campaign-manager/src/store/store.js';

const NOW = new Date(2025, 2, 15, 10); // 15 March 2025

let root;
let shell;
let backend; // ONE shared backend (like the real localStorage) holding both keys

function mount() {
  root = document.createElement('div');
  document.body.append(root);
  shell = createShell(root, {
    expense: { store: createExpenseStore({ storage: expenseStorage(backend) }), now: () => NOW },
    todo: { store: createTodoStore({ storage: todoStorage(backend) }), now: () => NOW },
    ads: { store: createAdsStore({ storage: adsStorage(backend), now: () => NOW }), now: () => NOW },
    themeStorage: createThemeStorage(backend),
  });
  return shell;
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

const pane = (id) => q(`.shell__pane[data-app=${id}]`);
const tab = (id) => q(`.shell__tab[data-tab=${id}]`);

function addExpense(amount, description) {
  setValue(q('#tx-description'), description);
  setValue(q('#tx-amount'), amount);
  q('form.tx-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function addTask(name, endDate = '2025-03-20') {
  shell.go('#/todos/new');
  setValue(q('#task-name'), name);
  setValue(q('#task-end-date'), endDate);
  q('form.todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function addCampaign(name, budget = '25') {
  shell.go('#/ads/new');
  setValue(q('#campaign-name'), name);
  setValue(q('#campaign-budget'), budget);
  pane('ads').querySelector('[data-testid=ads-add-products]').click();
  const box = pane('ads').querySelector('#ads-pick-SKU-1001');
  box.checked = true;
  box.dispatchEvent(new Event('change', { bubbles: true }));
  pane('ads').querySelector('[data-testid=ads-picker-confirm]').click();
  q('form.ads-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  window.location.hash = '';
  backend = expenseBackend();
  mount();
});

afterEach(() => {
  root.remove();
  window.location.hash = '';
  document.documentElement.removeAttribute('data-theme');
  vi.useRealTimers();
});

const themeRadio = (value) => q(`#shell-theme-${value}`);
const htmlTheme = () => document.documentElement.getAttribute('data-theme');

describe('routing helpers', () => {
  it('parses hashes into tab + page, defaulting to the expense tracker', () => {
    expect(parseRoute('')).toEqual({ tab: 'expenses', page: 'dashboard' });
    expect(parseRoute('#')).toEqual({ tab: 'expenses', page: 'dashboard' });
    expect(parseRoute('#/expenses')).toEqual({ tab: 'expenses', page: 'dashboard' });
    expect(parseRoute('#/todos')).toEqual({ tab: 'todos', page: 'dashboard' });
    expect(parseRoute('#/todos/')).toEqual({ tab: 'todos', page: 'dashboard' });
    expect(parseRoute('#/todos/new')).toEqual({ tab: 'todos', page: 'new' });
    expect(parseRoute('#/todos/whatever')).toEqual({ tab: 'todos', page: 'dashboard' });
    expect(parseRoute('#/ads')).toEqual({ tab: 'ads', page: 'dashboard' });
    expect(parseRoute('#/ads/')).toEqual({ tab: 'ads', page: 'dashboard' });
    expect(parseRoute('#/ads/new')).toEqual({ tab: 'ads', page: 'new' });
    expect(parseRoute('#/ads/whatever')).toEqual({ tab: 'ads', page: 'dashboard' });
    expect(parseRoute('#/ads/edit/cmp_1')).toEqual({ tab: 'ads', page: 'edit', id: 'cmp_1' });
    expect(parseRoute('#/ads/edit/cmp_1/')).toEqual({ tab: 'ads', page: 'edit', id: 'cmp_1' });
    expect(parseRoute('#/ads/edit/a%20b')).toEqual({ tab: 'ads', page: 'edit', id: 'a b' });
    expect(parseRoute('#/ads/edit/%E0%A4%A')).toEqual({ tab: 'ads', page: 'edit', id: '%E0%A4%A' }); // undecodable: kept verbatim
    expect(parseRoute('#/ads/edit')).toEqual({ tab: 'ads', page: 'dashboard' });
    expect(parseRoute('#/ads/edit/')).toEqual({ tab: 'ads', page: 'dashboard' });
    expect(parseRoute('#/todos/edit/task_1')).toEqual({ tab: 'todos', page: 'dashboard' }); // todos have no edit page
    expect(parseRoute('#/nope')).toEqual({ tab: 'expenses', page: 'dashboard' });
  });

  it('builds hashes for every tab/page', () => {
    expect(hashFor('expenses')).toBe('#/expenses');
    expect(hashFor('todos')).toBe('#/todos');
    expect(hashFor('todos', 'new')).toBe('#/todos/new');
    expect(hashFor('ads')).toBe('#/ads');
    expect(hashFor('ads', 'new')).toBe('#/ads/new');
    expect(hashFor('ads', 'edit', 'cmp_1')).toBe('#/ads/edit/cmp_1');
    expect(hashFor('ads', 'edit', 'a b')).toBe('#/ads/edit/a%20b');
    expect(hashFor('ads', 'edit')).toBe('#/ads'); // no id -> dashboard
    expect(hashFor('todos', 'edit', 'task_1')).toBe('#/todos');
    expect(hashFor('nope', 'new')).toBe('#/expenses');
    expect(TABS.map((t) => t.id)).toEqual(['expenses', 'todos', 'ads']);
  });
});

describe('tabs', () => {
  it('renders three tabs and opens on the Expense Tracker by default', () => {
    expect([...root.querySelectorAll('.shell__tab')].map((a) => a.textContent)).toEqual(['Expense Tracker', 'Todo Manager', 'Ads Campaign Management']);
    expect(shell.activeTab).toBe('expenses');
    expect(pane('expenses').hidden).toBe(false);
    expect(pane('todos').hidden).toBe(true);
    expect(pane('ads').hidden).toBe(true);
    expect(tab('expenses').getAttribute('aria-current')).toBe('page');
    expect(tab('todos').getAttribute('aria-current')).toBeNull();
    expect(window.location.hash).toBe('#/expenses');
    expect(document.title).toBe('Expense Tracker');
  });

  it('mounts all apps up front, each inside its own pane', () => {
    expect(pane('expenses').querySelector('.topbar__title').textContent).toBe('Expense Tracker');
    expect(pane('expenses').querySelector('form.tx-form')).not.toBeNull();
    expect(pane('todos').querySelector('.todo-topbar__title').textContent).toBe('Todo Manager');
    expect(pane('todos').querySelector('form.todo-form')).not.toBeNull();
    expect(pane('ads').querySelector('.ads-topbar__title').textContent).toBe('Ads Campaign Management');
    expect(pane('ads').querySelector('form.ads-form')).not.toBeNull();
    expect(pane('ads').querySelector('[data-testid=ads-summary]')).not.toBeNull();
  });

  it('the third tab is "Ads Campaign Management" and maps #/ads and #/ads/new onto its pages', () => {
    expect(tab('ads').textContent).toBe('Ads Campaign Management');
    shell.go('#/ads');
    expect(shell.activeTab).toBe('ads');
    expect(pane('ads').hidden).toBe(false);
    expect(pane('expenses').hidden).toBe(true);
    expect(pane('todos').hidden).toBe(true);
    expect(tab('ads').getAttribute('aria-current')).toBe('page');
    expect(document.title).toBe('Ads Campaign Management');
    expect(shell.ads.ui.page).toBe('dashboard');
    expect(pane('ads').querySelector('[data-page=dashboard]').hidden).toBe(false);

    shell.go('#/ads/new');
    expect(shell.ads.ui.page).toBe('new');
    expect(pane('ads').querySelector('[data-page=new]').hidden).toBe(false);
    expect(pane('ads').querySelector('[data-page=dashboard]').hidden).toBe(true);
  });

  it('mirrors in-app ads navigation into the URL', () => {
    shell.go('#/ads');
    pane('ads').querySelector('[data-testid=ads-new-campaign]').click();
    expect(window.location.hash).toBe('#/ads/new');
    pane('ads').querySelector('[data-testid=ads-campaign-cancel]').click();
    expect(window.location.hash).toBe('#/ads');
  });

  it('maps #/ads/edit/:id onto the edit page (deep link, in-app edit, back to the dashboard)', () => {
    addCampaign('Editable', '20');
    const id = shell.ads.store.getState().campaigns[0].id;

    // In-app: the grid's Edit action puts the id in the URL.
    pane('ads').querySelector('[data-action=edit]').click();
    expect(window.location.hash).toBe(`#/ads/edit/${id}`);
    expect(shell.ads.ui).toMatchObject({ page: 'edit', editingId: id });
    expect(pane('ads').querySelector('#edit-campaign-name').value).toBe('Editable');

    // Saving returns to the dashboard URL.
    setValue(pane('ads').querySelector('#edit-campaign-name'), 'Edited');
    pane('ads').querySelector('[data-page=edit] form.ads-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(window.location.hash).toBe('#/ads');
    expect(shell.ads.store.getState().campaigns[0].name).toBe('Edited');

    // Deep link straight to the edit page on a fresh mount.
    root.remove();
    window.location.hash = `#/ads/edit/${id}`;
    mount();
    expect(shell.activeTab).toBe('ads');
    expect(shell.ads.ui).toMatchObject({ page: 'edit', editingId: id });
    expect(pane('ads').querySelector('#edit-campaign-name').value).toBe('Edited');
    expect(document.activeElement).toBe(pane('ads').querySelector('#edit-campaign-name'));

    // An unknown id shows the not-found state; hashchange (back button) works.
    shell.go('#/ads/edit/does-not-exist');
    expect(pane('ads').querySelector('[data-testid=ads-edit-not-found]').hidden).toBe(false);
    window.location.hash = '#/ads';
    window.dispatchEvent(new Event('hashchange'));
    expect(shell.ads.ui.page).toBe('dashboard');
  });

  it('switches tabs via the hash and via the tab links', () => {
    shell.go('#/todos');
    expect(shell.activeTab).toBe('todos');
    expect(pane('todos').hidden).toBe(false);
    expect(pane('expenses').hidden).toBe(true);
    expect(tab('todos').getAttribute('aria-current')).toBe('page');
    expect(document.title).toBe('Todo Manager');

    // Tab links are plain anchors: following one changes the hash.
    window.location.hash = tab('expenses').getAttribute('href');
    shell.sync();
    expect(shell.activeTab).toBe('expenses');
    expect(pane('expenses').hidden).toBe(false);
  });

  it('reacts to hashchange events (back/forward, manual URL edits)', () => {
    window.location.hash = '#/todos/new';
    window.dispatchEvent(new Event('hashchange'));
    expect(shell.activeTab).toBe('todos');
    expect(shell.todo.ui.page).toBe('new');
  });

  it('maps #/todos and #/todos/new onto the Todo Manager pages', () => {
    shell.go('#/todos/new');
    expect(shell.todo.ui.page).toBe('new');
    expect(pane('todos').querySelector('[data-page=new]').hidden).toBe(false);
    shell.go('#/todos');
    expect(shell.todo.ui.page).toBe('dashboard');
    expect(pane('todos').querySelector('[data-page=dashboard]').hidden).toBe(false);
  });

  it('mirrors in-app todo navigation into the URL', () => {
    shell.go('#/todos');
    pane('todos').querySelector('[data-testid=todo-new-task]').click();
    expect(window.location.hash).toBe('#/todos/new');
    pane('todos').querySelector('.todo-form__actions .todo-btn--ghost').click(); // Cancel
    expect(window.location.hash).toBe('#/todos');
  });

  it('keeps each app state while the other tab is active', () => {
    // Move the expense tracker to a different month, then switch away and back.
    q('[aria-label="Previous month"]').click();
    expect(shell.expense.ui.month).toBe('2025-02');
    shell.go('#/todos');
    shell.go('#/expenses');
    expect(shell.expense.ui.month).toBe('2025-02');
    expect(q('.month-picker__label').textContent).toBe('February 2025');
  });
});

describe('separate storage', () => {
  it('the three apps use different localStorage keys', () => {
    expect(EXPENSE_KEY).toBe('expense-tracker-ng');
    expect(TODO_KEY).toBe('todo-manager-ng');
    expect(ADS_KEY).toBe('ads-campaign-manager-ng');
    expect(new Set([EXPENSE_KEY, TODO_KEY, ADS_KEY]).size).toBe(3);
  });

  it('writes campaigns under their own key without touching the others, and reloads them', () => {
    addExpense('12.50', 'Lunch');
    addTask('Write report');
    const expenseSnapshot = backend.getItem(EXPENSE_KEY);
    const todoSnapshot = backend.getItem(TODO_KEY);
    expect(backend.getItem(ADS_KEY)).toBeNull();

    addCampaign('Spring Sale', '45');
    expect(window.location.hash).toBe('#/ads'); // back on the dashboard
    expect(backend.getItem(EXPENSE_KEY)).toBe(expenseSnapshot);
    expect(backend.getItem(TODO_KEY)).toBe(todoSnapshot);
    const adsData = JSON.parse(backend.getItem(ADS_KEY)).data;
    expect(adsData.campaigns.map((c) => c.name)).toEqual(['Spring Sale']);
    expect(adsData.campaigns[0].dailyBudget).toBe(4500);
    expect(adsData.tasks).toBeUndefined();
    expect(adsData.transactions).toBeUndefined();

    // Reload straight onto the ads tab: the campaign is in the grid.
    root.remove();
    window.location.hash = '#/ads';
    mount();
    expect(shell.activeTab).toBe('ads');
    expect([...pane('ads').querySelectorAll('.ads-grid__name')].map((n) => n.textContent)).toEqual(['Spring Sale']);
    expect(shell.expense.store.getState().transactions).toHaveLength(1);
    expect(shell.todo.store.getState().tasks).toHaveLength(1);

    shell.ads.store.clearAll();
    expect(JSON.parse(backend.getItem(ADS_KEY)).data.campaigns).toEqual([]);
    expect(backend.getItem(EXPENSE_KEY)).toBe(expenseSnapshot);
    expect(backend.getItem(TODO_KEY)).toBe(todoSnapshot);
  });

  it('writes expenses and tasks under their own keys without touching the other', () => {
    addExpense('12.50', 'Lunch');
    expect(backend.getItem(EXPENSE_KEY)).not.toBeNull();
    expect(backend.getItem(TODO_KEY)).toBeNull();
    const expenseSnapshot = backend.getItem(EXPENSE_KEY);

    addTask('Write report');
    expect(backend.getItem(TODO_KEY)).not.toBeNull();
    expect(backend.getItem(EXPENSE_KEY)).toBe(expenseSnapshot); // untouched

    const todoData = JSON.parse(backend.getItem(TODO_KEY)).data;
    const expenseData = JSON.parse(backend.getItem(EXPENSE_KEY)).data;
    expect(todoData.tasks.map((t) => t.name)).toEqual(['Write report']);
    expect(todoData.transactions).toBeUndefined();
    expect(expenseData.transactions.map((t) => t.description)).toEqual(['Lunch']);
    expect(expenseData.tasks).toBeUndefined();
  });

  it('loads both apps\' saved data on start-up, whichever tab is opened first', () => {
    addExpense('12.50', 'Lunch');
    addExpense('7.25', 'Coffee');
    addTask('Write report', '2025-03-20');
    addTask('Book hotel', '2025-03-18');

    // Simulate a reload straight onto the Todo tab.
    root.remove();
    window.location.hash = '#/todos';
    mount();
    expect(shell.activeTab).toBe('todos');
    expect([...pane('todos').querySelectorAll('.todo-item__name')].map((n) => n.textContent)).toEqual(['Book hotel', 'Write report']);
    // The hidden Expense Tracker has already loaded its data too.
    expect(shell.expense.store.getState().transactions).toHaveLength(2);
    expect(pane('expenses').querySelectorAll('tbody tr.grid__row')).toHaveLength(2);
    expect(q('[data-testid=summary-expenses]').textContent).toBe('$19.75');

    // And the other way round.
    root.remove();
    window.location.hash = '#/expenses';
    mount();
    expect(shell.activeTab).toBe('expenses');
    expect(q('[data-testid=summary-expenses]').textContent).toBe('$19.75');
    expect(shell.todo.store.getState().tasks.map((t) => t.name)).toEqual(['Write report', 'Book hotel']);
    expect(pane('todos').querySelector('[data-testid=todo-summary-open]').textContent).toBe('2');
  });

  it('clearing one app\'s data leaves the other intact', () => {
    addExpense('12.50', 'Lunch');
    addTask('Write report');

    shell.todo.store.clearAll();
    expect(JSON.parse(backend.getItem(TODO_KEY)).data.tasks).toEqual([]);
    expect(JSON.parse(backend.getItem(EXPENSE_KEY)).data.transactions).toHaveLength(1);

    shell.expense.store.clearAll();
    expect(shell.expense.store.getState().transactions).toEqual([]);
    expect(backend.getItem(TODO_KEY)).not.toBeNull();
  });
});

describe('Expense Tracker inside the shell', () => {
  it('works exactly as before: summary, chart legend, grid, month picker', () => {
    addExpense('12.50', 'Lunch');
    expect(q('[data-testid=summary-expenses]').textContent).toBe('$12.50');
    expect(q('[data-testid=summary-remaining]').textContent).toBe('-$12.50');
    expect(pane('expenses').querySelectorAll('tbody tr.grid__row')).toHaveLength(1);
    expect(pane('expenses').querySelector('[data-testid=chart-expense] .chart-legend__item[data-category-id="cat_food"]')).not.toBeNull();
    expect(q('.month-picker__label').textContent).toBe('March 2025');
    expect(document.activeElement).toBe(q('#tx-amount')); // form ready for the next entry
  });
});

describe('workspace theme (tab-strip level)', () => {
  it('shows the switcher at the right of the tab strip, defaulting to System', () => {
    const nav = q('.shell__nav');
    const switcher = q('[data-testid=theme-switcher]');
    expect(switcher.parentElement).toBe(nav);
    expect(nav.lastElementChild).toBe(switcher); // after both tab links
    expect(shell.theme).toBe('system');
    expect(themeRadio('system').checked).toBe(true);
    expect(htmlTheme()).toBeNull();
  });

  it('switches the theme for the whole page and persists it under its own key', () => {
    themeRadio('dark').click();
    expect(shell.theme).toBe('dark');
    expect(htmlTheme()).toBe('dark');
    expect(JSON.parse(backend.getItem(THEME_STORAGE_KEY)).data.theme).toBe('dark');
    // Neither app's data was touched.
    expect(backend.getItem(EXPENSE_KEY)).toBeNull();
    expect(backend.getItem(TODO_KEY)).toBeNull();

    themeRadio('light').click();
    expect(htmlTheme()).toBe('light');
    themeRadio('system').click();
    expect(htmlTheme()).toBeNull();
    expect(JSON.parse(backend.getItem(THEME_STORAGE_KEY)).data.theme).toBe('system');
  });

  it('applies to both tabs and survives switching tabs and app re-renders', () => {
    themeRadio('dark').click();
    shell.go('#/todos');
    expect(htmlTheme()).toBe('dark');
    addTask('Write report');
    expect(htmlTheme()).toBe('dark');
    shell.go('#/expenses');
    addExpense('12.50', 'Lunch'); // the expense tracker re-renders; it must not reset the theme
    expect(htmlTheme()).toBe('dark');
    expect(themeRadio('dark').checked).toBe(true);
  });

  it('restores the saved theme on reload, before the apps render', () => {
    themeRadio('dark').click();
    root.remove();
    document.documentElement.removeAttribute('data-theme');
    mount();
    expect(shell.theme).toBe('dark');
    expect(htmlTheme()).toBe('dark');
    expect(themeRadio('dark').checked).toBe(true);
  });

  it('adopts a theme previously saved in the Expense Tracker settings (one-time migration)', () => {
    // A user who chose "dark" before the theme moved out of the Expense Tracker.
    shell.expense.store.setPreferences({ theme: 'dark' });
    backend.removeItem(THEME_STORAGE_KEY);
    root.remove();
    mount();
    expect(shell.theme).toBe('dark');
    expect(htmlTheme()).toBe('dark');
    expect(JSON.parse(backend.getItem(THEME_STORAGE_KEY)).data.theme).toBe('dark');

    // Once the workspace has its own choice, the legacy value is ignored.
    themeRadio('light').click();
    root.remove();
    mount();
    expect(shell.theme).toBe('light');
  });

  it('the Expense Tracker settings dialog no longer contains a theme control, but keeps everything else', () => {
    expect(root.querySelector('#pref-theme')).toBeNull();
    expect(pane('expenses').querySelector('#pref-currency')).not.toBeNull();
    expect(pane('expenses').querySelector('.category-list')).not.toBeNull();
    const labels = [...pane('expenses').querySelectorAll('.dialog__actions .btn')].map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Export JSON', 'Import JSON']));
  });

  it('re-renders every app when the theme changes so chart colours follow the theme', () => {
    const expenseRender = vi.spyOn(shell.expense, 'render');
    const todoRender = vi.spyOn(shell.todo, 'render');
    const adsRender = vi.spyOn(shell.ads, 'render');
    themeRadio('dark').click();
    expect(expenseRender).toHaveBeenCalledTimes(1);
    expect(todoRender).toHaveBeenCalledTimes(1);
    expect(adsRender).toHaveBeenCalledTimes(1);
  });

  it('exposes setTheme() for hosts and ignores junk', () => {
    expect(shell.setTheme('light')).toBe('light');
    expect(htmlTheme()).toBe('light');
    expect(shell.setTheme('neon')).toBe('system');
    expect(htmlTheme()).toBeNull();
  });
});

describe('shell robustness', () => {
  it('negative: a window whose history API throws (e.g. file://) still mounts and falls back to the default tab', () => {
    const host = document.createElement('div');
    document.body.append(host);
    window.location.hash = '';
    const listeners = [];
    const win = {
      location: window.location,
      history: {
        replaceState() {
          throw new Error('SecurityError');
        },
      },
      addEventListener: (type, fn) => listeners.push([type, fn]),
    };
    const s = createShell(host, {
      expense: { store: createExpenseStore({ storage: expenseStorage(backend) }), now: () => NOW },
      todo: { store: createTodoStore({ storage: todoStorage(backend) }), now: () => NOW },
      ads: { store: createAdsStore({ storage: adsStorage(backend), now: () => NOW }), now: () => NOW },
      themeStorage: createThemeStorage(backend),
      win,
    });
    expect(s.activeTab).toBe('expenses');
    expect(host.querySelector('.shell__pane[data-app=expenses]').hidden).toBe(false);
    expect(listeners.map(([t]) => t)).toContain('hashchange');
    host.remove();
  });

  it('negative: an unknown hash falls back to the Expense Tracker', () => {
    shell.go('#/nonsense/whatever');
    expect(shell.activeTab).toBe('expenses');
    expect(document.title).toBe('Expense Tracker');
  });

  it('edge: deep-linking straight to the create page focuses the task name field', () => {
    root.remove();
    window.location.hash = '#/todos/new';
    mount();
    expect(shell.activeTab).toBe('todos');
    expect(shell.todo.ui.page).toBe('new');
    expect(document.activeElement).toBe(pane('todos').querySelector('#task-name'));
  });

  it('edge: deep-linking straight to the create-campaign page focuses the campaign name field', () => {
    root.remove();
    window.location.hash = '#/ads/new';
    mount();
    expect(shell.activeTab).toBe('ads');
    expect(shell.ads.ui.page).toBe('new');
    expect(document.activeElement).toBe(pane('ads').querySelector('#campaign-name'));
  });

  it('edge: the ads sample-data toggle is independent of the other two', () => {
    shell.go('#/ads');
    pane('ads').querySelector('[data-testid=ads-sample-data-toggle]').click();
    expect(shell.ads.store.getState().campaigns.length).toBeGreaterThan(0);
    expect(shell.todo.store.getState().tasks).toEqual([]);
    expect(shell.expense.store.getState().transactions).toEqual([]);
    pane('ads').querySelector('[data-testid=ads-sample-data-toggle]').click();
    expect(shell.ads.store.getState().campaigns).toEqual([]);
  });

  it('edge: the two sample-data toggles are independent', () => {
    q('[data-testid=sample-data-toggle]').click();
    shell.go('#/todos');
    expect(shell.todo.store.getState().tasks).toEqual([]);
    pane('todos').querySelector('[data-testid=todo-sample-data-toggle]').click();
    expect(shell.todo.store.getState().tasks.length).toBeGreaterThan(0);
    expect(shell.expense.store.getState().transactions.length).toBeGreaterThan(0);
    pane('todos').querySelector('[data-testid=todo-sample-data-toggle]').click();
    expect(shell.todo.store.getState().tasks).toEqual([]);
    expect(shell.expense.store.getState().transactions.length).toBeGreaterThan(0);
  });
});
