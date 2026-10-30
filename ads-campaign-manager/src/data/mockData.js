import { eachDay, shiftDay, todayKey } from '../lib/dates.js';
import { getProduct } from './products.js';

/**
 * Deterministic sample campaigns for manually exercising the dashboard.
 *
 * - Eight campaigns across the three types, most active, a couple paused,
 *   one created only a few days ago (so "young" campaigns are represented).
 * - Each carries daily performance for up to `days` days ending today, with
 *   weekday/weekend rhythm and a gentle trend, so every period preset has
 *   something to show and "vs previous period" deltas are non-trivial.
 * - Uses a seeded PRNG, so the same `now` + `seed` always yields the same
 *   records and ids. Ids carry MOCK_ID_PREFIX, which is how the app recognises
 *   (and removes) sample campaigns later, even after they were paused/resumed.
 */

export const MOCK_ID_PREFIX = 'mock_';
export const DEFAULT_MOCK_DAYS = 90;

export function isMockCampaign(campaign) {
  return Boolean(campaign) && typeof campaign.id === 'string' && campaign.id.startsWith(MOCK_ID_PREFIX);
}

/*
 * Campaign templates. `age` = days since the campaign started (capped to the
 * window); `pausedSince` = days ago the campaign was paused (no rows after);
 * `endsIn` = days from today the campaign is scheduled to end (negative = already ended).
 * `profile` tunes the economics so campaigns differ in CTR / CVR / order value.
 */
const TEMPLATES = [
  { name: 'Headphones — Brand Search', type: 'sponsored_products', budget: 7500, products: ['SKU-1001', 'SKU-1002'], age: 400, profile: { ctr: 0.01, cvr: 0.08, aov: 14500, cpm: 2400, util: 0.92, trend: 0.15 } },
  { name: 'Smart Watch Launch', type: 'sponsored_products', budget: 12000, products: ['SKU-1004', 'SKU-1003'], age: 45, endsIn: 30, profile: { ctr: 0.008, cvr: 0.06, aov: 18900, cpm: 2600, util: 0.97, trend: 0.6 } },
  { name: 'Kitchen Essentials — Spring', type: 'sponsored_brands', budget: 5000, products: ['SKU-2001', 'SKU-2002', 'SKU-2003'], age: 400, endsIn: 75, profile: { ctr: 0.007, cvr: 0.08, aov: 4200, cpm: 900, util: 0.85, trend: -0.1 } },
  { name: 'Robot Vacuum — Display Retargeting', type: 'sponsored_display', budget: 4000, products: ['SKU-2004'], age: 400, profile: { ctr: 0.003, cvr: 0.04, aov: 24900, cpm: 600, util: 0.8, trend: 0.05 } },
  { name: 'Skincare Bestsellers', type: 'sponsored_products', budget: 3500, products: ['SKU-3001', 'SKU-3002', 'SKU-3003'], age: 400, profile: { ctr: 0.014, cvr: 0.12, aov: 2900, cpm: 700, util: 0.9, trend: 0.2 } },
  { name: 'Home Gym — Q1 Push', type: 'sponsored_brands', budget: 6000, products: ['SKU-4001', 'SKU-4002', 'SKU-4003'], age: 400, pausedSince: 12, profile: { ctr: 0.007, cvr: 0.05, aov: 7800, cpm: 1200, util: 0.88, trend: -0.3 } },
  { name: 'Toys — Holiday Gifting', type: 'sponsored_display', budget: 2500, products: ['SKU-5001', 'SKU-5002', 'SKU-5003'], age: 400, pausedSince: 40, endsIn: -40, profile: { ctr: 0.005, cvr: 0.07, aov: 3500, cpm: 400, util: 0.75, trend: 0 } },
  { name: 'Coffee & Pantry Staples', type: 'sponsored_products', budget: 2000, products: ['SKU-6001', 'SKU-6002', 'SKU-6003'], age: 5, profile: { ctr: 0.011, cvr: 0.1, aov: 2600, cpm: 600, util: 0.7, trend: 0.8 } },
];

/**
 * @param {{now?: Date, days?: number, seed?: number}} [opts]
 * @returns {object[]} campaign records (id, name, dailyBudget, type, bidStrategy, products, status, startDate, performance, createdAt, updatedAt)
 */
export function generateMockCampaigns({ now = new Date(), days = DEFAULT_MOCK_DAYS, seed = 20240101 } = {}) {
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');
  const rand = mulberry32(seed);
  const today = todayKey(now);
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return TEMPLATES.map((t, i) => {
    const age = Math.min(t.age, days - 1);
    const startDate = shiftDay(today, -age);
    const lastServed = t.pausedSince ? shiftDay(today, -t.pausedSince) : today;
    const performance = eachDay(startDate, lastServed).map((date, dayIndex, all) => dailyRow(rand, date, t.budget, t.profile, dayIndex / Math.max(1, all.length - 1)));
    const createdAt = todayMs - age * 86_400_000 + 9 * 3_600_000 + i; // 09:00 UTC on the start day
    return {
      id: `${MOCK_ID_PREFIX}${String(i + 1).padStart(4, '0')}`,
      name: t.name,
      dailyBudget: t.budget,
      type: t.type,
      bidStrategy: 'auto',
      products: t.products.map(snapshot),
      status: t.pausedSince ? 'paused' : 'active',
      startDate,
      endDate: t.endsIn == null ? null : shiftDay(today, t.endsIn),
      performance,
      createdAt,
      updatedAt: t.pausedSince ? todayMs - t.pausedSince * 86_400_000 : createdAt,
    };
  });
}

/** One day's counters from the budget and the campaign's economics. */
function dailyRow(rand, date, budget, profile, progress) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = weekday === 0 || weekday === 6 ? 0.8 : 1;
  const trend = 1 + profile.trend * progress; // linear drift over the window
  const noise = 0.85 + rand() * 0.3;
  const spend = Math.round(budget * profile.util * weekend * Math.min(1.05, trend) * noise);
  const impressions = Math.round((spend / profile.cpm) * 1000 * (0.9 + rand() * 0.2));
  const clicks = Math.round(impressions * profile.ctr * (0.85 + rand() * 0.3));
  const conversions = Math.round(clicks * profile.cvr * (0.7 + rand() * 0.6) * trend);
  const sales = Math.round(conversions * profile.aov * (0.9 + rand() * 0.2));
  return { date, impressions, clicks, spend, conversions, sales };
}

function snapshot(id) {
  const p = getProduct(id);
  if (!p) throw new Error(`Unknown product ${id}`);
  return { id: p.id, sku: p.sku, name: p.name, category: p.category, price: p.price };
}

// ---------------------------------------------------------------------------

/** Small, fast, seedable PRNG (32-bit state). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
