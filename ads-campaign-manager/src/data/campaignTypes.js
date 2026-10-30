/**
 * Fixed campaign types. Ids are stable strings persisted with each campaign;
 * labels, colours and copy can change freely.
 */
export const CAMPAIGN_TYPES = [
  {
    id: 'sponsored_products',
    label: 'Sponsored Products',
    short: 'Products',
    color: '#4f46e5',
    icon: 'tag',
    description: 'Promote individual listings in search results and on product pages.',
  },
  {
    id: 'sponsored_brands',
    label: 'Sponsored Brands',
    short: 'Brands',
    color: '#ec4899',
    icon: 'award',
    description: 'Showcase your brand and a collection of products with a banner.',
  },
  {
    id: 'sponsored_display',
    label: 'Sponsored Display',
    short: 'Display',
    color: '#0ea5e9',
    icon: 'layout',
    description: 'Reach shoppers on and off the store with display placements.',
  },
];

export const CAMPAIGN_TYPE_IDS = CAMPAIGN_TYPES.map((t) => t.id);
export const DEFAULT_CAMPAIGN_TYPE = CAMPAIGN_TYPES[0].id;

const BY_ID = new Map(CAMPAIGN_TYPES.map((t) => [t.id, t]));

export function getCampaignType(id) {
  return BY_ID.get(id) || null;
}

export function isCampaignTypeId(id) {
  return BY_ID.has(id);
}

/**
 * Campaign lifecycle states. Active and paused campaigns are "live" (shown by
 * default); archived campaigns are kept for their history but hidden unless
 * asked for, and never serve ads.
 */
export const CAMPAIGN_STATUSES = [
  { id: 'active', label: 'Active', order: 0 },
  { id: 'paused', label: 'Paused', order: 1 },
  { id: 'archived', label: 'Archived', order: 2 },
];
export const DEFAULT_STATUS = 'active';
export const ARCHIVED_STATUS = 'archived';
/** Statuses a campaign can be switched between with the pause / resume control. */
export const LIVE_STATUSES = ['active', 'paused'];

const STATUS_BY_ID = new Map(CAMPAIGN_STATUSES.map((s) => [s.id, s]));

export function isStatusId(id) {
  return STATUS_BY_ID.has(id);
}

export function getStatus(id) {
  return STATUS_BY_ID.get(id) || null;
}

export function isArchived(campaign) {
  return campaign?.status === ARCHIVED_STATUS;
}
