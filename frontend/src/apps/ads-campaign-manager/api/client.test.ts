import { describe, expect, it, vi } from 'vitest';
import { ApiError, createAdsApi, describeApiError } from './client';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('createAdsApi', () => {
  it('builds query strings from the dashboard query and camelCase params', async () => {
    const fetchImpl = fakeFetch(200, { items: [] });
    const api = createAdsApi({ baseUrl: 'http://x/api/v1/', fetchImpl });
    await api.listCampaigns({ from: '2025-02-14', to: '2025-03-15', filter: { status: 'paused', type: 'sponsored_brands', query: ' bottle ' }, sort: 'spend', dir: 'asc', page: 2, pageSize: 10, locate: 'cmp_1' });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/v1/campaigns');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ from: '2025-02-14', to: '2025-03-15', status: 'paused', type: 'sponsored_brands', q: 'bottle', sort: 'spend', dir: 'asc', page: '2', pageSize: '10', locate: 'cmp_1' });
    expect(init.method).toBe('GET');

    await api.getSummary({ from: '2025-02-14', to: '2025-03-15', filter: { status: 'all', type: null, query: '' } });
    const [summaryUrl] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1] as [string];
    expect(Object.fromEntries(new URL(summaryUrl).searchParams)).toEqual({ from: '2025-02-14', to: '2025-03-15' }); // "all" is the server default
  });

  it('sends JSON bodies and encodes ids', async () => {
    const fetchImpl = fakeFetch(200, { id: 'a b' });
    const api = createAdsApi({ baseUrl: 'http://x/api/v1', fetchImpl });
    await api.updateCampaign('a b', { name: 'x', endDate: null });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://x/api/v1/campaigns/a%20b');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'x', endDate: null });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    await api.applyStatus('a', 'toggle-status');
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]).toBe('http://x/api/v1/campaigns/a/toggle-status');
  });

  it('handles 204, API errors and network failures', async () => {
    await expect(createAdsApi({ baseUrl: 'http://x', fetchImpl: fakeFetch(204, undefined) }).deleteCampaign('a')).resolves.toBeUndefined();

    const notFound = createAdsApi({ baseUrl: 'http://x', fetchImpl: fakeFetch(404, { detail: 'Campaign not found' }) });
    await expect(notFound.getCampaign('a')).rejects.toMatchObject({ status: 404, message: 'Campaign not found' });

    const invalid = createAdsApi({ baseUrl: 'http://x', fetchImpl: fakeFetch(422, { detail: [{ loc: ['body', 'dailyBudget'], msg: 'Value error, Daily budget must be at least $1.00' }] }) });
    await expect(invalid.createCampaign({ name: 'x', dailyBudget: 1, type: 'sponsored_products', products: [] })).rejects.toMatchObject({ message: 'dailyBudget: Daily budget must be at least $1.00' });

    const offline = createAdsApi({
      baseUrl: 'http://x',
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch,
    });
    const err = await offline.getPreferences().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toBe('Could not reach the server');
  });

  it('describes error bodies', () => {
    expect(describeApiError(500, 'boom')).toBe('Request failed (500)');
    expect(describeApiError(422, { detail: [{ msg: 'bad', loc: ['body'] }] })).toBe('bad');
    expect(describeApiError(0, null)).toBe('Could not reach the server');
  });
});
