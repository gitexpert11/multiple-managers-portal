import { act, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createMemoryBackend, createStorage } from '@shared/storage/createStorage';
import { createStore as createExpenseStore, STORAGE_KEY as EXPENSE_KEY } from '@/apps/expense-tracker/store/store';
import { createStore as createTodoStore, STORAGE_KEY as TODO_KEY } from '@/apps/todo-manager/store/store';
import { createFakeApi, type FakeApi } from '@/apps/ads-campaign-manager/test/fakeApi';
import { NOW } from '@/test/utils';
import { hashFor, parseRoute, TABS } from './routes';
import { Shell } from './Shell';
import { createThemeStorage, THEME_STORAGE_KEY } from './theme';

let backend: ReturnType<typeof createMemoryBackend>;
let api: FakeApi;

function mount() {
  api = createFakeApi({ today: '2025-03-15' });
  return render(
    <Shell
      expense={{ store: createExpenseStore({ storage: createStorage(EXPENSE_KEY, backend) }) }}
      todo={{ store: createTodoStore({ storage: createStorage(TODO_KEY, backend) }) }}
      ads={{ api }}
      themeStorage={createThemeStorage(backend)}
      now={() => NOW}
    />,
  );
}

const pane = (id: string) => document.querySelector(`.shell__pane[data-app=${id}]`) as HTMLElement;
const tab = (id: string) => document.querySelector(`.shell__tab[data-tab=${id}]`) as HTMLElement;
async function navigate(hash: string) {
  window.location.hash = hash;
  await act(async () => {
    window.dispatchEvent(new Event('hashchange'));
  });
}

beforeEach(() => {
  window.location.hash = '';
  backend = createMemoryBackend();
});

afterEach(() => {
  window.location.hash = '';
  document.documentElement.removeAttribute('data-theme');
});

describe('routing helpers', () => {
  it('parses hashes into tab + page, defaulting to the expense tracker', () => {
    expect(parseRoute('')).toEqual({ tab: 'expenses', page: 'dashboard' });
    expect(parseRoute('#/todos/new')).toEqual({ tab: 'todos', page: 'new' });
    expect(parseRoute('#/todos/whatever')).toEqual({ tab: 'todos', page: 'dashboard' });
    expect(parseRoute('#/ads/edit/cmp_1/')).toEqual({ tab: 'ads', page: 'edit', id: 'cmp_1' });
    expect(parseRoute('#/ads/edit/a%20b')).toEqual({ tab: 'ads', page: 'edit', id: 'a b' });
    expect(parseRoute('#/ads/edit/%E0%A4%A')).toEqual({ tab: 'ads', page: 'edit', id: '%E0%A4%A' });
    expect(parseRoute('#/ads/edit')).toEqual({ tab: 'ads', page: 'dashboard' });
    expect(parseRoute('#/todos/edit/task_1')).toEqual({ tab: 'todos', page: 'dashboard' });
    expect(parseRoute('#/nope')).toEqual({ tab: 'expenses', page: 'dashboard' });
  });

  it('builds hashes for every tab/page', () => {
    expect(hashFor('expenses')).toBe('#/expenses');
    expect(hashFor('todos', 'new')).toBe('#/todos/new');
    expect(hashFor('ads', 'edit', 'a b')).toBe('#/ads/edit/a%20b');
    expect(hashFor('ads', 'edit')).toBe('#/ads');
    expect(hashFor('todos', 'edit', 'task_1')).toBe('#/todos');
    expect(hashFor('nope', 'new')).toBe('#/expenses');
    expect(TABS.map((t) => t.id)).toEqual(['expenses', 'todos', 'ads']);
  });
});

