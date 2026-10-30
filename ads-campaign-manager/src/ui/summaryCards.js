import { changeBetween, formatMetric, getMetric } from '../lib/metrics.js';
import { formatPercent } from '../lib/money.js';
import { h, icon } from './dom.js';

/**
 * The six headline cards: each shows a metric for the selected period, a
 * related secondary metric underneath, and the change against the previous
 * period of the same length (coloured by whether that change is good).
 */
export const SUMMARY_CARDS = [
  { metric: 'spend', secondary: 'cpc', icon: 'dollar' },
  { metric: 'sales', secondary: 'acos', icon: 'cart' },
  { metric: 'roas', secondary: null, icon: 'target', title: 'ROAS' },
  { metric: 'impressions', secondary: null, icon: 'eye' },
  { metric: 'clicks', secondary: 'ctr', icon: 'mousePointer' },
  { metric: 'conversions', secondary: 'cvr', icon: 'package' },
];

/** "+12.5% vs previous period" / "No previous data" / "No change". */
export function describeChange(change, { previousLabel = 'previous period', locale = 'en-US' } = {}) {
  if (!change) return '';
  if (change.pct == null) return change.delta > 0 ? `New vs ${previousLabel}` : `No data in ${previousLabel}`;
  if (change.direction === 'flat') return `No change vs ${previousLabel}`;
  const sign = change.direction === 'up' ? '+' : '−';
  return `${sign}${formatPercent(Math.abs(change.pct), { locale, digits: 1 })} vs ${previousLabel}`;
}

export function createSummaryCards(container) {
  const cards = SUMMARY_CARDS.map((def) => {
    const metric = getMetric(def.metric);
    const value = h('p', { class: 'ads-card__value', 'data-testid': `ads-summary-${def.metric}` }, '0');
    const secondary = h('p', { class: 'ads-card__secondary', 'data-testid': `ads-summary-${def.metric}-secondary` });
    const changeIcon = h('span', { class: 'ads-card__change-icon' });
    const changeText = h('span', {});
    const change = h('p', { class: 'ads-card__change', 'data-testid': `ads-summary-${def.metric}-change` }, changeIcon, changeText);
    const root = h(
      'article',
      { class: `ads-card ads-card--${def.metric}`, title: metric.description },
      h('div', { class: 'ads-card__head' }, h('span', { class: 'ads-card__icon' }, icon(def.icon, 18)), h('h3', { class: 'ads-card__title' }, def.title || metric.label)),
      value,
      secondary,
      change,
    );
    return { def, root, value, secondary, changeIcon, changeText, change };
  });

  const root = h('section', { class: 'ads-summary', 'aria-label': 'Campaign performance summary', 'data-testid': 'ads-summary' }, ...cards.map((c) => c.root));
  container.append(root);

  return {
    root,
    /**
     * @param {{totals: object, previous: object, campaignCount: number, locale?: string, currency?: string}} props
     *   `totals` / `previous` are summaries (with derived metrics) for the
     *   current and the preceding period.
     */
    update({ totals, previous, locale = 'en-US', currency }) {
      for (const card of cards) {
        const { metric, secondary } = card.def;
        card.value.textContent = formatMetric(metric, totals[metric], { locale, currency, compact: true });
        card.value.title = formatMetric(metric, totals[metric], { locale, currency });
        if (secondary) {
          card.secondary.textContent = `${getMetric(secondary).short} ${formatMetric(secondary, totals[secondary], { locale, currency })}`;
          card.secondary.hidden = false;
        } else {
          card.secondary.textContent = '';
          card.secondary.hidden = true;
        }
        const change = changeBetween(metric, totals[metric], previous?.[metric]);
        card.changeText.textContent = describeChange(change, { locale });
        card.change.dataset.tone = change.tone;
        card.change.dataset.direction = change.direction;
        card.changeIcon.replaceChildren(icon(change.direction === 'up' ? 'trendingUp' : change.direction === 'down' ? 'trendingDown' : 'minus', 13));
      }
    },
  };
}
