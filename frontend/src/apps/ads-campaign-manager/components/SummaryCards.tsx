import { Icon, type IconName } from '@shared/ui/Icon';
import { changeBetween, formatMetric, getMetric, type Change } from '../lib/metrics';
import { formatPercent } from '../lib/money';
import type { MetricId, Metrics } from '../types';

/**
 * The six headline cards: each shows a metric for the selected period, a
 * related secondary metric underneath, and the change against the previous
 * period of the same length (coloured by whether that change is good).
 */
export const SUMMARY_CARDS: { metric: MetricId; secondary: MetricId | null; icon: IconName; title?: string }[] = [
  { metric: 'spend', secondary: 'cpc', icon: 'dollar' },
  { metric: 'sales', secondary: 'acos', icon: 'cart' },
  { metric: 'roas', secondary: null, icon: 'target', title: 'ROAS' },
  { metric: 'impressions', secondary: null, icon: 'eye' },
  { metric: 'clicks', secondary: 'ctr', icon: 'mousePointer' },
  { metric: 'conversions', secondary: 'cvr', icon: 'package' },
];

/** "+12.5% vs previous period" / "No previous data" / "No change". */
export function describeChange(change: Change | null | undefined, { previousLabel = 'previous period', locale = 'en-US' } = {}): string {
  if (!change) return '';
  if (change.pct == null) return change.delta > 0 ? `New vs ${previousLabel}` : `No data in ${previousLabel}`;
  if (change.direction === 'flat') return `No change vs ${previousLabel}`;
  const sign = change.direction === 'up' ? '+' : '−';
  return `${sign}${formatPercent(Math.abs(change.pct), { locale, digits: 1 })} vs ${previousLabel}`;
}

interface SummaryCardsProps {
  totals: Metrics;
  previous: Metrics;
  currency: string;
  locale?: string;
}

export function SummaryCards({ totals, previous, currency, locale = 'en-US' }: SummaryCardsProps) {
  return (
    <section className="ads-summary" aria-label="Campaign performance summary" data-testid="ads-summary">
      {SUMMARY_CARDS.map((def) => {
        const metric = getMetric(def.metric);
        if (!metric) return null;
        const change = changeBetween(def.metric, totals[def.metric], previous[def.metric]);
        const secondary = def.secondary ? getMetric(def.secondary) : null;
        return (
          <article key={def.metric} className={`ads-card ads-card--${def.metric}`} title={metric.description}>
            <div className="ads-card__head">
              <span className="ads-card__icon">
                <Icon name={def.icon} size={18} />
              </span>
              <h3 className="ads-card__title">{def.title || metric.label}</h3>
            </div>
            <p className="ads-card__value" data-testid={`ads-summary-${def.metric}`} title={formatMetric(def.metric, totals[def.metric], { locale, currency })}>
              {formatMetric(def.metric, totals[def.metric], { locale, currency, compact: true })}
            </p>
            <p className="ads-card__secondary" data-testid={`ads-summary-${def.metric}-secondary`} hidden={!secondary}>
              {secondary ? `${secondary.short} ${formatMetric(secondary.id, totals[secondary.id], { locale, currency })}` : ''}
            </p>
            <p className="ads-card__change" data-testid={`ads-summary-${def.metric}-change`} data-tone={change.tone} data-direction={change.direction}>
              <span className="ads-card__change-icon">
                <Icon name={change.direction === 'up' ? 'trendingUp' : change.direction === 'down' ? 'trendingDown' : 'minus'} size={13} />
              </span>
              <span>{describeChange(change, { locale })}</span>
            </p>
          </article>
        );
      })}
    </section>
  );
}
