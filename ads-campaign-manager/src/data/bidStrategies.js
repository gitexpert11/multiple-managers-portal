/**
 * Bid strategies. Only automatic bidding is available for now; the others are
 * listed (disabled) so the form already shows where the choice will live.
 */
export const BID_STRATEGIES = [
  {
    id: 'auto',
    label: 'Auto bid',
    description: 'Bids are adjusted automatically to get the most conversions within your daily budget.',
    available: true,
  },
  {
    id: 'manual',
    label: 'Manual bid',
    description: 'Set a fixed bid per product yourself.',
    available: false,
  },
];

export const DEFAULT_BID_STRATEGY = 'auto';

const BY_ID = new Map(BID_STRATEGIES.map((s) => [s.id, s]));

export function getBidStrategy(id) {
  return BY_ID.get(id) || null;
}

export function isBidStrategyId(id) {
  return BY_ID.has(id);
}

export function isBidStrategyAvailable(id) {
  return Boolean(BY_ID.get(id)?.available);
}
