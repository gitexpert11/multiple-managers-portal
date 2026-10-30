import { useEffect, useMemo } from 'react';
import { NowContext } from '@shared/hooks/useNow';
import { AdsCampaignApp, type AdsCampaignAppProps, type AdsPage } from '@/apps/ads-campaign-manager/AdsCampaignApp';
import { ExpenseTrackerApp, type ExpenseTrackerAppProps } from '@/apps/expense-tracker/ExpenseTrackerApp';
import { createStore as createExpenseStore } from '@/apps/expense-tracker/store/store';
import { TodoManagerApp, type TodoManagerAppProps, type TodoPage } from '@/apps/todo-manager/TodoManagerApp';
import { createStore as createTodoStore } from '@/apps/todo-manager/store/store';
import { hashFor, TABS, type TabId } from './routes';
import { TabStrip } from './TabStrip';
import { createThemeStorage, ThemeContext, useThemeController, type ThemeStorage } from './theme';
import { useHashRoute } from './useHashRoute';
import './shell.css';

export interface ShellProps {
  expense?: ExpenseTrackerAppProps;
  todo?: Pick<TodoManagerAppProps, 'store'>;
  ads?: Pick<AdsCampaignAppProps, 'api'>;
  themeStorage?: ThemeStorage;
  /** Injectable clock (tests pin it). */
  now?: () => Date;
  win?: Window;
}

/**
 * Three-tab shell.
 *
 * Mounts the Expense Tracker, the Todo Manager and the Ads Campaign Manager
 * side by side — each in its own pane, with its own store / API client — and
 * switches between them with a tab strip driven by the URL hash. All apps are
 * mounted once, up front, so each keeps its transient state (selected month
 * or period, half-filled form, filters) while another tab is active.
 *
 * The light / dark / system theme is a workspace-level setting: the switcher
 * sits at the right of the tab strip and applies to every tab.
 */
export function Shell({ expense, todo, ads, themeStorage, now, win }: ShellProps) {
  // Stores are created once per shell (or injected by tests / hosts).
  const expenseStore = useMemo(() => expense?.store ?? createExpenseStore(), [expense?.store]);
  const todoStore = useMemo(() => todo?.store ?? createTodoStore(), [todo?.store]);
  const storage = useMemo(() => themeStorage ?? createThemeStorage(), [themeStorage]);
  // The theme used to live in the Expense Tracker's settings; a saved choice there
  // is adopted on first load so existing users keep their dark/light mode.
  const [theme, setTheme] = useThemeController(storage, expenseStore.getState().preferences.theme);
  const [route, go] = useHashRoute(win ?? window);
  const clock = useMemo(() => now ?? (() => new Date()), [now]);

  useEffect(() => {
    const tab = TABS.find((t) => t.id === route.tab);
    if (tab) document.title = tab.title;
  }, [route.tab]);

  const pane = (id: TabId) => ({ className: 'shell__pane', 'data-app': id, 'aria-label': TABS.find((t) => t.id === id)?.label, hidden: route.tab !== id });

  return (
    <NowContext.Provider value={clock}>
      <ThemeContext.Provider value={theme}>
        <div className="shell">
          <TabStrip active={route.tab} theme={theme} onTheme={setTheme} />
          <section {...pane('expenses')}>
            <ExpenseTrackerApp store={expenseStore} />
          </section>
          <section {...pane('todos')}>
            <TodoManagerApp store={todoStore} page={route.tab === 'todos' ? (route.page as TodoPage) : undefined} onNavigate={(page) => go(hashFor('todos', page))} />
          </section>
          <section {...pane('ads')}>
            <AdsCampaignApp api={ads?.api} route={route.tab === 'ads' ? { page: route.page as AdsPage, id: route.id ?? null } : undefined} onNavigate={(r) => go(hashFor('ads', r.page, r.id))} />
          </section>
        </div>
      </ThemeContext.Provider>
    </NowContext.Provider>
  );
}
