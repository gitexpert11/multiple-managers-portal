import { describe, expect, it } from 'vitest';
import { isCampaignTypeId } from '../src/data/campaignTypes.js';
import { DEFAULT_DUMMY_COUNT, DUMMY_ID_PREFIX, DUMMY_MAX_DAYS, dummyProduct, generateDummyCampaigns, isDummyCampaign } from '../src/data/dummyData.js';
import { isMockCampaign } from '../src/data/mockData.js';
import { normalizeCampaign, normalizePerformance } from '../src/store/store.js';

const NOW = new Date(2025, 2, 15, 10);

describe('generateDummyCampaigns', () => {
  const campaigns = generateDummyCampaigns({ now: NOW });

  it('creates 96 deterministic campaigns with dummy ids the store accepts', () => {
    expect(DEFAULT_DUMMY_COUNT).toBe(96);
    expect(campaigns).toHaveLength(96);
    expect(generateDummyCampaigns({ now: NOW })).toEqual(campaigns);
    for (const c of campaigns) {
      expect(c.id.startsWith(DUMMY_ID_PREFIX)).toBe(true);
      expect(isDummyCampaign(c)).toBe(true);
      expect(isMockCampaign(c)).toBe(false); // never confused with the realistic sample data
      expect(() => normalizeCampaign(c)).not.toThrow();
      expect(() => normalizePerformance(c.performance)).not.toThrow();
      expect(isCampaignTypeId(c.type)).toBe(true);
    }
    expect(new Set(campaigns.map((c) => c.id)).size).toBe(96);
  });

  it('every textual value says "Dummy"', () => {
    for (const c of campaigns) {
      expect(c.name).toMatch(/^Dummy Campaign \d{3}$/);
      expect(c.products.length).toBeGreaterThan(0);
      for (const p of c.products) {
        expect(p.name).toMatch(/^Dummy Product \d+$/);
        expect(p.category).toMatch(/^Dummy Category \d+$/);
        expect(p.sku).toMatch(/^DUMMY-\d{4}$/);
        expect(p.id).toBe(p.sku);
      }
    }
    expect(campaigns[0].name).toBe('Dummy Campaign 001');
    expect(campaigns[95].name).toBe('Dummy Campaign 096');
    expect(dummyProduct(1)).toEqual({ id: 'DUMMY-0001', sku: 'DUMMY-0001', name: 'Dummy Product 1', category: 'Dummy Category 1', price: 999 });
    expect(dummyProduct(25)).toEqual(dummyProduct(1)); // wraps around the pool
  });

  it('covers every type and status, with varied history lengths including none', () => {
    expect(new Set(campaigns.map((c) => c.type)).size).toBe(3);
    const byStatus = (s) => campaigns.filter((c) => c.status === s).length;
    expect(byStatus('active')).toBeGreaterThan(50);
    expect(byStatus('paused')).toBeGreaterThan(5);
    expect(byStatus('archived')).toBeGreaterThan(3);
    expect(campaigns.some((c) => c.performance.length === 0)).toBe(true);
    expect(campaigns.some((c) => c.performance.length === DUMMY_MAX_DAYS)).toBe(true);
    for (const c of campaigns) {
      expect(c.performance.length).toBeLessThanOrEqual(DUMMY_MAX_DAYS);
      const dates = c.performance.map((r) => r.date);
      expect(dates).toEqual([...dates].sort());
      if (dates.length) expect(dates[0] >= c.startDate).toBe(true);
      expect((dates.at(-1) ?? '') <= '2025-03-15').toBe(true);
      if (c.status === 'active' && dates.length) expect(dates.at(-1)).toBe('2025-03-15');
      if (c.status !== 'active' && dates.length) expect(dates.at(-1) < '2025-03-15').toBe(true);
      for (const r of c.performance) expect(r.clicks).toBeLessThanOrEqual(r.impressions);
    }
  });

  it('honours a custom count and rejects bad ones', () => {
    expect(generateDummyCampaigns({ now: NOW, count: 5 })).toHaveLength(5);
    expect(() => generateDummyCampaigns({ now: NOW, count: 0 })).toThrow();
    expect(() => generateDummyCampaigns({ now: NOW, count: 2.5 })).toThrow();
  });

  it('isDummyCampaign only matches the prefix', () => {
    expect(isDummyCampaign({ id: 'dummy_0001' })).toBe(true);
    expect(isDummyCampaign({ id: 'mock_0001' })).toBe(false);
    expect(isDummyCampaign(null)).toBe(false);
  });
});
