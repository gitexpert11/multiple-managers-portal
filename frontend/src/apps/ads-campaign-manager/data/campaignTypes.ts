import type { CampaignTypeId, StatusId } from '../types';

/** Fixed campaign types (mirrors the API's /meta; kept local for type safety and zero-latency rendering). */
export interface CampaignTypeDef {
  id: CampaignTypeId;
  label: string;
  short: string;
  color: string;
  icon: 'tag' | 'award' | 'layout';
  description: string;
}

export const CAMPAIGN_TYPES: CampaignTypeDef[] = [
  { id: 'sponsored_products', label: 'Sponsored Products', short: 'Products', color: '#4f46e5', icon: 'tag', description: 'Promote individual listings in search results and on product pages.' },
  { id: 'sponsored_brands', label: 'Sponsored Brands', short: 'Brands', color: '#ec4899', icon: 'award', description: 'Showcase your brand and a collection of products with a banner.' },
  { id: 'sponsored_display', label: 'Sponsored Display', short: 'Display', color: '#0ea5e9', icon: 'layout', description: 'Reach shoppers on and off the store with display placements.' },
];

export const CAMPAIGN_TYPE_IDS = CAMPAIGN_TYPES.map((t) => t.id);
export const DEFAULT_CAMPAIGN_TYPE: CampaignTypeId = 'sponsored_products';

const TYPE_BY_ID = new Map(CAMPAIGN_TYPES.map((t) => [t.id, t]));

export function getCampaignType(id: string): CampaignTypeDef | null {
  return TYPE_BY_ID.get(id as CampaignTypeId) || null;
}

export function isCampaignTypeId(id: unknown): id is CampaignTypeId {
  return typeof id === 'string' && TYPE_BY_ID.has(id as CampaignTypeId);
}

/**
 * Campaign lifecycle states. Active and paused campaigns are "live" (shown by
 * default); archived campaigns are kept for their history but hidden unless
 * asked for, and never serve ads.
 */
export interface StatusDef {
  id: StatusId;
  label: string;
  order: number;
}

export const CAMPAIGN_STATUSES: StatusDef[] = [
  { id: 'active', label: 'Active', order: 0 },
  { id: 'paused', label: 'Paused', order: 1 },
  { id: 'archived', label: 'Archived', order: 2 },
];
export const DEFAULT_STATUS: StatusId = 'active';
export const ARCHIVED_STATUS: StatusId = 'archived';

const STATUS_BY_ID = new Map(CAMPAIGN_STATUSES.map((s) => [s.id, s]));

export function isStatusId(id: unknown): id is StatusId {
  return typeof id === 'string' && STATUS_BY_ID.has(id as StatusId);
}

export function getStatus(id: string): StatusDef | null {
  return STATUS_BY_ID.get(id as StatusId) || null;
}

export function isArchived(campaign: { status?: string } | null | undefined): boolean {
  return campaign?.status === ARCHIVED_STATUS;
}
