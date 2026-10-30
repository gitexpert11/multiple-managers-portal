import { createApp as createExpenseApp } from '../expense-tracker/src/app.js';
import { createTodoApp } from '../todo-manager/src/app.js';
import { createAdsApp } from '../ads-campaign-manager/src/app.js';
import { DEFAULT_THEME, applyTheme, createThemeStorage, createThemeSwitcher, isTheme } from './theme.js';

/**
 * Three-tab shell.
 *
 * Mounts the Expense Tracker, the Todo Manager and the Ads Campaign Manager
 * side by side (each in its own pane, with its own store and localStorage
 * key) and switches between them with a tab strip. The URL hash is the single
 * source of truth for what is shown, so tabs are bookmarkable and the
 * browser's back button works:
 *
 *   #/expenses      Expense Tracker
 *   #/todos         Todo Manager → dashboard
 *   #/todos/new     Todo Manager → create task
 *   #/ads           Ads Campaign Management → campaign dashboard
 *   #/ads/new       Ads Campaign Management → create campaign
 *   #/ads/edit/:id  Ads Campaign Management → edit campaign
 *
 * All apps are mounted once, up front, so each loads its saved data
 * immediately and keeps its transient state (selected month or period,
 * half-filled form, filters) while another tab is active.
 *
 * The light/dark/system theme is a workspace-level setting: the switcher sits
 * at the right of the tab strip and applies to every tab.
 */

export const TABS = [
  { id: 'expenses', label: 'Expense Tracker', hash: '#/expenses', title: 'Expense Tracker', icon: 'wallet' },
  { id: 'todos', label: 'Todo Manager', hash: '#/todos', title: 'Todo Manager', icon: 'check' },
  { id: 'ads', label: 'Ads Campaign Management', hash: '#/ads', title: 'Ads Campaign Management', icon: 'megaphone' },
];

const DEFAULT_TAB = TABS[0];

/** Pages (beyond the dashboard) each tab's app exposes as a sub-path. `edit` takes an id. */
const TAB_PAGES = {
  todos: ['new'],
  ads: ['new', 'edit'],
};

/** @returns {{tab: 'expenses'|'todos'|'ads', page: 'dashboard'|'new'|'edit', id?: string}} */
export function parseRoute(hash) {
  const path = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
  const [head, sub, ...rest] = path.split('/');
  const pages = TAB_PAGES[head];
  if (!pages) return { tab: 'expenses', page: 'dashboard' };
  if (sub === 'edit' && pages.includes('edit')) {
    const id = safeDecode(rest.join('/'));
    return id ? { tab: head, page: 'edit', id } : { tab: head, page: 'dashboard' };
  }
  return { tab: head, page: sub === 'new' && pages.includes('new') ? 'new' : 'dashboard' };
}

export function hashFor(tab, page = 'dashboard', id) {
  const pages = TAB_PAGES[tab];
  if (!pages) return DEFAULT_TAB.hash;
  if (page === 'edit' && pages.includes('edit') && id) return `#/${tab}/edit/${encodeURIComponent(id)}`;
  if (page === 'new' && pages.includes('new')) return `#/${tab}/new`;
  return `#/${tab}`;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * @param {HTMLElement} rootEl
 * @param {{expense?: object, todo?: object, ads?: object, themeStorage?: object, win?: Window}} opts
 *   `expense` / `todo` / `ads` are passed straight to each app's factory (e.g.
 *   a store backed by a memory backend, or a fixed `now` in tests).
 *   `themeStorage` persists the workspace theme (defaults to localStorage).
 */
