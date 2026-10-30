import type { BidStrategyId } from '../types';

/**
 * Bid strategies. Only automatic bidding is available for now; the others are
 * listed (disabled) so the form already shows where the choice will live.
 */
export interface BidStrategyDef {
  id: BidStrategyId;
  label: string;
  description: string;
  available: boolean;
}

export const BID_STRATEGIES: BidStrategyDef[] = [
  { id: 'auto', label: 'Auto bid', description: 'Bids are adjusted automatically to get the most conversions within your daily budget.', available: true },
  { id: 'manual', label: 'Manual bid', description: 'Set a fixed bid per product yourself.', available: false },
];

export const DEFAULT_BID_STRATEGY: BidStrategyId = 'auto';

const BY_ID = new Map(BID_STRATEGIES.map((s) => [s.id, s]));

export function getBidStrategy(id: string): BidStrategyDef | null {
  return BY_ID.get(id as BidStrategyId) || null;
}

export function isBidStrategyAvailable(id: string): boolean {
  return Boolean(BY_ID.get(id as BidStrategyId)?.available);
}
