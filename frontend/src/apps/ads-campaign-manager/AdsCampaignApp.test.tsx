import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOW, renderWithProviders } from '@/test/utils';
import { AdsCampaignApp, type AdsRoute } from './AdsCampaignApp';
import { createFakeApi, type FakeApi } from './test/fakeApi';

let api: FakeApi;

function mount(props: { route?: AdsRoute; onNavigate?: (r: AdsRoute) => void } = {}) {
  return renderWithProviders(<AdsCampaignApp api={api} {...props} />, { now: NOW });
}

const grid = () => screen.getByTestId('ads-campaigns');
const rows = () => within(grid()).queryAllByRole('row').filter((r) => r.hasAttribute('data-id'));
const names = () => rows().map((r) => r.querySelector('.ads-grid__name')?.textContent);
const summary = (metric: string) => screen.getByTestId(`ads-summary-${metric}`).textContent;
const dashboardPage = () => document.querySelector('[data-page=dashboard]') as HTMLElement;
const createPage = () => document.querySelector('[data-page=new]') as HTMLElement;
const editPage = () => document.querySelector('[data-page=edit]') as HTMLElement;

async function settled() {
  await waitFor(() => expect(grid()).toHaveAttribute('aria-busy', 'false'));
}

const form = (page: HTMLElement) => within(page);

async function pickProducts(...ids: string[]) {
  const user = userEvent.setup();
  await user.click(screen.getAllByTestId(/ads-(edit-)?add-products/).find((b) => !b.closest('[hidden]')) as HTMLElement);
  for (const id of ids) {
    const box = await screen.findByRole('checkbox', { name: new RegExp(id) });
    await user.click(box);
  }
  await user.click(screen.getByTestId('ads-picker-confirm'));
}

async function createCampaign({ name = 'Spring Sale', budget = '25', products = ['SKU-1001'] }: { name?: string; budget?: string; products?: string[] } = {}) {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('ads-new-campaign'));
  if (name) await user.type(form(createPage()).getByLabelText('Campaign name'), name);
  if (budget) await user.type(form(createPage()).getByLabelText('Daily budget'), budget);
  if (products.length) await pickProducts(...products);
  fireEvent.submit(form(createPage()).getByRole('form', { name: 'Create campaign' }));
  await waitFor(() => expect(api.calls.filter((c) => c === 'createCampaign').length).toBeGreaterThan(0));
  await settled();
}

beforeEach(() => {
  api = createFakeApi({ today: '2025-03-15' });
});

