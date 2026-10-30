import { eachDay, shiftDay, todayKey } from '../lib/dates.js';
import { CAMPAIGN_TYPE_IDS } from './campaignTypes.js';

/**
 * Placeholder ("dummy") campaigns for exercising the grid at volume —
 * pagination, sorting, filtering, archiving — without pretending to be real.
 *
 * Unlike the realistic sample data (mockData.js), every textual value here is
 * visibly a placeholder: "Dummy Campaign 007", "Dummy Product 3",
 * "Dummy Category 2", SKU "DUMMY-0003". Numbers follow simple, obviously
 * synthetic patterns. Everything is deterministic (no randomness), so the
 * same `now` always yields the same records.
 *
 * Ids carry DUMMY_ID_PREFIX, which is how the app recognises (and removes)
 * dummy campaigns later, even after they were edited, paused or archived.
 */

export const DUMMY_ID_PREFIX = 'dummy_';
export const DEFAULT_DUMMY_COUNT = 96;
export const DUMMY_PRODUCT_COUNT = 24;
export const DUMMY_CATEGORY_COUNT = 6;
/** Longest performance history a dummy campaign carries, in days. */
export const DUMMY_MAX_DAYS = 30;

export function isDummyCampaign(campaign) {
  return Boolean(campaign) && typeof campaign.id === 'string' && campaign.id.startsWith(DUMMY_ID_PREFIX);
}

const pad = (n, width) => String(n).padStart(width, '0');

/** The pool of dummy products campaigns pick from (1-based index). */
export function dummyProduct(index) {
  const n = ((index - 1) % DUMMY_PRODUCT_COUNT) + 1;
  return {
    id: `DUMMY-${pad(n, 4)}`,
    sku: `DUMMY-${pad(n, 4)}`,
    name: `Dummy Product ${n}`,
    category: `Dummy Category ${((n - 1) % DUMMY_CATEGORY_COUNT) + 1}`,
    price: 999 + (n - 1) * 500, // $9.99, $14.99, $19.99, ...
  };
}

/**
 * @param {{now?: Date, count?: number}} [opts]
 * @returns {object[]} campaign records ready for store.addCampaigns()
 */
export function generateDummyCampaigns({ now = new Date(), count = DEFAULT_DUMMY_COUNT } = {}) {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer');
  const today = todayKey(now);

  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    // Status: every 8th paused, every 13th archived, the rest active.
    const status = n % 13 === 0 ? 'archived' : n % 8 === 0 ? 'paused' : 'active';
    // History: 0..30 days, so some campaigns show dashes and others fill every preset.
    const days = n % (DUMMY_MAX_DAYS + 1);
    const lastServed = status === 'active' ? today : shiftDay(today, -1);
    const served = days ? eachDay(shiftDay(lastServed, -(days - 1)), lastServed) : [];
    // Started on the first served day, or a few days ago when nothing was served yet.
    const startDate = served[0] ?? shiftDay(today, -((n % 7) + 1));
    const productCount = (n % 4) + 1;
    const products = Array.from({ length: productCount }, (_, k) => dummyProduct(n + k));
    const createdAt = Date.parse(`${startDate}T09:00:00Z`) + n; // 09:00 UTC on the start day

    return {
      id: `${DUMMY_ID_PREFIX}${pad(n, 4)}`,
      name: `Dummy Campaign ${pad(n, 3)}`,
      dailyBudget: ((n % 12) + 1) * 500, // $5, $10, ... $60
      type: CAMPAIGN_TYPE_IDS[i % CAMPAIGN_TYPE_IDS.length],
      bidStrategy: 'auto',
      products,
      status,
      startDate,
      // Every 5th campaign has a scheduled end date (some already in the past).
      endDate: n % 5 === 0 ? shiftDay(today, (n % 3) * 20 - 10) : null,
      performance: served.map((date, d) => dummyRow(date, n, d)),
      createdAt,
      updatedAt: createdAt,
    };
  });
}

/** Obviously synthetic counters: round numbers that grow with the campaign index and day. */
function dummyRow(date, n, dayIndex) {
  const impressions = (500 + 250 * (n % 7)) * ((n % 10) + 1) + 100 * dayIndex;
  const clicks = 10 * ((n % 10) + 1) + dayIndex;
  const spend = 250 * ((n % 12) + 1) + 25 * dayIndex; // cents
  const conversions = (n % 5) + (dayIndex % 3);
  const sales = conversions * 2500;
  return { date, impressions, clicks, spend, conversions, sales };
}
