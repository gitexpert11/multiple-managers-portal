import { DEFAULT_BID_STRATEGY, isBidStrategyAvailable, isBidStrategyId } from '../data/bidStrategies.js';
import { ARCHIVED_STATUS, DEFAULT_STATUS, isCampaignTypeId, isStatusId } from '../data/campaignTypes.js';
import { isValidDayKey, todayKey } from '../lib/dates.js';
import { uid } from '../lib/ids.js';
import { BASE_METRICS } from '../lib/metrics.js';
import { DEFAULT_CURRENCY, isCurrency } from '../lib/money.js';
import { createStorage } from './storage.js';

/**
 * Campaign data store.
 *
 * Holds the campaign list (metadata + products + daily performance rows) plus
 * the display preferences (currency), and persists every mutation to storage.
 * Listeners are notified after each change so the UI can re-render.
 */

export const NAME_MAX = 120;
export const MIN_DAILY_BUDGET = 100; // cents ($1.00)
export const MAX_DAILY_BUDGET = 100_000_000; // cents ($1,000,000.00)
export const MAX_PRODUCTS = 100;

export function createStore({ storage = createStorage(), now = () => new Date() } = {}) {
  let state = hydrate(storage.load());
  const listeners = new Set();
  let lastSaveOk = true;

  function commit(next) {
    state = next;
    lastSaveOk = storage.save(serializable(state));
    for (const fn of listeners) fn(state);
  }

  function find(id) {
    const existing = state.campaigns.find((c) => c.id === id);
    if (!existing) throw new Error('Campaign not found');
    return existing;
  }

  function replace(record) {
    commit({ ...state, campaigns: state.campaigns.map((c) => (c.id === record.id ? record : c)) });
    return record;
  }

  const api = {
    getState: () => state,
    get saveFailed() {
      return !lastSaveOk;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /**
     * Create a campaign from the form payload. Starts today, active, with no
     * performance yet (it has not served any ads).
     */
    addCampaign(input) {
      const clean = normalizeCampaign({ startDate: todayKey(now()), ...input });
      const ts = Date.now();
      const record = { id: uid('cmp'), createdAt: ts, updatedAt: ts, ...clean, performance: [] };
      commit({ ...state, campaigns: [...state.campaigns, record] });
      return record;
    },

    updateCampaign(id, patch) {
      const existing = find(id);
      const merged = normalizeCampaign({ ...existing, ...patch });
      return replace({ ...existing, ...merged, updatedAt: Date.now() });
    },

    setStatus(id, status) {
      if (!isStatusId(status)) throw new Error('Invalid status');
      const existing = find(id);
      if (existing.status === status) return existing;
      return replace({ ...existing, status, updatedAt: Date.now() });
    },

    /** Flip a campaign between active and paused (an archived one comes back paused). */
    toggleStatus(id) {
      const existing = find(id);
      return api.setStatus(id, existing.status === 'active' ? 'paused' : 'active');
    },

    /** Archive: keeps the campaign and its history but hides it from the default views. */
    archiveCampaign(id) {
      return api.setStatus(id, ARCHIVED_STATUS);
    },

    /** Bring an archived campaign back, paused, so it does not start spending unexpectedly. */
    unarchiveCampaign(id) {
      const existing = find(id);
      if (existing.status !== ARCHIVED_STATUS) return existing;
      return api.setStatus(id, 'paused');
    },

    /**
     * Create a copy of a campaign with the same settings and products. The
     * copy is a brand-new campaign: new id, starts today, paused (so it does
     * not spend until you decide), with no performance history.
     */
    duplicateCampaign(id) {
      const source = find(id);
      const today = todayKey(now());
      // An end date that has already passed would make the copy dead on arrival: drop it.
      const endDate = source.endDate && source.endDate >= today ? source.endDate : null;
      const clean = normalizeCampaign({ ...source, name: copyName(source.name, state.campaigns.map((c) => c.name)), status: 'paused', startDate: today, endDate });
      const ts = Date.now();
      const record = { id: uid('cmp'), createdAt: ts, updatedAt: ts, ...clean, performance: [] };
      commit({ ...state, campaigns: [...state.campaigns, record] });
      return record;
    },

    deleteCampaign(id) {
      const existing = state.campaigns.find((c) => c.id === id);
      if (!existing) return null;
      commit({ ...state, campaigns: state.campaigns.filter((c) => c.id !== id) });
      return existing;
    },

    /** Re-insert a previously deleted record verbatim (undo). */
    restoreCampaign(record) {
      if (!record || state.campaigns.some((c) => c.id === record.id)) return;
      commit({ ...state, campaigns: [...state.campaigns, record] });
    },

    /**
     * Merge daily performance rows into a campaign (a row for a date that
     * already exists is replaced). This is how a reporting feed would land.
     */
    addPerformance(id, rows) {
      const existing = find(id);
      const merged = normalizePerformance([...existing.performance, ...(rows || [])]);
      return replace({ ...existing, performance: merged, updatedAt: Date.now() });
    },

    /**
     * Insert many records at once (e.g. sample data). Records whose id already
     * exists are skipped. The batch is atomic: if any record is invalid nothing
     * is written.
     * @returns {object[]} the records that were actually added
     */
    addCampaigns(records) {
      if (!Array.isArray(records)) throw new Error('Expected an array of campaigns');
      const existing = new Set(state.campaigns.map((c) => c.id));
      const added = [];
      for (const r of records) {
        const record = toRecord(r, { strict: true }); // throws on bad input
        if (existing.has(record.id)) continue;
        existing.add(record.id);
        added.push(record);
      }
      if (added.length) commit({ ...state, campaigns: [...state.campaigns, ...added] });
      return added;
    },

    /**
     * Remove every campaign matching the predicate.
     * @returns {object[]} the removed records
     */
    removeCampaignsWhere(predicate) {
      const removed = state.campaigns.filter(predicate);
      if (removed.length) commit({ ...state, campaigns: state.campaigns.filter((c) => !predicate(c)) });
      return removed;
    },

    /** Display preferences. Only known keys/values are kept. */
    setPreferences(patch) {
      const next = normalizePreferences({ ...state.preferences, ...(patch || {}) });
      commit({ ...state, preferences: next });
      return next;
    },

    clearAll() {
      storage.clear();
      commit(hydrate(null));
    },
  };

  return api;
}

// ---------------------------------------------------------------------------

/**
 * "Copy of X", or "Copy of X (2)", "(3)", ... when that name is taken. Stays
 * within NAME_MAX by trimming the original name if needed.
 */
export function copyName(name, existingNames = []) {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const base = (n) => `Copy of ${n}`.slice(0, NAME_MAX);
  let candidate = base(name);
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = `${base(name).slice(0, NAME_MAX - suffix.length)}${suffix}`;
  }
  return candidate;
}

