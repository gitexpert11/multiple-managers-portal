/**
 * Contract test: drives the real HTTP client against a running backend.
 * Opt-in: `ADS_API_URL=http://localhost:8000/api/v1 npx vitest run client.integration`
 */
import { describe, expect, it } from 'vitest';
import { ApiError, createAdsApi } from './client';

const baseUrl = process.env.ADS_API_URL;
const TODAY = '2025-03-15';

describe.skipIf(!baseUrl)('Ads API client ↔ FastAPI backend', () => {
  const api = createAdsApi({ baseUrl });
  const query = { from: '2025-02-14', to: TODAY, filter: { status: 'all' as const, type: null, query: '' } };

  it('runs the campaign lifecycle end to end', async () => {
    const created = await api.createCampaign({ name: 'Contract test', dailyBudget: 2500, type: 'sponsored_products', products: [{ id: 'SKU-1001', sku: 'SKU-1001', name: 'Headphones', category: 'Electronics', price: 14999 }], startDate: TODAY });
    expect(created.id).toMatch(/^cmp_/);
    expect(created.status).toBe('active');
    expect(created.createdAt).toMatch(/T/);

    const page = await api.listCampaigns({ ...query, sort: 'createdAt', dir: 'desc', page: 1, pageSize: 5, filter: { ...query.filter, query: 'Contract test' } });
    expect(page.items.map((c) => c.id)).toContain(created.id);
    expect(page.aggregates.campaigns).toBeGreaterThan(0);
    expect(page.items[0]?.metrics).toMatchObject({ days: 0, roas: 0 });

    const summary = await api.getSummary(query);
    expect(summary.range).toEqual({ from: '2025-02-14', to: TODAY, days: 30 });
    expect(summary.previousRange.days).toBe(30);
    const series = await api.getSeries(query);
    expect(series.points).toHaveLength(30);

    const updated = await api.updateCampaign(created.id, { name: 'Contract test v2', status: 'paused', endDate: '2025-04-01' });
    expect(updated).toMatchObject({ name: 'Contract test v2', status: 'paused', endDate: '2025-04-01' });
    await expect(api.updateCampaign(created.id, { type: 'sponsored_brands' })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('type cannot be changed') });

    expect((await api.applyStatus(created.id, 'resume')).status).toBe('active');
    expect((await api.applyStatus(created.id, 'archive')).status).toBe('archived');
    expect((await api.applyStatus(created.id, 'unarchive')).status).toBe('paused');

    const copy = await api.duplicateCampaign(created.id, TODAY);
    expect(copy.name).toMatch(/^Copy of Contract test v2/);
    expect(copy.status).toBe('paused');

    await api.deleteCampaign(created.id);
    await expect(api.getCampaign(created.id)).rejects.toBeInstanceOf(ApiError);
    expect((await api.restoreCampaign(created.id)).id).toBe(created.id);

    const products = await api.listProducts({ q: 'coffee' });
    expect(products.items.map((p) => p.id)).toEqual(['SKU-6001']);
    expect((await api.updatePreferences({ currency: 'EUR' })).currency).toBe('EUR');
    expect((await api.updatePreferences({ currency: 'USD' })).currency).toBe('USD');

    const datasets = await api.loadDataset('sample', TODAY);
    expect(datasets.status.sample.present).toBe(true);
    expect((await api.removeDataset('sample')).status.sample.present).toBe(false);

    // Clean up what we created.
    await api.deleteCampaign(created.id);
    await api.deleteCampaign(copy.id);
  });

  it('turns validation errors into readable messages', async () => {
    await expect(api.createCampaign({ name: '', dailyBudget: 50, type: 'sponsored_products', products: [] })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/name|budget|product/i) });
  });
});
