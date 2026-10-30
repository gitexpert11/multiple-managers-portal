import { mulberry32, pick, randInt } from '@shared/lib/prng';
import { currentMonthKey, daysInMonth, shiftMonth, splitMonthKey, todayKey } from '../lib/dates';
import type { Transaction, TxType } from '../types';

/**
 * Deterministic sample data for manually exercising the UI.
 *
 * - Covers the last `months` calendar months, ending with the current month.
 * - Never produces a date after `now` (the app rejects future dates).
 * - Uses a seeded PRNG, so the same `now` + `seed` always yields the same
 *   records and the same ids. Ids are prefixed with MOCK_ID_PREFIX, which is
 *   how the app recognises (and removes) sample records later — even if the
 *   user has edited them in the meantime.
 * - Only references built-in category ids, which cannot be deleted.
 */

export const MOCK_ID_PREFIX = 'mock_';
export const DEFAULT_MOCK_MONTHS = 24;

export function isMockTransaction(tx: { id?: unknown } | null | undefined): boolean {
  return Boolean(tx) && typeof tx?.id === 'string' && tx.id.startsWith(MOCK_ID_PREFIX);
}

interface Template {
  min: number;
  max: number;
  every?: boolean;
  chance?: number;
  count?: [number, number];
  day: [number, number];
  descriptions: string[];
}

const INCOME_TEMPLATES: Record<string, Template> = {
  cat_salary: { min: 420000, max: 480000, every: true, day: [1, 1], descriptions: ['Monthly salary'] },
  cat_freelance: { min: 25000, max: 120000, chance: 0.45, day: [8, 26], descriptions: ['Freelance project', 'Consulting invoice', 'Design work'] },
  cat_investments: { min: 3000, max: 40000, chance: 0.35, day: [15, 28], descriptions: ['Dividends', 'Interest', 'Stock sale'] },
  cat_gifts: { min: 2000, max: 15000, chance: 0.1, day: [2, 28], descriptions: ['Birthday gift', 'Cash gift'] },
};

const EXPENSE_TEMPLATES: Record<string, Template> = {
  cat_housing: { min: 120000, max: 120000, every: true, day: [1, 3], descriptions: ['Rent'] },
  cat_utilities: { min: 9000, max: 22000, every: true, day: [5, 12], descriptions: ['Electricity & water', 'Internet', 'Phone bill'] },
  cat_groceries: { min: 4500, max: 14000, count: [1, 3], day: [1, 28], descriptions: ['Weekly groceries', 'Supermarket', 'Farmers market'] },
  cat_food: { min: 900, max: 6500, count: [1, 3], day: [1, 28], descriptions: ['Lunch', 'Coffee', 'Dinner out', 'Takeaway', 'Brunch'] },
  cat_transport: { min: 1500, max: 9000, count: [1, 2], day: [1, 28], descriptions: ['Fuel', 'Train pass', 'Taxi', 'Parking'] },
  cat_entertainment: { min: 1200, max: 8000, chance: 0.8, day: [1, 28], descriptions: ['Streaming', 'Cinema', 'Concert tickets', 'Games'] },
  cat_shopping: { min: 2500, max: 25000, chance: 0.7, day: [1, 28], descriptions: ['Clothes', 'Electronics', 'Home goods', 'Books'] },
  cat_health: { min: 2000, max: 15000, chance: 0.35, day: [1, 28], descriptions: ['Pharmacy', 'Dentist', 'Gym membership'] },
  cat_education: { min: 1500, max: 30000, chance: 0.2, day: [1, 28], descriptions: ['Online course', 'Textbooks'] },
  cat_other_expense: { min: 500, max: 6000, chance: 0.3, day: [1, 28], descriptions: ['Misc', 'Bank fee', 'Donation'] },
};

export function generateMockTransactions({ now = new Date(), months = DEFAULT_MOCK_MONTHS, seed = 20240101 }: { now?: Date; months?: number; seed?: number } = {}): Transaction[] {
  if (!Number.isInteger(months) || months < 1) throw new Error('months must be a positive integer');
  const rand = mulberry32(seed);
  const today = todayKey(now);
  const thisMonth = currentMonthKey(now);
  const out: Transaction[] = [];
  let seq = 0;

  for (let offset = months - 1; offset >= 0; offset--) {
    const monthKey = shiftMonth(thisMonth, -offset);
    const { year, month } = splitMonthKey(monthKey);
    const lastDay = daysInMonth(year, month);
    const monthIdx = months - 1 - offset;

    const emit = (type: TxType, categoryId: string, tpl: Template) => {
      const day = Math.min(lastDay, randInt(rand, tpl.day[0], tpl.day[1]));
      const date = `${monthKey}-${String(day).padStart(2, '0')}`;
      if (date > today) return; // never in the future
      seq += 1;
      out.push({
        id: `${MOCK_ID_PREFIX}${String(seq).padStart(4, '0')}`,
        type,
        amount: roundCents(randInt(rand, tpl.min, tpl.max)),
        categoryId,
        description: pick(rand, tpl.descriptions),
        date,
        // Stable timestamps so exports are reproducible; ordered by month so
        // ties on date sort predictably.
        createdAt: Date.UTC(year, month - 1, day) + seq,
        updatedAt: Date.UTC(year, month - 1, day) + seq,
      });
    };

    for (const [categoryId, tpl] of Object.entries(INCOME_TEMPLATES)) {
      // A small raise each year keeps the numbers from looking copy-pasted.
      const raise = categoryId === 'cat_salary' ? Math.floor(monthIdx / 12) * 15000 : 0;
      if (tpl.every || rand() < (tpl.chance ?? 0)) emit('income', categoryId, { ...tpl, min: tpl.min + raise, max: tpl.max + raise });
    }
    for (const [categoryId, tpl] of Object.entries(EXPENSE_TEMPLATES)) {
      const n = tpl.every ? 1 : tpl.count ? randInt(rand, tpl.count[0], tpl.count[1]) : rand() < (tpl.chance ?? 0) ? 1 : 0;
      for (let i = 0; i < n; i++) emit('expense', categoryId, tpl);
    }
  }
  return out;
}

/** Snap to whole-dollar-ish amounts most of the time so the data reads naturally. */
function roundCents(cents: number): number {
  return cents >= 10000 ? Math.round(cents / 100) * 100 : Math.round(cents / 5) * 5;
}