function serializable({ campaigns, preferences }) {
  return { campaigns, preferences };
}

/** Build a valid state from whatever was loaded (possibly nothing). */
function hydrate(loaded) {
  return { campaigns: sanitizeCampaigns(loaded?.campaigns), preferences: normalizePreferences(loaded?.preferences) };
}

export function normalizePreferences(input) {
  const currency = isCurrency(input?.currency) ? input.currency : DEFAULT_CURRENCY;
  return { currency };
}

function sanitizeCampaigns(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const c of list) {
    try {
      const record = toRecord(c, { strict: false });
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      out.push(record);
    } catch {
      // Drop records we cannot make sense of rather than poisoning the app.
    }
  }
  return out;
}

/** Full record (id, timestamps, performance) from a loose object. */
function toRecord(r, { strict }) {
  if (!r || typeof r !== 'object') throw new Error('Invalid campaign');
  const clean = normalizeCampaign(r);
  const id = typeof r.id === 'string' && r.id ? r.id : uid('cmp');
  const ts = Date.now();
  return {
    id,
    createdAt: Number.isFinite(r.createdAt) ? r.createdAt : ts,
    updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : ts,
    ...clean,
    performance: normalizePerformance(r.performance, { strict }),
  };
}

/** Validate & coerce a campaign payload (metadata + products). Throws on invalid input. */
export function normalizeCampaign(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid campaign');

  const name = String(input.name ?? '').trim().slice(0, NAME_MAX);
  if (!name) throw new Error('Campaign name is required');

  const dailyBudget = Number(input.dailyBudget);
  if (!Number.isInteger(dailyBudget) || dailyBudget < MIN_DAILY_BUDGET) throw new Error('Daily budget must be at least $1.00');
  if (dailyBudget > MAX_DAILY_BUDGET) throw new Error('Daily budget is too large');

  if (!isCampaignTypeId(input.type)) throw new Error('Choose a campaign type');

  const bidStrategy = input.bidStrategy ?? DEFAULT_BID_STRATEGY;
  if (!isBidStrategyId(bidStrategy)) throw new Error('Invalid bid strategy');
  if (!isBidStrategyAvailable(bidStrategy)) throw new Error('That bid strategy is not available yet');

  const products = normalizeProducts(input.products);
  if (!products.length) throw new Error('Add at least one product');

  const status = isStatusId(input.status) ? input.status : DEFAULT_STATUS;
  if (!isValidDayKey(input.startDate)) throw new Error('Start date must be YYYY-MM-DD');

  // Optional end date: empty means the campaign runs until paused or archived.
  const rawEnd = input.endDate == null || input.endDate === '' ? null : input.endDate;
  if (rawEnd != null && !isValidDayKey(rawEnd)) throw new Error('End date must be YYYY-MM-DD');
  if (rawEnd != null && rawEnd < input.startDate) throw new Error('End date cannot be before the start date');

  return { name, dailyBudget, type: input.type, bidStrategy, products, status, startDate: input.startDate, endDate: rawEnd };
}

/** Products are stored as snapshots (id, sku, name, category, price) so catalogue changes never break old campaigns. */
export function normalizeProducts(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const id = String(p.id ?? '').trim();
    const name = String(p.name ?? '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const price = Number(p.price);
    out.push({
      id,
      sku: String(p.sku ?? id).trim() || id,
      name,
      category: String(p.category ?? '').trim(),
      price: Number.isFinite(price) && price >= 0 ? Math.round(price) : 0,
    });
    if (out.length >= MAX_PRODUCTS) break;
  }
  return out;
}

/**
 * Validate daily performance rows: one row per date, sorted, non-negative
 * integer counters. In strict mode a bad row throws; otherwise it is dropped.
 */
export function normalizePerformance(rows, { strict = true } = {}) {
  if (rows == null) return [];
  if (!Array.isArray(rows)) {
    if (strict) throw new Error('Performance must be an array');
    return [];
  }
  const byDate = new Map();
  for (const r of rows) {
    try {
      byDate.set(r.date, normalizeRow(r));
    } catch (err) {
      if (strict) throw err;
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeRow(r) {
  if (!r || typeof r !== 'object' || !isValidDayKey(r.date)) throw new Error('Performance row needs a valid date');
  const out = { date: r.date };
  for (const k of BASE_METRICS) {
    const v = Number(r[k] ?? 0);
    if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid ${k} on ${r.date}`);
    out[k] = Math.round(v);
  }
  return out;
}
