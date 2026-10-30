import { mulberry32, pickDistinct, randInt } from '@shared/lib/prng';
import { currentMonthKey, daysInMonth, shiftMonth, splitMonthKey, todayKey } from '../lib/dates';
import type { Task, TaskCategoryId } from '../types';

/**
 * Deterministic sample tasks for manually exercising the UI.
 *
 * - Covers `months` calendar months centred on the current one — by default
 *   last month, this month and next month — so the dashboard shows every
 *   state at once: overdue, due today, upcoming and completed.
 * - Uses a seeded PRNG, so the same `now` + `seed` always yields the same
 *   records and the same ids. Ids are prefixed with MOCK_ID_PREFIX, which is
 *   how the app recognises (and removes) sample tasks later.
 */

export const MOCK_ID_PREFIX = 'mock_';
export const DEFAULT_MOCK_MONTHS = 3;

export function isMockTask(task: { id?: unknown } | null | undefined): boolean {
  return Boolean(task) && typeof task?.id === 'string' && task.id.startsWith(MOCK_ID_PREFIX);
}

type Template = [name: string, description: string];

const TEMPLATES: Record<TaskCategoryId, Template[]> = {
  office: [
    ['Prepare weekly status report', 'Numbers from the tracker, blockers, next steps'],
    ['Review open pull requests', ''],
    ['Quarterly planning deck', 'Draft slides and circulate before the offsite'],
    ['1:1 with manager', 'Bring the promotion checklist'],
    ['Submit timesheet', ''],
    ['Update project roadmap', 'Reflect the new launch date'],
    ['Client demo dry run', 'Check screen-share and demo account'],
    ['Renew software licences', 'Design tools and the CI runner'],
  ],
  personal: [
    ['Dentist appointment', '9:30, bring insurance card'],
    ['Renew gym membership', ''],
    ['Call Mum', ''],
    ['Book annual health check-up', ''],
    ['Pay credit card bill', 'Before the due date to avoid the fee'],
    ['Birthday gift for Ana', 'She mentioned the pottery class'],
    ['Finish the novel', 'Last three chapters'],
  ],
  travel: [
    ['Book flights', 'Compare morning vs evening departures'],
    ['Reserve hotel', 'Near the conference centre'],
    ['Renew passport', 'Expires in under six months'],
    ['Apply for visa', 'Appointment slots open on Mondays'],
    ['Buy travel insurance', ''],
    ['Pack for the trip', 'Adapter, chargers, printed itinerary'],
    ['Arrange airport transfer', ''],
  ],
  home: [
    ['Fix kitchen tap', 'Buy a washer from the hardware store first'],
    ['Pay electricity bill', ''],
    ['Deep clean the garage', ''],
    ['Service the air conditioner', 'Filter and gas check'],
    ['Replace smoke-alarm battery', ''],
    ['Weekly grocery run', 'Milk, eggs, coffee, vegetables'],
    ['Plant the spring bulbs', ''],
  ],
};

export function generateMockTasks({ now = new Date(), months = DEFAULT_MOCK_MONTHS, seed = 20240101 }: { now?: Date; months?: number; seed?: number } = {}): Task[] {
  if (!Number.isInteger(months) || months < 1) throw new Error('months must be a positive integer');
  const rand = mulberry32(seed);
  const today = todayKey(now);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = currentMonthKey(now);
  const categories = Object.keys(TEMPLATES) as TaskCategoryId[];
  const out: Task[] = [];
  let seq = 0;

  // Centre the window on the current month: 3 -> [-1, 0, +1], 4 -> [-2, 0, +1], ...
  const before = Math.ceil((months - 1) / 2);
  const after = months - 1 - before;

  for (let offset = -before; offset <= after; offset++) {
    const monthKey = shiftMonth(thisMonth, offset);
    const { year, month } = splitMonthKey(monthKey);
    const lastDay = daysInMonth(year, month);

    // Two tasks from each category per month, on distinct days where possible.
    const usedDays = new Set<number>();
    for (const category of categories) {
      const picks = pickDistinct(rand, TEMPLATES[category], 2);
      for (const [name, description] of picks) {
        let day = randInt(rand, 1, lastDay);
        for (let tries = 0; usedDays.has(day) && tries < 5; tries++) day = randInt(rand, 1, lastDay);
        usedDays.add(day);
        const endDate = `${monthKey}-${String(day).padStart(2, '0')}`;

        // Past: mostly done, a few left open (-> overdue). Today: half done.
        // Future: open, apart from the occasional early finisher.
        const doneChance = endDate < today ? 0.7 : endDate === today ? 0.5 : 0.1;
        const completed = rand() < doneChance;

        seq += 1;
        const due = Date.UTC(year, month - 1, day);
        const createdAt = due - randInt(rand, 3, 21) * 86_400_000 + seq; // created a few weeks before it is due
        out.push({
          id: `${MOCK_ID_PREFIX}${String(seq).padStart(4, '0')}`,
          name,
          description,
          endDate,
          category,
          completed,
          // Finished on the due day, or today if that is earlier (early finishers).
          completedAt: completed ? Math.min(due, todayUtc) - seq : null,
          createdAt,
          updatedAt: createdAt,
        });
      }
    }
    // Make sure "due today" is always represented when today falls in the window.
    if (monthKey === thisMonth && !out.some((t) => t.endDate === today)) {
      const [name, description] = TEMPLATES.office[0] as Template;
      seq += 1;
      out.push({
        id: `${MOCK_ID_PREFIX}${String(seq).padStart(4, '0')}`,
        name,
        description,
        endDate: today,
        category: 'office',
        completed: false,
        completedAt: null,
        createdAt: Date.UTC(year, month - 1, 1) + seq,
        updatedAt: Date.UTC(year, month - 1, 1) + seq,
      });
    }
  }
  return out;
}
