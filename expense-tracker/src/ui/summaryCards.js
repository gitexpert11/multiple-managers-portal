import { formatMoney } from '../lib/money.js';
import { h, icon } from './dom.js';

/** Income / Expenses / Remaining cards for the selected month. */
export function createSummaryCards(container) {
  const cards = {
    income: card('income', 'Income', 'trendUp'),
    expenses: card('expenses', 'Expenses', 'trendDown'),
    remaining: card('remaining', 'Remaining budget', 'wallet'),
  };
  const bar = h('div', { class: 'summary-card__bar' }, h('div', { class: 'summary-card__bar-fill' }));
  cards.remaining.root.append(bar);

  container.append(
    h('section', { class: 'summary', 'aria-label': 'Monthly summary' }, cards.income.root, cards.expenses.root, cards.remaining.root),
  );

  function card(kind, title, iconName) {
    const value = h('p', { class: 'summary-card__value', 'data-testid': `summary-${kind}` }, '—');
    const meta = h('p', { class: 'summary-card__meta' });
    const root = h(
      'article',
      { class: `summary-card summary-card--${kind}` },
      h('div', { class: 'summary-card__head' }, h('span', { class: 'summary-card__icon' }, icon(iconName, 20)), h('h3', { class: 'summary-card__title' }, title)),
      value,
      meta,
    );
    return { root, value, meta };
  }

  return {
    /** @param {{summary: {income:number, expenses:number, remaining:number}, counts: {income:number, expenses:number}, currency: string, locale: string}} props */
    update({ summary, counts, currency, locale }) {
      const fmt = (c) => formatMoney(c, { currency, locale });
      cards.income.value.textContent = fmt(summary.income);
      cards.income.meta.textContent = plural(counts.income, 'transaction');
      cards.expenses.value.textContent = fmt(summary.expenses);
      cards.expenses.meta.textContent = plural(counts.expenses, 'transaction');
      cards.remaining.value.textContent = fmt(summary.remaining);
      cards.remaining.root.classList.toggle('summary-card--negative', summary.remaining < 0);

      const spent = summary.income > 0 ? summary.expenses / summary.income : summary.expenses > 0 ? 1 : 0;
      const pct = Math.min(100, Math.round(spent * 100));
      bar.firstChild.style.width = `${pct}%`;
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-label', 'Share of income spent');
      cards.remaining.meta.textContent =
        summary.income > 0
          ? `${Math.round(spent * 100)}% of income spent`
          : summary.expenses > 0
            ? 'No income recorded this month'
            : 'Nothing recorded yet';
    },
  };
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
