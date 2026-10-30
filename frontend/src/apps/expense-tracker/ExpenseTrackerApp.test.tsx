import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBackend, createStorage } from '@shared/storage/createStorage';
import { NOW, renderWithProviders } from '@/test/utils';
import { ExpenseTrackerApp } from './ExpenseTrackerApp';
import { createStore, STORAGE_KEY, type ExpenseStore } from './store/store';

let backend: ReturnType<typeof createMemoryBackend>;
let store: ExpenseStore;

function mount() {
  store = createStore({ storage: createStorage(STORAGE_KEY, backend) });
  return renderWithProviders(<ExpenseTrackerApp store={store} />, { now: NOW });
}

const summary = (kind: string) => screen.getByTestId(`summary-${kind}`).textContent;

async function addTransaction(amount: string, description = '', type: 'expense' | 'income' = 'expense') {
  const user = userEvent.setup();
  if (type === 'income') await user.click(screen.getByLabelText('Income'));
  await user.clear(screen.getByLabelText('Amount'));
  await user.type(screen.getByLabelText('Amount'), amount);
  if (description) await user.type(screen.getByLabelText('Description'), description);
  fireEvent.submit(screen.getByRole('form', { name: 'Add transaction' }));
}

beforeEach(() => {
  backend = createMemoryBackend();
});

describe('ExpenseTrackerApp', () => {
  it('renders the dashboard for the current month with empty states', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Expense Tracker' })).toBeInTheDocument();
    expect(summary('income')).toBe('$0.00');
    expect(summary('expenses')).toBe('$0.00');
    expect(screen.getByText(/No expense transactions in March 2025/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveValue('3');
    expect(screen.getByRole('combobox', { name: 'Year' })).toHaveValue('2025');
  });

  it('adds an expense and an income, updates the cards and grids, and persists', async () => {
    mount();
    await addTransaction('12.50', 'Lunch');
    expect(summary('expenses')).toBe('$12.50');
    expect(within(screen.getByTestId('grid-expense')).getByText('Lunch')).toBeInTheDocument();

    await addTransaction('1000', 'Salary', 'income');
    expect(summary('income')).toBe('$1,000.00');
    expect(summary('remaining')).toBe('$987.50');

    const saved = JSON.parse(backend.getItem(STORAGE_KEY) as string);
    expect(saved.data.transactions).toHaveLength(2);
    expect(screen.getAllByTestId('toast').at(-1)).toHaveTextContent('Income of $1,000.00 added');
  });

  it('rejects an invalid amount with an inline error', async () => {
    mount();
    await addTransaction('abc');
    expect(screen.getByText('Enter a positive amount, e.g. 12.50')).toBeInTheDocument();
    expect(store.getState().transactions).toHaveLength(0);
  });

  it('edits a transaction through the form and deletes with undo', async () => {
    const user = userEvent.setup();
    mount();
    await addTransaction('20', 'Taxi');
    await user.click(screen.getByRole('button', { name: 'Edit Taxi' }));
    expect(screen.getByRole('heading', { name: 'Edit transaction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue('20.00');
    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '25');
    fireEvent.submit(screen.getByRole('form', { name: 'Edit transaction' }));
    expect(summary('expenses')).toBe('$25.00');
    expect(screen.getByRole('heading', { name: 'Add transaction' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Taxi' }));
    expect(summary('expenses')).toBe('$0.00');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(summary('expenses')).toBe('$25.00');
  });

  it('filters a grid by category from the legend and clears it', async () => {
    const user = userEvent.setup();
    mount();
    await addTransaction('10', 'Coffee'); // Food & Dining (default)
    await user.selectOptions(screen.getByLabelText('Category'), 'cat_transport');
    await addTransaction('30', 'Bus');
    const grid = screen.getByTestId('grid-expense');
    expect(within(grid).getAllByRole('row')).toHaveLength(4); // header + 2 + footer

    await user.click(within(screen.getByTestId('chart-expense')).getByRole('button', { name: /Transport/ }));
    expect(within(grid).queryByText('Coffee')).not.toBeInTheDocument();
    expect(within(grid).getByText('Bus')).toBeInTheDocument();
    // The income grid is not affected by an expense category filter.
    expect(screen.getByTestId('grid-income')).toHaveTextContent('No income transactions');

    await user.click(within(grid).getByRole('button', { name: 'Show all categories' }));
    expect(within(grid).getByText('Coffee')).toBeInTheDocument();
  });

  it('loads and removes sample data', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByTestId('sample-data-toggle'));
    expect(store.getState().transactions.length).toBeGreaterThan(100);
    expect(screen.getByTestId('sample-data-toggle')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('sample-data-toggle'));
    expect(store.getState().transactions).toHaveLength(0);
  });

  it('navigates months with the picker, never past the current month', async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveValue('2');
    expect(screen.getAllByText(/February 2025 · 0 entries/)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveValue('3');
  });

  it('opens the export dialog with a live preview', async () => {
    const user = userEvent.setup();
    mount();
    await addTransaction('12.50', 'Lunch');
    await user.click(screen.getByTestId('export-open'));
    expect(screen.getByTestId('export-preview')).toHaveTextContent('1 transaction · income $0.00 · expenses $12.50');
    expect(screen.getByTestId('export-download')).toBeEnabled();
  });
});
