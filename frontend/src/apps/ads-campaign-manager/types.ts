/** Wire types for the Ads Campaign Management API (camelCase JSON) plus UI-side state shapes. */

export type CampaignTypeId = 'sponsored_products' | 'sponsored_brands' | 'sponsored_display';
export type StatusId = 'active' | 'paused' | 'archived';
export type BidStrategyId = 'auto' | 'manual';
export type SourceId = 'user' | 'sample' | 'dummy';

export interface ProductSnapshot {
  id: string;
  sku: string;
  name: string;
  category: string;
  /** Integer cents. */
  price: number;
}

export interface CatalogueProduct extends ProductSnapshot {
  color: string;
}

export interface ProductList {
  items: CatalogueProduct[];
  total: number;
  categories: string[];
}

export interface Campaign {
  id: string;
  name: string;
  /** Integer cents. */
  dailyBudget: number;
  type: CampaignTypeId;
  bidStrategy: BidStrategyId;
  status: StatusId;
  /** "YYYY-MM-DD" */
  startDate: string;
  endDate: string | null;
  products: ProductSnapshot[];
  source: SourceId;
  performanceDays: number;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

export type BaseMetricId = 'impressions' | 'clicks' | 'spend' | 'conversions' | 'sales';
export type DerivedMetricId = 'ctr' | 'cpc' | 'cvr' | 'roas' | 'acos';
export type MetricId = BaseMetricId | DerivedMetricId;

export interface Metrics extends Record<MetricId, number> {
  days: number;
}

export interface CampaignWithMetrics extends Campaign {
  metrics: Metrics;
}

export interface DateRange {
  from: string;
  to: string;
  days: number;
}

export interface PageAggregates {
  campaigns: number;
  products: number;
  dailyBudget: number;
}

export interface CampaignPage {
  items: CampaignWithMetrics[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  range: DateRange;
  sort: string;
  dir: SortDir;
  aggregates: PageAggregates;
}

export interface DashboardSummary {
  range: DateRange;
  previousRange: DateRange;
  totals: Metrics;
  previous: Metrics;
  campaignCount: number;
  archivedCount: number;
  totalCampaigns: number;
  datasets: { sample: number; dummy: number };
}

export interface SeriesPoint extends Metrics {
  date: string;
}

export interface DashboardSeries {
  range: DateRange;
  points: SeriesPoint[];
}

export interface Preferences {
  currency: string;
}

export interface DatasetStatus {
  present: boolean;
  count: number;
}

export interface DatasetsStatus {
  sample: DatasetStatus;
  dummy: DatasetStatus;
}

export interface DatasetChange {
  dataset: DatasetName;
  added: number;
  removed: number;
  status: DatasetsStatus;
}

export type DatasetName = 'sample' | 'dummy';

export interface CampaignCreate {
  name: string;
  dailyBudget: number;
  type: CampaignTypeId;
  bidStrategy?: BidStrategyId;
  products: ProductSnapshot[];
  status?: StatusId;
  startDate?: string | null;
  endDate?: string | null;
}

export interface CampaignUpdate {
  name?: string;
  dailyBudget?: number;
  type?: CampaignTypeId;
  bidStrategy?: BidStrategyId;
  products?: ProductSnapshot[];
  status?: StatusId;
  endDate?: string | null;
}

export type StatusAction = 'pause' | 'resume' | 'toggle-status' | 'archive' | 'unarchive';

// ---- UI state -----------------------------------------------------------------

export type StatusFilter = 'all' | StatusId;
export type SortDir = 'asc' | 'desc';

export interface CampaignFilter {
  status: StatusFilter;
  type: CampaignTypeId | null;
  query: string;
}

export interface GridSort {
  key: string;
  dir: SortDir;
}

export interface Period {
  preset: string;
  from?: string;
  to?: string;
}

export interface ResolvedRange extends DateRange {
  preset: string;
  label: string;
}
