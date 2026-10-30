import { plural } from '@shared/lib/plural';
import { Icon, type IconName } from '@shared/ui/Icon';
import { formatMoney } from '../lib/money';
import type { Summary } from '../lib/stats';

interface SummaryCardsProps {
  summary: Summary;
  counts: { income: number; expenses: number };
  currency: string;
  locale: string;
}

/** Income / Expenses / Remaining cards for the selected month. */
export function SummaryCards({ summary, counts, currency, locale }: SummaryCardsProps) {
  const fmt = (c: number) => formatMoney(c, { currency, locale });
  const spent = summary.income > 0 ? summary.expenses / summary.income : summary.expenses > 0 ? 1 : 0;
  const pct = Math.min(100, Math.round(spent * 100));
  const remainingMeta = summary.income > 0 ? `${Math.round(spent * 100)}% of income spent` : summary.expenses > 0 ? 'No income recorded this month' : 'Nothing recorded yet';

  return (
    <section className="summary" aria-label="Monthly summary">
      <Card kind="income" title="Income" icon="trendUp" value={fmt(summary.income)} meta={plural(counts.income, 'transaction')} />
      <Card kind="expenses" title="Expenses" icon="trendDown" value={fmt(summary.expenses)} meta={plural(counts.expenses, 'transaction')} />
      <Card kind="remaining" title="Remaining budget" icon="wallet" value={fmt(summary.remaining)} meta={remainingMeta} negative={summary.remaining < 0}>
        <div className="summary-card__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of income spent">
          <div className="summary-card__bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </Card>
    </section>
  );
}

interface CardProps {
  kind: 'income' | 'expenses' | 'remaining';
  title: string;
  icon: IconName;
  value: string;
  meta: string;
  negative?: boolean;
  children?: React.ReactNode;
}

function Card({ kind, title, icon, value, meta, negative = false, children }: CardProps) {
  return (
    <article className={`summary-card summary-card--${kind}${negative ? ' summary-card--negative' : ''}`}>
      <div className="summary-card__head">
        <span className="summary-card__icon">
          <Icon name={icon} size={20} />
        </span>
        <h3 className="summary-card__title">{title}</h3>
      </div>
      <p className="summary-card__value" data-testid={`summary-${kind}`}>
        {value}
      </p>
      <p className="summary-card__meta">{meta}</p>
      {children}
    </article>
  );
}
