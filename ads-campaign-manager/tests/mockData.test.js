import { describe, expect, it } from 'vitest';
import { DEFAULT_MOCK_DAYS, MOCK_ID_PREFIX, generateMockCampaigns, isMockCampaign } from '../src/data/mockData.js';
import { isCampaignTypeId } from '../src/data/campaignTypes.js';
import { getProduct } from '../src/data/products.js';
import { normalizeCampaign, normalizePerformance } from '../src/store/store.js';

const NOW = new Date(2025, 2, 15, 10);

describe('generateMockCampaigns', () => {
  const campaigns = generateMockCampaigns({ now: NOW });

  it('is deterministic for the same now + seed, and changes with the seed', () => {
    expect(generateMockCampaigns({ now: NOW })).toEqual(campaigns);
    expect(generateMockCampaigns({ now: NOW, seed: 7 })).not.toEqual(campaigns);
  });

  it('produces valid campaigns with mock ids that the store accepts as-is', () => {
    expect(campaigns.length).toBeGreaterThanOrEqual(6);
    for (const c of campaigns) {
      expect(c.id.startsWith(MOCK_ID_PREFIX)).toBe(true);
      expect(isMockCampaign(c)).toBe(true);
      expect(() => normalizeCampaign(c)).not.toThrow();
      expect(() => normalizePerformance(c.performance)).not.toThrow();
      expect(isCampaignTypeId(c.type)).toBe(true);
      expect(c.bidStrategy).toBe('auto');
      expect(c.products.length).toBeGreaterThan(0);
      for (const p of c.products) expect(getProduct(p.id)).not.toBeNull();
    }
    expect(new Set(campaigns.map((c) => c.id)).size).toBe(campaigns.length);
  });

  it('covers every type and both statuses', () => {
    expect(new Set(campaigns.map((c) => c.type)).size).toBe(3);
    expect(campaigns.some((c) => c.status === 'paused')).toBe(true);
    expect(campaigns.some((c) => c.status === 'active')).toBe(true);
  });

  it('performance covers up to 90 days ending today, never before the start date, sorted and non-negative', () => {
    for (const c of campaigns) {
      const dates = c.performance.map((r) => r.date);
      expect(dates).toEqual([...dates].sort());
      expect(dates[0] >= c.startDate).toBe(true);
      expect(dates.at(-1) <= '2025-03-15').toBe(true);
      expect(c.performance.length).toBeLessThanOrEqual(DEFAULT_MOCK_DAYS);
      for (const r of c.performance) {
        for (const k of ['impressions', 'clicks', 'spend', 'conversions', 'sales']) {
          expect(Number.isInteger(r[k])).toBe(true);
          expect(r[k]).toBeGreaterThanOrEqual(0);
        }
        expect(r.clicks).toBeLessThanOrEqual(r.impressions);
        expect(r.spend).toBeLessThanOrEqual(c.dailyBudget * 1.2);
      }
    }
    const active = campaigns.filter((c) => c.status === 'active');
    expect(active.every((c) => c.performance.at(-1).date === '2025-03-15')).toBe(true);
    const paused = campaigns.filter((c) => c.status === 'paused');
    expect(paused.every((c) => c.performance.at(-1).date < '2025-03-15')).toBe(true);
  });

  it('includes a young campaign so new-campaign states are represented', () => {
    expect(campaigns.some((c) => c.startDate >= '2025-03-08')).toBe(true);
  });

  it('honours a shorter window', () => {
    const short = generateMockCampaigns({ now: NOW, days: 10 });
    expect(short.every((c) => c.performance.length <= 10)).toBe(true);
    expect(short.every((c) => c.startDate >= '2025-03-06')).toBe(true);
  });

  it('negative: rejects a non-positive window', () => {
    expect(() => generateMockCampaigns({ now: NOW, days: 0 })).toThrow();
    expect(() => generateMockCampaigns({ now: NOW, days: 1.5 })).toThrow();
  });

  it('isMockCampaign only matches the prefix', () => {
    expect(isMockCampaign({ id: 'mock_0001' })).toBe(true);
    expect(isMockCampaign({ id: 'cmp_mock_1' })).toBe(false);
    expect(isMockCampaign(null)).toBe(false);
    expect(isMockCampaign({})).toBe(false);
  });
});
