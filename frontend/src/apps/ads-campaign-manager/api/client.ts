import type {
  Campaign,
  CampaignCreate,
  CampaignFilter,
  CampaignPage,
  CampaignUpdate,
  DashboardSeries,
  DashboardSummary,
  DatasetChange,
  DatasetName,
  DatasetsStatus,
  Preferences,
  ProductList,
  SortDir,
  StatusAction,
} from '../types';

/**
 * Typed client for the Ads Campaign Management API.
 *
 * The UI talks to this interface only, so tests can swap in an in-memory
 * implementation and the HTTP details stay in one place.
 */

export interface DashboardQuery {
  from: string;
  to: string;
  filter: CampaignFilter;
}

export interface CampaignListQuery extends DashboardQuery {
  sort: string;
  dir: SortDir;
  page: number;
  pageSize: number;
  /** Return the page containing this campaign (overrides `page`). */
  locate?: string | null;
}

export interface AdsApi {
  listCampaigns(query: CampaignListQuery, signal?: AbortSignal): Promise<CampaignPage>;
  getSummary(query: DashboardQuery, signal?: AbortSignal): Promise<DashboardSummary>;
  getSeries(query: DashboardQuery, signal?: AbortSignal): Promise<DashboardSeries>;
  getCampaign(id: string, signal?: AbortSignal): Promise<Campaign>;
  createCampaign(body: CampaignCreate): Promise<Campaign>;
  updateCampaign(id: string, patch: CampaignUpdate): Promise<Campaign>;
  deleteCampaign(id: string): Promise<void>;
  restoreCampaign(id: string): Promise<Campaign>;
  duplicateCampaign(id: string, startDate?: string): Promise<Campaign>;
  applyStatus(id: string, action: StatusAction): Promise<Campaign>;
  listProducts(params?: { q?: string; category?: string }, signal?: AbortSignal): Promise<ProductList>;
  getDatasets(signal?: AbortSignal): Promise<DatasetsStatus>;
  loadDataset(name: DatasetName, today: string): Promise<DatasetChange>;
  removeDataset(name: DatasetName): Promise<DatasetChange>;
  getPreferences(signal?: AbortSignal): Promise<Preferences>;
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export const DEFAULT_API_BASE_URL = '/api/v1';

export function apiBaseUrl(): string {
  const configured = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : undefined;
  return (configured || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

type FetchLike = typeof fetch;

/** Turn a FastAPI error body into a readable message. */
export function describeApiError(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string; loc?: unknown[] } | undefined;
    if (first?.msg) {
      const field = Array.isArray(first.loc) ? first.loc.filter((p) => p !== 'body').join('.') : '';
      const msg = first.msg.replace(/^Value error, /, '');
      return field ? `${field}: ${msg}` : msg;
    }
  }
  if (status === 0) return 'Could not reach the server';
  return `Request failed (${status})`;
}

function filterParams(filter: CampaignFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.status && filter.status !== 'all') params.status = filter.status;
  if (filter.type) params.type = filter.type;
  if (filter.query?.trim()) params.q = filter.query.trim();
  return params;
}

export function createAdsApi({ baseUrl = apiBaseUrl(), fetchImpl }: { baseUrl?: string; fetchImpl?: FetchLike } = {}): AdsApi {
  const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  baseUrl = baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, { params, body, signal }: { params?: Record<string, string | number | undefined | null>; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value != null && value !== '') search.set(key, String(value));
    }
    const url = `${baseUrl}${path}${search.size ? `?${search}` : ''}`;
    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new ApiError(0, 'Could not reach the server', err);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) throw new ApiError(response.status, describeApiError(response.status, data), data);
    return data as T;
  }

  return {
    listCampaigns: (q, signal) =>
      request('GET', '/campaigns', { params: { from: q.from, to: q.to, ...filterParams(q.filter), sort: q.sort, dir: q.dir, page: q.page, pageSize: q.pageSize, locate: q.locate ?? undefined }, signal }),
    getSummary: (q, signal) => request('GET', '/dashboard/summary', { params: { from: q.from, to: q.to, ...filterParams(q.filter) }, signal }),
    getSeries: (q, signal) => request('GET', '/dashboard/series', { params: { from: q.from, to: q.to, ...filterParams(q.filter) }, signal }),
    getCampaign: (id, signal) => request('GET', `/campaigns/${encodeURIComponent(id)}`, { signal }),
    createCampaign: (body) => request('POST', '/campaigns', { body }),
    updateCampaign: (id, patch) => request('PATCH', `/campaigns/${encodeURIComponent(id)}`, { body: patch }),
    deleteCampaign: (id) => request('DELETE', `/campaigns/${encodeURIComponent(id)}`),
    restoreCampaign: (id) => request('POST', `/campaigns/${encodeURIComponent(id)}/restore`),
    duplicateCampaign: (id, startDate) => request('POST', `/campaigns/${encodeURIComponent(id)}/duplicate`, { body: startDate ? { startDate } : {} }),
    applyStatus: (id, action) => request('POST', `/campaigns/${encodeURIComponent(id)}/${action}`),
    listProducts: (params, signal) => request('GET', '/products', { params: { q: params?.q, category: params?.category }, signal }),
    getDatasets: (signal) => request('GET', '/datasets', { signal }),
    loadDataset: (name, today) => request('POST', `/datasets/${name}`, { body: { today } }),
    removeDataset: (name) => request('DELETE', `/datasets/${name}`),
    getPreferences: (signal) => request('GET', '/preferences', { signal }),
    updatePreferences: (patch) => request('PATCH', '/preferences', { body: patch }),
  };
}
