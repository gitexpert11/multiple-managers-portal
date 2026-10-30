import { ApiError, type AdsApi, type CampaignListQuery, type DashboardQuery } from '../api/client';
import { eachDay, shiftDay } from '../lib/dates';
import { BASE_METRICS } from '../lib/metrics';
import type { BaseMetricId, Campaign, CampaignFilter, CampaignWithMetrics, CatalogueProduct, DatasetName, Metrics, Preferences, ProductSnapshot } from '../types';

/**
 * In-memory stand-in for the FastAPI backend, used by the frontend tests. It
 * mirrors the server's contract (filtering, metrics as ratios of sums, paging,
 * soft delete, datasets) closely enough to drive the UI end to end.
 */

export interface PerformanceRow {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  sales: number;
}

export interface FakeCampaign extends Campaign {
  performance: PerformanceRow[];
  deleted: boolean;
}

export const CATALOGUE: CatalogueProduct[] = [
  { id: 'SKU-1001', sku: 'SKU-1001', name: 'Wireless Noise-Cancelling Headphones', category: 'Electronics', price: 14999, color: '#4f46e5' },
  { id: 'SKU-1002', sku: 'SKU-1002', name: 'USB-C Fast Charger 65W', category: 'Electronics', price: 3499, color: '#6366f1' },
  { id: 'SKU-2001', sku: 'SKU-2001', name: 'Stainless Steel Insulated Bottle 1L', category: 'Home & Kitchen', price: 2499, color: '#f97316' },
  { id: 'SKU-2004', sku: 'SKU-2004', name: 'Robot Vacuum Cleaner', category: 'Home & Kitchen', price: 24900, color: '#c2410c' },
  { id: 'SKU-3001', sku: 'SKU-3001', name: 'Vitamin C Brightening Serum', category: 'Beauty', price: 1899, color: '#ec4899' },
  { id: 'SKU-4001', sku: 'SKU-4001', name: 'Yoga Mat 6mm Non-slip', category: 'Sports', price: 2999, color: '#0ea5e9' },
  { id: 'SKU-5001', sku: 'SKU-5001', name: 'Building Blocks 500-piece Set', category: 'Toys', price: 3999, color: '#16a34a' },
  { id: 'SKU-6001', sku: 'SKU-6001', name: 'Organic Coffee Beans 1kg', category: 'Grocery', price: 1999, color: '#a16207' },
];

function derive(rows: PerformanceRow[]): Metrics {
  const t = { impressions: 0, clicks: 0, spend: 0, conversions: 0, sales: 0 };
  for (const r of rows) for (const k of BASE_METRICS) t[k] += r[k];
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);
  return { ...t, ctr: div(t.clicks, t.impressions), cpc: div(t.spend, t.clicks), cvr: div(t.conversions, t.clicks), roas: div(t.sales, t.spend), acos: div(t.spend, t.sales), days: rows.length };
}

const inRange = (rows: PerformanceRow[], from: string, to: string) => rows.filter((r) => r.date >= from && r.date <= to);

export interface FakeApi extends AdsApi {
  campaigns: FakeCampaign[];
  /** Directly add a record (defaults filled in). */
  seed(partial: Partial<FakeCampaign> & { name: string }): FakeCampaign;
  /** Make the next N calls (optionally only those whose name starts with `only`) fail with the given error. */
  failNext(times: number, error?: Error, only?: string): void;
  calls: string[];
}