export function createShell(rootEl, { expense: expenseOptions = {}, todo: todoOptions = {}, ads: adsOptions = {}, themeStorage = createThemeStorage(), win = window } = {}) {
  const doc = rootEl.ownerDocument;

  // ---- tab strip -------------------------------------------------------------
  const links = new Map();
  const nav = el(doc, 'nav', { class: 'shell__nav', 'aria-label': 'Applications' });
  for (const tab of TABS) {
    const link = el(doc, 'a', { class: 'shell__tab', href: tab.hash, 'data-tab': tab.id }, tabIcon(doc, tab.icon), el(doc, 'span', {}, tab.label));
    links.set(tab.id, link);
    nav.append(link);
  }

  // ---- theme (workspace-level, right of the tab strip) -----------------------
  let theme = themeStorage.load() ?? DEFAULT_THEME;
  applyTheme(doc, theme); // before the apps mount, so there is no flash
  const themeSwitcher = createThemeSwitcher(nav, { onChange: setTheme });

  function setTheme(next) {
    if (!isTheme(next)) next = DEFAULT_THEME;
    theme = next;
    applyTheme(doc, theme);
    themeSwitcher.update(theme);
    themeStorage.save(theme);
    // Charts read colours (slice borders, line colours) from CSS variables at render time.
    expense.render();
    todo.render();
    ads.render();
    return theme;
  }

  // ---- panes -----------------------------------------------------------------
  const panes = new Map();
  for (const tab of TABS) {
    const pane = el(doc, 'section', { class: 'shell__pane', 'data-app': tab.id, 'aria-label': tab.label, hidden: true });
    panes.set(tab.id, pane);
  }

  rootEl.classList.add('shell');
  rootEl.append(nav, ...panes.values());

  // ---- apps (mounted once, each with its own store & storage key) ------------
  const expense = createExpenseApp(panes.get('expenses'), expenseOptions);
  const todo = createTodoApp(panes.get('todos'), {
    ...todoOptions,
    onNavigate: (page) => {
      todoOptions.onNavigate?.(page);
      go(hashFor('todos', page));
    },
  });
  const ads = createAdsApp(panes.get('ads'), {
    ...adsOptions,
    onNavigate: (page, params) => {
      adsOptions.onNavigate?.(page, params);
      go(hashFor('ads', page, params?.id));
    },
  });

  // The theme used to live in the Expense Tracker's settings. Adopt a saved
  // choice once so existing users keep their dark/light mode after the move.
  if (themeStorage.load() == null) {
    const legacy = expense.store.getState().preferences?.theme;
    if (isTheme(legacy) && legacy !== DEFAULT_THEME) setTheme(legacy);
  }
  themeSwitcher.update(theme);

  // ---- routing ---------------------------------------------------------------
  let active = null;

  function sync() {
    const route = parseRoute(win.location.hash);
    for (const [id, pane] of panes) pane.hidden = id !== route.tab;
    for (const [id, link] of links) {
      if (id === route.tab) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (route.tab === 'todos') todo.showPage(route.page);
    if (route.tab === 'ads') ads.showPage(route.page, { id: route.id });
    const tab = TABS.find((t) => t.id === route.tab);
    doc.title = tab.title;
    active = route.tab;
    return route;
  }

  /** Navigate to a hash (updates the URL, then syncs the panes). */
  function go(hash) {
    if (win.location.hash !== hash) win.location.hash = hash;
    return sync();
  }

  win.addEventListener('hashchange', sync);

  // An empty hash means "default tab"; normalise it so the URL is explicit.
  if (!win.location.hash) {
    try {
      win.history.replaceState(null, '', DEFAULT_TAB.hash);
    } catch {
      /* history may be unavailable (e.g. file://); sync() still falls back to the default tab */
    }
  }
  sync();

  return {
    expense,
    todo,
    ads,
    go,
    sync,
    setTheme,
    get theme() {
      return theme;
    },
    get activeTab() {
      return active;
    },
  };
}

// ---- tiny helpers (the shell deliberately imports nothing from either app) ----

function el(doc, tag, attrs = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
  }
  return node;
}

function tabIcon(doc, name) {
  const paths = {
    wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    check: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  };
  const span = doc.createElement('span');
  span.className = 'shell__tab-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  return span;
}