describe('Shell', () => {
  it('renders three tabs, mounts every app up front and opens on the Expense Tracker', () => {
    mount();
    expect([...document.querySelectorAll('.shell__tab')].map((a) => a.textContent)).toEqual(['Expense Tracker', 'Todo Manager', 'Ads Campaign Management']);
    expect(pane('expenses')).not.toHaveAttribute('hidden');
    expect(pane('todos')).toHaveAttribute('hidden');
    expect(pane('ads')).toHaveAttribute('hidden');
    expect(tab('expenses')).toHaveAttribute('aria-current', 'page');
    expect(window.location.hash).toBe('#/expenses');
    expect(document.title).toBe('Expense Tracker');
    expect(within(pane('todos')).getByRole('heading', { name: 'Todo Manager', hidden: true })).toBeInTheDocument();
    expect(within(pane('ads')).getByRole('heading', { name: 'Ads Campaign Management', hidden: true })).toBeInTheDocument();
  });

  it('switches tabs and pages from the URL hash', async () => {
    mount();
    await navigate('#/todos/new');
    expect(pane('todos')).not.toHaveAttribute('hidden');
    expect(pane('expenses')).toHaveAttribute('hidden');
    expect(tab('todos')).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('Todo Manager');
    expect(pane('todos').querySelector('[data-page=new]')).not.toHaveAttribute('hidden');

    await navigate('#/ads/new');
    expect(pane('ads')).not.toHaveAttribute('hidden');
    expect(pane('ads').querySelector('[data-page=new]')).not.toHaveAttribute('hidden');
    await navigate('#/ads');
    expect(pane('ads').querySelector('[data-page=dashboard]')).not.toHaveAttribute('hidden');
  });

  it('mirrors in-app navigation into the URL', async () => {
    const user = userEvent.setup();
    mount();
    await navigate('#/todos');
    await user.click(within(pane('todos')).getByTestId('todo-new-task'));
    expect(window.location.hash).toBe('#/todos/new');
    await user.click(within(pane('todos')).getByRole('button', { name: 'Cancel' }));
    expect(window.location.hash).toBe('#/todos');

    await navigate('#/ads');
    await user.click(within(pane('ads')).getByTestId('ads-new-campaign'));
    expect(window.location.hash).toBe('#/ads/new');
  });

  it('keeps each app\'s data under its own storage key', async () => {
    const user = userEvent.setup();
    mount();
    fireEvent.change(within(pane('expenses')).getByLabelText('Amount'), { target: { value: '12.50' } });
    fireEvent.submit(within(pane('expenses')).getByRole('form', { name: 'Add transaction' }));

    await navigate('#/todos/new');
    await user.type(within(pane('todos')).getByLabelText('Task name'), 'Write tests');
    fireEvent.change(within(pane('todos')).getByLabelText('End date'), { target: { value: '2025-03-20' } });
    fireEvent.submit(within(pane('todos')).getByRole('form', { name: 'Create task' }));

    const expense = JSON.parse(backend.getItem(EXPENSE_KEY) as string);
    const todo = JSON.parse(backend.getItem(TODO_KEY) as string);
    expect(expense.data.transactions).toHaveLength(1);
    expect(expense.data.tasks).toBeUndefined();
    expect(todo.data.tasks).toHaveLength(1);
    expect(todo.data.transactions).toBeUndefined();
    // The ads tab talks to the API, not to localStorage.
    expect(backend.getItem('ads-campaign-manager-ng')).toBeNull();
    await waitFor(() => expect(api.calls).toContain('listCampaigns'));
  });

  it('applies the workspace theme to <html> and persists it', () => {
    mount();
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    // (id lookups: accessible-name queries over the whole three-app DOM are slow in jsdom)
    const radio = (value: string) => document.getElementById(`shell-theme-${value}`) as HTMLInputElement;
    fireEvent.click(radio('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(JSON.parse(backend.getItem(THEME_STORAGE_KEY) as string).data.theme).toBe('dark');
    fireEvent.click(radio('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    fireEvent.click(radio('system'));
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('restores a saved theme on start-up', () => {
    createThemeStorage(backend).save('dark');
    mount();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.getElementById('shell-theme-dark')).toBeChecked();
  });
});

describe('legacy theme migration', () => {
  it('adopts a theme previously saved in the Expense Tracker preferences', () => {
    const store = createExpenseStore({ storage: createStorage(EXPENSE_KEY, backend) });
    store.setPreferences({ theme: 'dark' });
    api = createFakeApi();
    render(<Shell expense={{ store }} ads={{ api }} themeStorage={createThemeStorage(backend)} now={() => NOW} />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(JSON.parse(backend.getItem(THEME_STORAGE_KEY) as string).data.theme).toBe('dark');
  });
});
