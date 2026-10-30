import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_DAILY_BUDGET, MAX_PRODUCTS, MIN_DAILY_BUDGET, NAME_MAX, copyName, createStore, normalizeCampaign, normalizePerformance, normalizePreferences, normalizeProducts } from '../src/store/store.js';
import { createMemoryBackend, createStorage, STORAGE_KEY } from '../src/store/storage.js';

const NOW = new Date(2025, 2, 15, 10);
const product = { id: 'SKU-1', sku: 'SKU-1', name: 'Headphones', category: 'Electronics', price: 14999 };
const valid = () => ({ name: 'Spring Sale', dailyBudget: 2500, type: 'sponsored_products', bidStrategy: 'auto', products: [product] });

let backend;
let store;

beforeEach(() => {
  backend = createMemoryBackend();
  store = createStore({ storage: createStorage(backend), now: () => NOW });
});

describe('normalizeCampaign', () => {
  it('accepts a valid payload and fills defaults', () => {
    expect(normalizeCampaign({ ...valid(), startDate: '2025-03-15' })).toEqual({
      name: 'Spring Sale',
      dailyBudget: 2500,
      type: 'sponsored_products',
      bidStrategy: 'auto',
      products: [product],
      status: 'active',
      startDate: '2025-03-15',
      endDate: null,
    });
  });

  it('accepts an optional end date on or after the start date', () => {
    const base = { ...valid(), startDate: '2025-03-15' };
    expect(normalizeCampaign({ ...base, endDate: '2025-04-01' }).endDate).toBe('2025-04-01');
    expect(normalizeCampaign({ ...base, endDate: '2025-03-15' }).endDate).toBe('2025-03-15');
    expect(normalizeCampaign({ ...base, endDate: '' }).endDate).toBeNull();
    expect(normalizeCampaign({ ...base, endDate: undefined }).endDate).toBeNull();
    expect(() => normalizeCampaign({ ...base, endDate: '2025-03-14' })).toThrow(/before the start date/);
    expect(() => normalizeCampaign({ ...base, endDate: '2025-02-30' })).toThrow(/End date/);
    expect(() => normalizeCampaign({ ...base, endDate: 'soon' })).toThrow(/End date/);
  });

  it('trims and caps the name', () => {
    expect(normalizeCampaign({ ...valid(), name: '  x  ', startDate: '2025-03-15' }).name).toBe('x');
    expect(normalizeCampaign({ ...valid(), name: 'a'.repeat(NAME_MAX + 10), startDate: '2025-03-15' }).name).toHaveLength(NAME_MAX);
  });

  it('negative: rejects missing or invalid fields', () => {
    const base = { ...valid(), startDate: '2025-03-15' };
    expect(() => normalizeCampaign(null)).toThrow(/Invalid campaign/);
    expect(() => normalizeCampaign({ ...base, name: '   ' })).toThrow(/name/);
    expect(() => normalizeCampaign({ ...base, dailyBudget: MIN_DAILY_BUDGET - 1 })).toThrow(/at least/);
    expect(() => normalizeCampaign({ ...base, dailyBudget: 12.5 })).toThrow(/at least/);
    expect(() => normalizeCampaign({ ...base, dailyBudget: 'abc' })).toThrow(/at least/);
    expect(() => normalizeCampaign({ ...base, dailyBudget: MAX_DAILY_BUDGET + 1 })).toThrow(/too large/);
    expect(() => normalizeCampaign({ ...base, type: 'banner' })).toThrow(/campaign type/);
    expect(() => normalizeCampaign({ ...base, bidStrategy: 'nope' })).toThrow(/bid strategy/);
    expect(() => normalizeCampaign({ ...base, bidStrategy: 'manual' })).toThrow(/not available/);
    expect(() => normalizeCampaign({ ...base, products: [] })).toThrow(/at least one product/);
    expect(() => normalizeCampaign({ ...base, products: [{ id: 'x' }] })).toThrow(/at least one product/); // no name -> dropped
    expect(() => normalizeCampaign({ ...base, startDate: '2025-02-30' })).toThrow(/Start date/);
    expect(() => normalizeCampaign({ ...base, startDate: undefined })).toThrow(/Start date/);
  });

  it('edge: unknown status falls back to active; bid strategy defaults to auto', () => {
    const c = normalizeCampaign({ ...valid(), bidStrategy: undefined, status: 'deleted', startDate: '2025-03-15' });
    expect(c.status).toBe('active');
    expect(c.bidStrategy).toBe('auto');
    expect(normalizeCampaign({ ...valid(), status: 'paused', startDate: '2025-03-15' }).status).toBe('paused');
    expect(normalizeCampaign({ ...valid(), status: 'archived', startDate: '2025-03-15' }).status).toBe('archived');
  });
});

