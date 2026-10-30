import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBackend, createStorage } from '@shared/storage/createStorage';
import { NOW, renderWithProviders } from '@/test/utils';
import { TodoManagerApp } from './TodoManagerApp';
import { createStore, STORAGE_KEY, type TodoStore } from './store/store';

let backend: ReturnType<typeof createMemoryBackend>;
let store: TodoStore;

function mount(props: Partial<React.ComponentProps<typeof TodoManagerApp>> = {}) {
  store = createStore({ storage: createStorage(STORAGE_KEY, backend) });
  return renderWithProviders(<TodoManagerApp store={store} {...props} />, { now: NOW });
}

const summary = (kind: string) => screen.getByTestId(`todo-summary-${kind}`).textContent;
const dashboard = () => screen.getByTestId('todo-dashboard').closest('[data-page]') as HTMLElement;
const createPage = () => screen.getByTestId('todo-create').closest('[data-page]') as HTMLElement;
const taskList = () => within(screen.getByRole('list', { name: 'Tasks' }));

async function createTask(name: string, endDate = '2025-03-20') {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('todo-new-task'));
  await user.type(screen.getByLabelText('Task name'), name);
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: endDate } });
  fireEvent.submit(screen.getByRole('form', { name: 'Create task' }));
}

beforeEach(() => {
  backend = createMemoryBackend();
});

describe('TodoManagerApp', () => {
  it('shows the dashboard for the current month with empty states', () => {
    mount();
    expect(dashboard()).not.toHaveAttribute('hidden');
    expect(createPage()).toHaveAttribute('hidden');
    expect(summary('open')).toBe('0');
    expect(screen.getByText('No tasks due in March 2025.')).toBeInTheDocument();
  });

  it('creates a task from the create page and returns to the dashboard', async () => {
    const onNavigate = vi.fn();
    mount({ onNavigate });
    await createTask('Write report');
    expect(onNavigate).toHaveBeenLastCalledWith('dashboard');
    expect(dashboard()).not.toHaveAttribute('hidden');
    expect(summary('open')).toBe('1');
    const item = taskList().getByRole('listitem');
    expect(item).toHaveTextContent('Write report');
    expect(item).toHaveTextContent('5 days left');
    expect(JSON.parse(backend.getItem(STORAGE_KEY) as string).data.tasks).toHaveLength(1);
  });

  it('validates the name and rejects past end dates', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByTestId('todo-new-task'));
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2025-03-01' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create task' }));
    expect(screen.getByText('Give the task a name')).toBeInTheDocument();
    expect(screen.getByText('End date cannot be in the past')).toBeInTheDocument();
    expect(store.getState().tasks).toHaveLength(0);
  });

  it('completes, reopens and deletes (with undo) a task', async () => {
    const user = userEvent.setup();
    mount();
    await createTask('Call Mum');
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Call Mum" as completed' }));
    expect(summary('completed')).toBe('1');
    expect(taskList().getByRole('listitem')).toHaveTextContent('Completed');
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Call Mum" as open' }));
    expect(summary('open')).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Delete "Call Mum"' }));
    expect(summary('open')).toBe('0');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(summary('open')).toBe('1');
  });

  it('follows a task due in another month and filters by status and category', async () => {
    const user = userEvent.setup();
    mount();
    await createTask('Book flights', '2025-04-10');
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveValue('4');
    await createTask('Pay bill', '2025-04-12');
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Pay bill" as completed' }));

    await user.click(screen.getByLabelText('Open'));
    expect(taskList().getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByLabelText('Completed'));
    expect(taskList().getByRole('listitem')).toHaveTextContent('Pay bill');
    await user.click(screen.getByLabelText('All'));
    await user.click(within(screen.getByRole('group', { name: 'Filter by category' })).getByRole('button', { name: 'Travel' }));
    expect(screen.getByText('No tasks match these filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(taskList().getAllByRole('listitem')).toHaveLength(2);
  });

  it('loads sample data across three months and points at overdue tasks elsewhere', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByTestId('todo-sample-data-toggle'));
    expect(store.getState().tasks.length).toBeGreaterThan(20);
    expect(Number(summary('open'))).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByTestId('todo-overdue-elsewhere')).toBeInTheDocument();
    await user.click(screen.getByTestId('todo-sample-data-toggle'));
    expect(store.getState().tasks).toHaveLength(0);
  });
});