describe('AdsCampaignApp', () => {
  it('renders the dashboard from the API with empty states', async () => {
    mount();
    await settled();
    expect(screen.getByRole('heading', { name: 'Ads Campaign Management' })).toBeInTheDocument();
    expect(screen.getByTestId('ads-period-label')).toHaveTextContent('Feb 14 – Mar 15, 2025 · 30 days');
    expect(screen.getByTestId('ads-summary').querySelectorAll('.ads-card')).toHaveLength(6);
    expect(summary('spend')).toBe('$0.00');
    expect(summary('roas')).toBe('0x');
    expect(within(grid()).getByText('No campaigns yet.')).toBeInTheDocument();
    expect(screen.getByTestId('ads-chart')).toHaveTextContent('Create a campaign (or load sample data)');
    expect(api.calls).toEqual(expect.arrayContaining(['getPreferences', 'getSummary', 'getSeries', 'listCampaigns']));
  });

  it('creates a campaign through the form + product picker and shows it highlighted on the dashboard', async () => {
    const onNavigate = vi.fn();
    mount({ onNavigate });
    await settled();
    await createCampaign({ name: 'Spring Sale', budget: '25' });

    await waitFor(() => expect(names()).toEqual(['Spring Sale']));
    expect(onNavigate).toHaveBeenLastCalledWith({ page: 'dashboard' });
    expect(dashboardPage()).not.toHaveAttribute('hidden');
    expect(rows()[0]).toHaveClass('is-new');
    expect(rows()[0]).toHaveTextContent('$25.00');
    expect(rows()[0]).toHaveTextContent('Active');
    expect(api.campaigns[0]).toMatchObject({ name: 'Spring Sale', dailyBudget: 2500, startDate: '2025-03-15', products: [expect.objectContaining({ id: 'SKU-1001' })] });
    expect(screen.getAllByTestId('toast').at(-1)).toHaveTextContent('Campaign “Spring Sale” created');
    // Campaigns with nothing served in the period show dashes.
    expect(rows()[0]).toHaveAttribute('data-served', 'false');
  });

  it('validates the create form inline and does not call the API', async () => {
    const user = userEvent.setup();
    mount();
    await settled();
    await user.click(screen.getByTestId('ads-new-campaign'));
    await user.type(form(createPage()).getByLabelText('Daily budget'), '0.50');
    fireEvent.submit(form(createPage()).getByRole('form', { name: 'Create campaign' }));
    expect(screen.getByText('Give the campaign a name')).toBeInTheDocument();
    expect(screen.getByText('Daily budget must be at least $1.00')).toBeInTheDocument();
    expect(screen.getByText('Add at least one product')).toBeInTheDocument();
    expect(api.calls).not.toContain('createCampaign');
    expect(createPage()).not.toHaveAttribute('hidden');
  });

  it('surfaces API errors from a mutation as a toast and keeps the form', async () => {
    mount();
    await settled();
    api.failNext(1, undefined, 'createCampaign');
    await createCampaign();
    await waitFor(() => expect(screen.getAllByTestId('toast').at(-1)).toHaveTextContent('Server exploded'));
    expect(createPage()).not.toHaveAttribute('hidden');
  });

  it('shows period metrics, summary cards with deltas, and filters the grid', async () => {
    api.seed({ name: 'Headphones', performance: [{ date: '2025-03-10', impressions: 1000, clicks: 50, spend: 2500, conversions: 5, sales: 25000 }] });
    api.seed({ name: 'Bottles', type: 'sponsored_brands', status: 'paused', products: [{ id: 'SKU-2001', sku: 'SKU-2001', name: 'Insulated Bottle', category: 'Home & Kitchen', price: 2499 }], performance: [{ date: '2025-02-01', impressions: 10, clicks: 1, spend: 100, conversions: 0, sales: 0 }] });
    api.seed({ name: 'Old', status: 'archived' });
    const user = userEvent.setup();
    mount();
    await settled();

    expect(summary('spend')).toBe('$25.00');
    expect(summary('sales')).toBe('$250.00');
    expect(summary('roas')).toBe('10x');
    // Bottles spent $1.00 on Feb 1, inside the previous 30-day window: 2,500 / 100 = +2,400%.
    expect(screen.getByTestId('ads-summary-spend-change')).toHaveTextContent('+2,400.0% vs previous period');
    expect(screen.getByTestId('ads-summary-spend-change')).toHaveAttribute('data-tone', 'neutral');
    expect(screen.getByTestId('ads-summary-sales-change')).toHaveTextContent('New vs previous period');
    expect(names()).toEqual(['Bottles', 'Headphones']);
    expect(within(grid()).getByText(/1 archived hidden/)).toBeInTheDocument();
    expect(within(grid()).getByTestId('ads-grid-total-spend')).toHaveTextContent('$25.00');

    await user.click(within(grid()).getByLabelText('Paused'));
    await settled();
    expect(names()).toEqual(['Bottles']);
    await user.click(within(grid()).getByLabelText('Archived'));
    await settled();
    expect(names()).toEqual(['Old']);
    await user.click(within(grid()).getByLabelText('All'));
    await user.type(screen.getByTestId('ads-search'), 'bottle');
    await settled();
    expect(names()).toEqual(['Bottles']);
    await user.clear(screen.getByTestId('ads-search'));
    await user.click(within(grid()).getByRole('button', { name: 'Sponsored Products' }));
    await settled();
    expect(names()).toEqual(['Headphones']);
  });

  it('sorts by column and pages through results with the pager', async () => {
    for (let i = 1; i <= 12; i++) api.seed({ name: `Campaign ${String(i).padStart(2, '0')}`, dailyBudget: i * 100 });
    const user = userEvent.setup();
    mount();
    await settled();
    expect(names()).toHaveLength(5);
    expect(names()[0]).toBe('Campaign 12');
    expect(within(grid()).getByText('Showing 1–5 of 12 campaigns')).toBeInTheDocument();

    await user.click(within(grid()).getByRole('button', { name: 'Page 3' }));
    await settled();
    expect(names()).toEqual(['Campaign 02', 'Campaign 01']);

    await user.click(within(grid()).getByRole('button', { name: /Daily budget/ }));
    await settled();
    expect(names()[0]).toBe('Campaign 12'); // desc first
    await user.click(within(grid()).getByRole('button', { name: /Daily budget/ }));
    await settled();
    expect(names()[0]).toBe('Campaign 01');

    await user.selectOptions(within(grid()).getByLabelText('Rows per page'), '20');
    await settled();
    expect(names()).toHaveLength(12);
  });

  it('pauses, archives (with undo), duplicates and deletes (with undo) from the grid', async () => {
    api.seed({ name: 'Launch' });
    const user = userEvent.setup();
    mount();
    await settled();

    await user.click(screen.getByRole('button', { name: 'Pause "Launch"' }));
    await settled();
    expect(rows()[0]).toHaveAttribute('data-status', 'paused');
    await user.click(screen.getByRole('button', { name: 'Resume "Launch"' }));
    await settled();
    expect(rows()[0]).toHaveAttribute('data-status', 'active');

    await user.click(screen.getByRole('button', { name: 'More actions for "Launch"' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    await settled();
    expect(names()).toEqual(['Copy of Launch', 'Launch']);
    expect(rows()[0]).toHaveAttribute('data-status', 'paused');
    expect(rows()[0]).toHaveClass('is-new');

    await user.click(screen.getByRole('button', { name: 'More actions for "Launch"' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    await settled();
    expect(names()).toEqual(['Copy of Launch']);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await settled();
    expect(names()).toEqual(['Copy of Launch', 'Launch']);
    expect(api.campaigns.find((c) => c.name === 'Launch')?.status).toBe('active');

    await user.click(screen.getByRole('button', { name: 'More actions for "Copy of Launch"' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await settled();
    expect(names()).toEqual(['Launch']);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await settled();
    expect(names()).toEqual(['Copy of Launch', 'Launch']);
  });

  it('edits a campaign: locked type, dirty tracking, save returns to the dashboard', async () => {
    const c = api.seed({ name: 'Launch', performance: [{ date: '2025-03-01', impressions: 10, clicks: 1, spend: 100, conversions: 0, sales: 0 }] });
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    mount({ onNavigate });
    await settled();

    await user.click(screen.getByRole('button', { name: 'Edit "Launch"' }));
    expect(onNavigate).toHaveBeenLastCalledWith({ page: 'edit', id: c.id });
    await waitFor(() => expect(editPage().querySelector('#edit-campaign-name')).toHaveValue('Launch'));
    expect(screen.getByTestId('ads-edit-facts')).toHaveTextContent('Days with data1');
    expect(screen.getByTestId('ads-edit-dirty')).toHaveTextContent('No changes yet');
    expect(screen.getByTestId('ads-edit-submit')).toBeDisabled();
    expect(editPage().querySelector('#edit-campaign-type-sponsored_brands')).toBeDisabled();

    await user.clear(form(editPage()).getByLabelText('Campaign name'));
    await user.type(form(editPage()).getByLabelText('Campaign name'), 'Launch v2');
    expect(screen.getByTestId('ads-edit-dirty')).toHaveTextContent('You have unsaved changes');
    await user.click(editPage().querySelector('#edit-campaign-status-paused') as HTMLElement);
    fireEvent.submit(form(editPage()).getByRole('form', { name: 'Edit campaign' }));
    await waitFor(() => expect(names()).toEqual(['Launch v2']));

    expect(dashboardPage()).not.toHaveAttribute('hidden');
    expect(rows()[0]).toHaveAttribute('data-status', 'paused');
    expect(api.campaigns[0]?.performance).toHaveLength(1); // history kept
    expect(screen.getAllByTestId('toast').at(-1)).toHaveTextContent('Campaign “Launch v2” updated');
  });

  it('shows "not found" for an unknown id on the edit page', async () => {
    mount({ route: { page: 'edit', id: 'nope' } });
    await waitFor(() => expect(screen.getByTestId('ads-edit-not-found')).toBeInTheDocument());
    expect(screen.getByText('Campaign not found')).toBeInTheDocument();
  });

  it('loads and removes sample and dummy data through the API', async () => {
    const user = userEvent.setup();
    mount();
    await settled();
    await user.click(screen.getByTestId('ads-sample-data-toggle'));
    await settled();
    expect(screen.getByTestId('ads-sample-data-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid()).getByText('Showing 1–5 of 8 campaigns')).toBeInTheDocument();
    expect(summary('spend')).not.toBe('$0.00');

    await user.click(screen.getByTestId('ads-dummy-data-toggle'));
    await settled();
    expect(within(grid()).getByText(/of 97 campaigns/)).toBeInTheDocument(); // 8 + 96 − 7 archived
    await user.click(screen.getByTestId('ads-sample-data-toggle'));
    await settled();
    expect(within(grid()).getByText(/of 89 campaigns/)).toBeInTheDocument();
    await user.click(screen.getByTestId('ads-dummy-data-toggle'));
    await settled();
    expect(within(grid()).getByText('No campaigns yet.')).toBeInTheDocument();
  });

  it('changes the period and the display currency', async () => {
    api.seed({ name: 'Launch', performance: [{ date: '2025-03-14', impressions: 100, clicks: 10, spend: 1000, conversions: 1, sales: 5000 }] });
    const user = userEvent.setup();
    mount();
    await settled();
    await user.selectOptions(screen.getByTestId('ads-period-preset'), '7d');
    await settled();
    expect(screen.getByTestId('ads-period-label')).toHaveTextContent('Mar 9 – Mar 15, 2025 · 7 days');
    expect(summary('spend')).toBe('$10.00');

    await user.selectOptions(screen.getByTestId('ads-currency'), 'EUR');
    await waitFor(() => expect(summary('spend')).toBe('€10.00'));
    expect(api.calls).toContain('updatePreferences');
  });

  it('shows a retryable error banner when the dashboard cannot load', async () => {
    api.failNext(3);
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.getByTestId('ads-error')).toBeInTheDocument());
    expect(screen.getByTestId('ads-error')).toHaveTextContent('Server exploded');
    await user.click(within(screen.getByTestId('ads-error')).getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(screen.queryByTestId('ads-error')).not.toBeInTheDocument());
  });
});