describe('normalizeProducts', () => {
  it('snapshots id/sku/name/category/price, de-duplicates and drops junk', () => {
    expect(normalizeProducts([product, product, { id: 'SKU-2', name: 'Kettle', price: '19.9' }, { id: '', name: 'x' }, null, 'str'])).toEqual([
      product,
      { id: 'SKU-2', sku: 'SKU-2', name: 'Kettle', category: '', price: 20 },
    ]);
    expect(normalizeProducts(null)).toEqual([]);
    expect(normalizeProducts([{ id: 'a', name: 'A', price: -5 }])[0].price).toBe(0);
  });

  it('edge: caps the number of products', () => {
    const many = Array.from({ length: MAX_PRODUCTS + 20 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(normalizeProducts(many)).toHaveLength(MAX_PRODUCTS);
  });
});

describe('normalizePerformance', () => {
  const row = (date, over = {}) => ({ date, impressions: 10, clicks: 1, spend: 50, conversions: 0, sales: 0, ...over });

  it('sorts by date, de-duplicates (last wins) and rounds counters', () => {
    const out = normalizePerformance([row('2025-03-12'), row('2025-03-10', { spend: 10.4 }), row('2025-03-12', { spend: 99 })]);
    expect(out.map((r) => r.date)).toEqual(['2025-03-10', '2025-03-12']);
    expect(out[0].spend).toBe(10);
    expect(out[1].spend).toBe(99);
    expect(normalizePerformance(undefined)).toEqual([]);
    expect(normalizePerformance([{ date: '2025-03-10' }])[0]).toEqual({ date: '2025-03-10', impressions: 0, clicks: 0, spend: 0, conversions: 0, sales: 0 });
  });

  it('negative: strict mode throws on bad rows; lenient mode drops them', () => {
    expect(() => normalizePerformance([row('2025-02-30')])).toThrow(/valid date/);
    expect(() => normalizePerformance([row('2025-03-10', { clicks: -1 })])).toThrow(/clicks/);
    expect(() => normalizePerformance([row('2025-03-10', { spend: 'lots' })])).toThrow(/spend/);
    expect(() => normalizePerformance('nope')).toThrow(/array/);
    expect(normalizePerformance([row('2025-02-30'), row('2025-03-10')], { strict: false })).toHaveLength(1);
    expect(normalizePerformance('nope', { strict: false })).toEqual([]);
  });
});

describe('store', () => {
  it('keeps display preferences (currency) alongside the campaigns', () => {
    expect(store.getState().preferences).toEqual({ currency: 'USD' });
    expect(store.setPreferences({ currency: 'EUR' })).toEqual({ currency: 'EUR' });
    expect(JSON.parse(backend.getItem(STORAGE_KEY)).data).toEqual({ campaigns: [], preferences: { currency: 'EUR' } });
    expect(createStore({ storage: createStorage(backend) }).getState().preferences.currency).toBe('EUR');
    // Unknown currencies and keys are ignored; a missing/corrupt block falls back to USD.
    expect(store.setPreferences({ currency: 'XXX', theme: 'dark' })).toEqual({ currency: 'USD' });
    expect(store.setPreferences(null)).toEqual({ currency: 'USD' });
    expect(normalizePreferences(undefined)).toEqual({ currency: 'USD' });
    expect(normalizePreferences('junk')).toEqual({ currency: 'USD' });
    backend.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { campaigns: [], preferences: { currency: 'JPY' } } }));
    expect(createStore({ storage: createStorage(backend) }).getState().preferences).toEqual({ currency: 'JPY' });
    backend.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { campaigns: [] } })); // written before preferences existed
    expect(createStore({ storage: createStorage(backend) }).getState().preferences).toEqual({ currency: 'USD' });
  });

  it('starts empty and persists an envelope on first write', () => {
    expect(store.getState().campaigns).toEqual([]);
    expect(backend.getItem(STORAGE_KEY)).toBeNull();
    const c = store.addCampaign(valid());
    expect(c.id).toMatch(/^cmp_/);
    expect(c.startDate).toBe('2025-03-15'); // today, from `now`
    expect(c.status).toBe('active');
    expect(c.performance).toEqual([]);
    expect(c.createdAt).toBe(c.updatedAt);
    const envelope = JSON.parse(backend.getItem(STORAGE_KEY));
    expect(envelope.version).toBe(1);
    expect(envelope.data.campaigns).toHaveLength(1);
    expect(store.saveFailed).toBe(false);
  });

  it('reloads what it saved', () => {
    store.addCampaign(valid());
    const again = createStore({ storage: createStorage(backend) });
    expect(again.getState().campaigns.map((c) => c.name)).toEqual(['Spring Sale']);
  });

  it('notifies subscribers on every commit and supports unsubscribe', () => {
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.addCampaign(valid());
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    store.addCampaign(valid());
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('updates, pauses/resumes and deletes/restores', () => {
    vi.useFakeTimers({ now: NOW });
    const c = store.addCampaign(valid());
    vi.setSystemTime(NOW.getTime() + 5000);
    const u = store.updateCampaign(c.id, { name: 'Renamed', dailyBudget: 9900 });
    expect(u.name).toBe('Renamed');
    expect(u.dailyBudget).toBe(9900);
    expect(u.updatedAt).toBeGreaterThan(c.updatedAt);
    expect(store.toggleStatus(c.id).status).toBe('paused');
    expect(store.setStatus(c.id, 'paused').status).toBe('paused'); // idempotent
    expect(store.toggleStatus(c.id).status).toBe('active');
    vi.useRealTimers();

    const removed = store.deleteCampaign(c.id);
    expect(removed.name).toBe('Renamed');
    expect(store.getState().campaigns).toEqual([]);
    expect(store.deleteCampaign(c.id)).toBeNull();
    store.restoreCampaign(removed);
    expect(store.getState().campaigns.map((x) => x.id)).toEqual([c.id]);
    store.restoreCampaign(removed); // no duplicate
    expect(store.getState().campaigns).toHaveLength(1);
    store.restoreCampaign(null);
    expect(store.getState().campaigns).toHaveLength(1);
  });

  it('negative: operations on unknown ids throw; invalid patches throw and leave state intact', () => {
    expect(() => store.updateCampaign('nope', {})).toThrow(/not found/);
    expect(() => store.toggleStatus('nope')).toThrow(/not found/);
    expect(() => store.setStatus('nope', 'active')).toThrow(/not found/);
    expect(() => store.addPerformance('nope', [])).toThrow(/not found/);
    const c = store.addCampaign(valid());
    expect(() => store.setStatus(c.id, 'deleted')).toThrow(/Invalid status/);
    expect(() => store.updateCampaign(c.id, { dailyBudget: 1 })).toThrow();
    expect(() => store.addCampaign({ ...valid(), products: [] })).toThrow();
    expect(store.getState().campaigns).toHaveLength(1);
    expect(store.getState().campaigns[0].dailyBudget).toBe(2500);
  });

  it('merges performance rows by date', () => {
    const c = store.addCampaign(valid());
    store.addPerformance(c.id, [{ date: '2025-03-14', impressions: 100, clicks: 5, spend: 250, conversions: 1, sales: 1000 }]);
    store.addPerformance(c.id, [
      { date: '2025-03-15', impressions: 50 },
      { date: '2025-03-14', impressions: 120, clicks: 6, spend: 300, conversions: 1, sales: 1000 },
    ]);
    const rows = store.getState().campaigns[0].performance;
    expect(rows.map((r) => r.date)).toEqual(['2025-03-14', '2025-03-15']);
    expect(rows[0].impressions).toBe(120);
    expect(rows[1]).toEqual({ date: '2025-03-15', impressions: 50, clicks: 0, spend: 0, conversions: 0, sales: 0 });
    expect(() => store.addPerformance(c.id, [{ date: 'bad' }])).toThrow();
  });

  it('addCampaigns is atomic, keeps given ids/timestamps and skips duplicates', () => {
    const records = [
      { ...valid(), id: 'mock_1', startDate: '2025-03-01', createdAt: 5, updatedAt: 6, status: 'paused', performance: [{ date: '2025-03-02', spend: 10 }] },
      { ...valid(), id: 'mock_2', startDate: '2025-03-01' },
    ];
    const added = store.addCampaigns(records);
    expect(added.map((c) => c.id)).toEqual(['mock_1', 'mock_2']);
    expect(added[0]).toMatchObject({ createdAt: 5, updatedAt: 6, status: 'paused' });
    expect(added[0].performance).toEqual([{ date: '2025-03-02', impressions: 0, clicks: 0, spend: 10, conversions: 0, sales: 0 }]);
    expect(store.addCampaigns(records)).toEqual([]); // all duplicates
    expect(store.getState().campaigns).toHaveLength(2);

    expect(() => store.addCampaigns([{ ...valid(), id: 'mock_3', startDate: '2025-03-01' }, { name: '' }])).toThrow();
    expect(store.getState().campaigns).toHaveLength(2); // nothing from the failed batch
    expect(() => store.addCampaigns('nope')).toThrow(/array/);
    // A record without an id gets one.
    expect(store.addCampaigns([{ ...valid(), startDate: '2025-03-01' }])[0].id).toMatch(/^cmp_/);
  });

  it('removeCampaignsWhere returns the removed records', () => {
    store.addCampaigns([{ ...valid(), id: 'mock_1', startDate: '2025-03-01' }]);
    const mine = store.addCampaign(valid());
    const removed = store.removeCampaignsWhere((c) => c.id.startsWith('mock_'));
    expect(removed.map((c) => c.id)).toEqual(['mock_1']);
    expect(store.getState().campaigns.map((c) => c.id)).toEqual([mine.id]);
    expect(store.removeCampaignsWhere(() => false)).toEqual([]);
  });

  it('archive / unarchive keep the record and its history', () => {
    const c = store.addCampaign(valid());
    store.addPerformance(c.id, [{ date: '2025-03-14', spend: 100 }]);
    const archived = store.archiveCampaign(c.id);
    expect(archived.status).toBe('archived');
    expect(archived.performance).toHaveLength(1);
    expect(store.toggleStatus(c.id).status).toBe('active'); // toggle from archived resumes
    store.archiveCampaign(c.id);
    expect(store.unarchiveCampaign(c.id).status).toBe('paused'); // comes back paused
    expect(store.unarchiveCampaign(c.id).status).toBe('paused'); // idempotent on a live campaign
    expect(store.getState().campaigns[0].performance).toHaveLength(1);
    expect(() => store.archiveCampaign('nope')).toThrow(/not found/);
    expect(() => store.unarchiveCampaign('nope')).toThrow(/not found/);
  });

  it('duplicateCampaign creates a paused copy with the same settings, a new id and no history', () => {
    vi.useFakeTimers({ now: NOW });
    const source = store.addCampaign({ ...valid(), products: [product, { id: 'SKU-2', name: 'Kettle', price: 10 }] });
    store.addPerformance(source.id, [{ date: '2025-03-14', spend: 100 }]);
    store.updateCampaign(source.id, { status: 'active' });
    vi.setSystemTime(NOW.getTime() + 60_000);
    const copy = store.duplicateCampaign(source.id);
    expect(copy.id).not.toBe(source.id);
    expect(copy.id).toMatch(/^cmp_/);
    expect(copy).toMatchObject({ name: 'Copy of Spring Sale', dailyBudget: 2500, type: 'sponsored_products', bidStrategy: 'auto', status: 'paused', startDate: '2025-03-15', endDate: null, performance: [] });
    expect(copy.products).toEqual(store.getState().campaigns[0].products);
    expect(copy.products).not.toBe(store.getState().campaigns[0].products); // a snapshot, not shared
    expect(copy.createdAt).toBeGreaterThan(source.createdAt);
    expect(store.getState().campaigns).toHaveLength(2);
    // The original is untouched.
    expect(store.getState().campaigns[0]).toMatchObject({ name: 'Spring Sale', status: 'active' });
    expect(store.getState().campaigns[0].performance).toHaveLength(1);
    // Copying again numbers the name; copying an archived campaign still yields a paused copy.
    expect(store.duplicateCampaign(source.id).name).toBe('Copy of Spring Sale (2)');
    store.archiveCampaign(source.id);
    expect(store.duplicateCampaign(source.id).status).toBe('paused');
    expect(() => store.duplicateCampaign('nope')).toThrow(/not found/);
    // A future end date is copied; one already in the past is dropped.
    store.updateCampaign(source.id, { endDate: '2025-04-30' });
    expect(store.duplicateCampaign(source.id).endDate).toBe('2025-04-30');
    store.updateCampaign(source.id, { startDate: '2025-01-01', endDate: '2025-02-01' });
    expect(store.duplicateCampaign(source.id).endDate).toBeNull();
    vi.useRealTimers();
  });

  it('copyName numbers duplicates case-insensitively and respects the length limit', () => {
    expect(copyName('X')).toBe('Copy of X');
    expect(copyName('X', ['copy of x'])).toBe('Copy of X (2)');
    expect(copyName('X', ['Copy of X', 'Copy of X (2)', 'Copy of X (3)'])).toBe('Copy of X (4)');
    const long = 'a'.repeat(NAME_MAX);
    expect(copyName(long)).toHaveLength(NAME_MAX);
    expect(copyName(long, [copyName(long)])).toHaveLength(NAME_MAX);
    expect(copyName(long, [copyName(long)]).endsWith(' (2)')).toBe(true);
  });

  it('clearAll wipes state and leaves an empty envelope behind', () => {
    store.addCampaign(valid());
    store.clearAll();
    expect(store.getState().campaigns).toEqual([]);
    expect(JSON.parse(backend.getItem(STORAGE_KEY)).data.campaigns).toEqual([]);
  });

  it('repairs or drops corrupt records on load', () => {
    backend.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        data: {
          campaigns: [
            { id: 'ok', ...valid(), startDate: '2025-03-01', performance: [{ date: 'bad' }, { date: '2025-03-02', spend: 5 }] },
            { id: 'ok', ...valid(), startDate: '2025-03-01' }, // duplicate id -> dropped
            { ...valid(), startDate: '2025-03-01', status: 'weird', bidStrategy: undefined }, // no id -> gets one; repairs
            { name: '', dailyBudget: 100, type: 'sponsored_products', products: [product], startDate: '2025-03-01' }, // no name -> dropped
            'junk',
            { ...valid(), startDate: '2025-03-01', performance: 'nope' },
          ],
        },
      }),
    );
    const loaded = createStore({ storage: createStorage(backend) }).getState().campaigns;
    expect(loaded).toHaveLength(3);
    expect(loaded[0].id).toBe('ok');
    expect(loaded[0].performance).toEqual([{ date: '2025-03-02', impressions: 0, clicks: 0, spend: 5, conversions: 0, sales: 0 }]);
    expect(loaded[1].id).toMatch(/^cmp_/);
    expect(loaded[1].status).toBe('active');
    expect(loaded[1].bidStrategy).toBe('auto');
    expect(loaded[2].performance).toEqual([]);
  });

  it('negative: a failing backend flags saveFailed but keeps working in memory', () => {
    const bad = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    const s = createStore({ storage: createStorage(bad) });
    s.addCampaign({ ...valid() });
    expect(s.saveFailed).toBe(true);
    expect(s.getState().campaigns).toHaveLength(1);
  });
});
