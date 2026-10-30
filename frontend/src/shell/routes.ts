/**
 * Hash routing for the workspace. The URL hash is the single source of truth
 * for which tab and page are shown, so tabs are bookmarkable and the browser's
 * back button works:
 *
 *   #/expenses      Expense Tracker
 *   #/todos         Todo Manager → dashboard
 *   #/todos/new     Todo Manager → create task
 *   #/ads           Ads Campaign Management → campaign dashboard
 *   #/ads/new       Ads Campaign Management → create campaign
 *   #/ads/edit/:id  Ads Campaign Management → edit campaign
 */

export type TabId = 'expenses' | 'todos' | 'ads';
export type PageId = 'dashboard' | 'new' | 'edit';

export interface TabDef {
  id: TabId;
  label: string;
  hash: string;
  title: string;
  icon: 'wallet' | 'check' | 'megaphone';
}

export const TABS: TabDef[] = [
  { id: 'expenses', label: 'Expense Tracker', hash: '#/expenses', title: 'Expense Tracker', icon: 'wallet' },
  { id: 'todos', label: 'Todo Manager', hash: '#/todos', title: 'Todo Manager', icon: 'check' },
  { id: 'ads', label: 'Ads Campaign Management', hash: '#/ads', title: 'Ads Campaign Management', icon: 'megaphone' },
];

export const DEFAULT_TAB = TABS[0] as TabDef;

/** Pages (beyond the dashboard) each tab's app exposes as a sub-path. `edit` takes an id. */
const TAB_PAGES: Partial<Record<TabId, PageId[]>> = {
  todos: ['new'],
  ads: ['new', 'edit'],
};

export interface Route {
  tab: TabId;
  page: PageId;
  id?: string;
}

function isTabId(value: string): value is TabId {
  return TABS.some((t) => t.id === value);
}

export function parseRoute(hash: string | null | undefined): Route {
  const path = String(hash || '')
    .replace(/^#\/?/, '')
    .replace(/\/+$/, '');
  const [head = '', sub, ...rest] = path.split('/');
  if (!isTabId(head)) return { tab: DEFAULT_TAB.id, page: 'dashboard' };
  const pages = TAB_PAGES[head] ?? [];
  if (sub === 'edit' && pages.includes('edit')) {
    const id = safeDecode(rest.join('/'));
    return id ? { tab: head, page: 'edit', id } : { tab: head, page: 'dashboard' };
  }
  return { tab: head, page: sub === 'new' && pages.includes('new') ? 'new' : 'dashboard' };
}

export function hashFor(tab: string, page: PageId = 'dashboard', id?: string | null): string {
  if (!isTabId(tab)) return DEFAULT_TAB.hash;
  const pages = TAB_PAGES[tab] ?? [];
  if (page === 'edit' && pages.includes('edit') && id) return `#/${tab}/edit/${encodeURIComponent(id)}`;
  if (page === 'new' && pages.includes('new')) return `#/${tab}/new`;
  return `#/${tab}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