export function createFakeApi({ today = '2025-03-15' }: { today?: string } = {}): FakeApi {
  let seq = 0;
  let failures = 0;
  let failOnly: string | null = null;
  let failure: Error = new ApiError(500, 'Server exploded');
  const prefs: Preferences = { currency: 'USD' };
  const campaigns: FakeCampaign[] = [];
  const calls: string[] = [];

  const live = () => campaigns.filter((c) => !c.deleted);
  const find = (id: string, includeDeleted = false) => {
    const c = campaigns.find((x) => x.id === id && (includeDeleted || !x.deleted));
    if (!c) throw new ApiError(404, 'Campaign not found');
    return c;
  };
  const strip = ({ performance: _p, deleted: _d, ...c }: FakeCampaign): Campaign => ({ ...c, performanceDays: _p.length, products: c.products.map((p) => ({ ...p })) });
  const now = () => new Date(Date.UTC(2025, 2, 15, 10, 0, 0, seq)).toISOString();

  function guard(name: string) {
    calls.push(name);
    if (failures > 0 && (!failOnly || name.startsWith(failOnly))) {
      failures -= 1;
      throw failure;
    }
  }

  function filtered({ status, type, query }: CampaignFilter): FakeCampaign[] {
    const q = query.trim().toLowerCase();
    return live().filter((c) => {
      if (status === 'all' ? c.status === 'archived' : c.status !== status) return false;
      if (type && c.type !== type) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.products.some((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function seed(partial: Partial<FakeCampaign> & { name: string }): FakeCampaign {
    seq += 1;
    const record: FakeCampaign = {
      id: `cmp_${seq}`,
      dailyBudget: 2500,
      type: 'sponsored_products',
      bidStrategy: 'auto',
      status: 'active',
      startDate: today,
      endDate: null,
      products: [{ id: 'SKU-1001', sku: 'SKU-1001', name: 'Wireless Noise-Cancelling Headphones', category: 'Electronics', price: 14999 }],
      source: 'user',
      performanceDays: 0,
      createdAt: now(),
      updatedAt: now(),
      performance: [],
      deleted: false,
      ...partial,
    };
    record.performanceDays = record.performance.length;
    campaigns.push(record);
    return record;
  }

  function sortRows(rows: CampaignWithMetrics[], key: string, dir: 'asc' | 'desc') {
    const accessor = (r: CampaignWithMetrics): string | number => {
      switch (key) {
        case 'name':
          return r.name.toLowerCase();
        case 'status':
          return { active: 0, paused: 1, archived: 2 }[r.status];
        case 'type':
          return r.type;
        case 'products':
          return r.products.length;
        case 'budget':
          return r.dailyBudget;
        case 'startDate':
          return r.startDate;
        case 'endDate':
          return r.endDate || '\uffff';
        case 'createdAt':
          return r.createdAt;
        default:
          return (r.metrics as unknown as Record<string, number>)[key] ?? 0;
      }
    };
    const sign = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return cmp * sign || b.createdAt.localeCompare(a.createdAt);
    });
  }

  const api: FakeApi = {
    campaigns,
    calls,
    seed,
    failNext(times, error, only) {
      failures = times;
      failOnly = only ?? null;
      if (error) failure = error;
    },

    async listCampaigns(q: CampaignListQuery) {
      guard('listCampaigns');
      const all = filtered(q.filter);
      const rows = sortRows(
        all.map((c) => ({ ...strip(c), metrics: derive(inRange(c.performance, q.from, q.to)) })),
        q.sort,
        q.dir,
      );
      const pageCount = Math.max(1, Math.ceil(rows.length / q.pageSize));
      let page = q.page;
      if (q.locate) {
        const idx = rows.findIndex((r) => r.id === q.locate);
        if (idx >= 0) page = Math.floor(idx / q.pageSize) + 1;
      }
      page = Math.max(1, Math.min(page, pageCount));
      const start = (page - 1) * q.pageSize;
      return {
        items: rows.slice(start, start + q.pageSize),
        page,
        pageSize: q.pageSize,
        pageCount,
        total: rows.length,
        range: { from: q.from, to: q.to, days: eachDay(q.from, q.to).length },
        sort: q.sort,
        dir: q.dir,
        aggregates: { campaigns: all.length, products: all.reduce((a, c) => a + c.products.length, 0), dailyBudget: all.reduce((a, c) => a + c.dailyBudget, 0) },
      };
    },

    async getSummary(q: DashboardQuery) {
      guard('getSummary');
      const all = filtered(q.filter);
      const days = eachDay(q.from, q.to).length;
      const prevTo = shiftDay(q.from, -1);
      const prevFrom = shiftDay(prevTo, -(days - 1));
      const rows = (from: string, to: string) => all.flatMap((c) => inRange(c.performance, from, to));
      return {
        range: { from: q.from, to: q.to, days },
        previousRange: { from: prevFrom, to: prevTo, days },
        totals: derive(rows(q.from, q.to)),
        previous: derive(rows(prevFrom, prevTo)),
        campaignCount: all.length,
        archivedCount: live().filter((c) => c.status === 'archived').length,
        totalCampaigns: live().length,
        datasets: { sample: live().filter((c) => c.source === 'sample').length, dummy: live().filter((c) => c.source === 'dummy').length },
      };
    },

    async getSeries(q: DashboardQuery) {
      guard('getSeries');
      const all = filtered(q.filter);
      const points = eachDay(q.from, q.to).map((date) => ({ date, ...derive(all.flatMap((c) => c.performance.filter((r) => r.date === date))) }));
      return { range: { from: q.from, to: q.to, days: points.length }, points };
    },

    async getCampaign(id) {
      guard('getCampaign');
      return strip(find(id));
    },

    async createCampaign(body) {
      guard('createCampaign');
      if (!body.name.trim()) throw new ApiError(422, 'Campaign name is required');
      if (body.dailyBudget < 100) throw new ApiError(422, 'Daily budget must be at least $1.00');
      if (!body.products.length) throw new ApiError(422, 'Add at least one product');
      return strip(seed({ name: body.name.trim(), dailyBudget: body.dailyBudget, type: body.type, bidStrategy: body.bidStrategy ?? 'auto', status: body.status ?? 'active', startDate: body.startDate ?? today, endDate: body.endDate ?? null, products: body.products }));
    },

    async updateCampaign(id, patch) {
      guard('updateCampaign');
      const c = find(id);
      if (patch.type && patch.type !== c.type) throw new ApiError(422, 'The campaign type cannot be changed once a campaign exists');
      if (patch.name !== undefined) c.name = patch.name.trim();
      if (patch.dailyBudget !== undefined) c.dailyBudget = patch.dailyBudget;
      if (patch.status !== undefined) c.status = patch.status;
      if ('endDate' in patch) {
        if (patch.endDate && patch.endDate < c.startDate) throw new ApiError(422, 'End date cannot be before the start date');
        c.endDate = patch.endDate ?? null;
      }
      if (patch.products) c.products = patch.products.map((p: ProductSnapshot) => ({ ...p }));
      seq += 1;
      c.updatedAt = now();
      return strip(c);
    },

    async deleteCampaign(id) {
      guard('deleteCampaign');
      find(id).deleted = true;
    },

    async restoreCampaign(id) {
      guard('restoreCampaign');
      const c = find(id, true);
      c.deleted = false;
      return strip(c);
    },

    async duplicateCampaign(id, startDate = today) {
      guard('duplicateCampaign');
      const src = find(id);
      const names = new Set(live().map((c) => c.name.toLowerCase()));
      let name = `Copy of ${src.name}`;
      for (let i = 2; names.has(name.toLowerCase()); i++) name = `Copy of ${src.name} (${i})`;
      return strip(seed({ name, dailyBudget: src.dailyBudget, type: src.type, bidStrategy: src.bidStrategy, status: 'paused', startDate, endDate: src.endDate && src.endDate >= startDate ? src.endDate : null, products: src.products.map((p) => ({ ...p })) }));
    },

    async applyStatus(id, action) {
      guard(`applyStatus:${action}`);
      const c = find(id);
      if (action === 'pause') c.status = 'paused';
      else if (action === 'resume') c.status = 'active';
      else if (action === 'toggle-status') c.status = c.status === 'active' ? 'paused' : 'active';
      else if (action === 'archive') c.status = 'archived';
      else if (action === 'unarchive' && c.status === 'archived') c.status = 'paused';
      seq += 1;
      c.updatedAt = now();
      return strip(c);
    },

    async listProducts(params) {
      guard('listProducts');
      const q = (params?.q ?? '').toLowerCase();
      const items = CATALOGUE.filter((p) => (!params?.category || p.category === params.category) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));
      return { items, total: items.length, categories: [...new Set(CATALOGUE.map((p) => p.category))] };
    },

    async getDatasets() {
      guard('getDatasets');
      const count = (s: string) => live().filter((c) => c.source === s).length;
      return { sample: { present: count('sample') > 0, count: count('sample') }, dummy: { present: count('dummy') > 0, count: count('dummy') } };
    },

    async loadDataset(name: DatasetName, day: string) {
      guard(`loadDataset:${name}`);
      const n = name === 'sample' ? 8 : 96;
      let added = 0;
      for (let i = 1; i <= n; i++) {
        const id = `${name === 'sample' ? 'mock' : 'dummy'}_${String(i).padStart(4, '0')}`;
        if (campaigns.some((c) => c.id === id)) continue;
        const days = name === 'sample' ? 90 : i % 31;
        const performance = eachDay(shiftDay(day, -(days - 1)), day).map((date, d) => ({ date, impressions: 1000 + d, clicks: 50, spend: 2500, conversions: 5, sales: 25000 }));
        seed({
          id,
          name: name === 'sample' ? `Sample Campaign ${i}` : `Dummy Campaign ${String(i).padStart(3, '0')}`,
          source: name,
          status: name === 'dummy' && i % 13 === 0 ? 'archived' : name === 'dummy' && i % 8 === 0 ? 'paused' : 'active',
          startDate: shiftDay(day, -(Math.max(days, 1) - 1)),
          performance: days ? performance : [],
        });
        added += 1;
      }
      return { dataset: name, added, removed: 0, status: await api.getDatasets() };
    },

    async removeDataset(name: DatasetName) {
      guard(`removeDataset:${name}`);
      let removed = 0;
      for (let i = campaigns.length - 1; i >= 0; i--) {
        if ((campaigns[i] as FakeCampaign).source === name) {
          campaigns.splice(i, 1);
          removed += 1;
        }
      }
      return { dataset: name, added: 0, removed, status: await api.getDatasets() };
    },

    async getPreferences() {
      guard('getPreferences');
      return { ...prefs };
    },

    async updatePreferences(patch) {
      guard('updatePreferences');
      Object.assign(prefs, patch);
      return { ...prefs };
    },
  };
  return api;
}

export type { BaseMetricId };
