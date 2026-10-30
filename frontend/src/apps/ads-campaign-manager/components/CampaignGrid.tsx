import { useEffect, useRef } from 'react';
import { plural } from '@shared/lib/plural';
import { Icon } from '@shared/ui/Icon';
import { getBidStrategy } from '../data/bidStrategies';
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, getCampaignType, getStatus, isArchived } from '../data/campaignTypes';
import { formatDay } from '../lib/dates';
import { formatMetric } from '../lib/metrics';
import { formatMoney } from '../lib/money';
import { pageBounds } from '../lib/pagination';
import type { CampaignFilter, CampaignPage, CampaignTypeId, CampaignWithMetrics, GridSort, MetricId, Metrics, StatusFilter } from '../types';
import { Pager } from './Pager';
import { RowMenu } from './RowMenu';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  numeric?: boolean;
  metric?: boolean;
  srOnly?: boolean;
  sticky?: boolean;
}

/** Grid columns. Metric columns use the metric id as their key so sorting is uniform. */
export const COLUMNS: Column[] = [
  { key: 'name', label: 'Campaign', sortable: true, sticky: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'type', label: 'Type', sortable: true },
  { key: 'products', label: 'Products', sortable: true, numeric: true },
  { key: 'bid', label: 'Bid' },
  { key: 'startDate', label: 'Start', sortable: true },
  { key: 'endDate', label: 'End', sortable: true },
  { key: 'budget', label: 'Daily budget', sortable: true, numeric: true },
  { key: 'impressions', label: 'Impressions', sortable: true, numeric: true, metric: true },
  { key: 'clicks', label: 'Clicks', sortable: true, numeric: true, metric: true },
  { key: 'ctr', label: 'CTR', sortable: true, numeric: true, metric: true },
  { key: 'spend', label: 'Spend', sortable: true, numeric: true, metric: true },
  { key: 'cpc', label: 'CPC', sortable: true, numeric: true, metric: true },
  { key: 'conversions', label: 'Orders', sortable: true, numeric: true, metric: true },
  { key: 'sales', label: 'Sales', sortable: true, numeric: true, metric: true },
  { key: 'roas', label: 'ROAS', sortable: true, numeric: true, metric: true },
  { key: 'actions', label: 'Actions', srOnly: true },
];

/** "All" means every live (active or paused) campaign; archived ones have their own view. */
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [{ id: 'all', label: 'All' }, ...CAMPAIGN_STATUSES.map((s) => ({ id: s.id as StatusFilter, label: s.label }))];

interface CampaignGridProps {
  page: CampaignPage | null;
  /** Totals over every filtered campaign for the period (from the dashboard summary). */
  totals: Metrics;
  sort: GridSort;
  filter: CampaignFilter;
  rangeLabel: string;
  today: string;
  highlightId?: string | null;
  hasAnyCampaigns: boolean;
  archivedCount: number;
  loading?: boolean;
  locale?: string;
  currency: string;
  onSort: (sort: GridSort) => void;
  onFilter: (patch: Partial<CampaignFilter>) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onToggleStatus: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
}

/**
 * Campaign grid: one row per campaign with its metadata and its performance
 * over the selected period. Sortable columns, search + status + type filters,
 * a pager (rows-per-page 5 / 10 / 20), a totals footer covering every
 * filtered row, and per-row actions. Card layout on phones (CSS).
 */
export function CampaignGrid({ page, totals, sort, filter, rangeLabel, today, highlightId = null, hasAnyCampaigns, archivedCount, loading = false, locale = 'en-US', currency, onSort, onFilter, onPage, onPageSize, onToggleStatus, onDuplicate, onArchive, onUnarchive, onDelete, onCreate, onEdit }: CampaignGridProps) {
  const items = page?.items ?? [];
  const total = page?.total ?? 0;
  const highlightRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (highlightId) highlightRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightId, page]);

  const filtered = Boolean(filter.query || filter.type || (filter.status && filter.status !== 'all'));
  const hiddenArchived = filter.status === 'all' && archivedCount > 0 ? ` · ${archivedCount} archived hidden` : '';
  const subtitle = `${plural(total, 'campaign')}${filtered ? ' matching your filters' : ''}${hiddenArchived} · performance for ${rangeLabel}`;
  const bounds = page ? pageBounds(page.page, page.pageSize, page.total) : { from: 0, to: 0 };

  return (
    <section className="ads-panel ads-grid-panel" data-testid="ads-campaigns" aria-busy={loading ? 'true' : 'false'}>
      <div className="ads-panel__head">
        <div>
          <h2 className="ads-panel__title">Campaigns</h2>
          <p className="ads-panel__hint">{subtitle}</p>
        </div>
      </div>

      <div className="ads-filters">
        <label className="ads-search">
          <Icon name="search" size={15} />
          <input type="search" className="ads-search__input" placeholder="Search campaigns or products" aria-label="Search campaigns" data-testid="ads-search" autoComplete="off" value={filter.query} onChange={(e) => onFilter({ query: e.target.value })} />
        </label>
        <div className="ads-segmented" role="radiogroup" aria-label="Filter by status">
          {STATUS_FILTERS.map((s) => (
            <span key={s.id} style={{ display: 'contents' }}>
              <input type="radio" name="ads-status-filter" id={`ads-status-${s.id}`} value={s.id} className="ads-segmented__input" checked={(filter.status || 'all') === s.id} onChange={() => onFilter({ status: s.id })} />
              <label htmlFor={`ads-status-${s.id}`} className="ads-segmented__label">
                {s.label}
              </label>
            </span>
          ))}
        </div>
        <div className="ads-chip-row" role="group" aria-label="Filter by campaign type">
          <TypeChip id={null} label="All types" active={filter.type == null} onClick={() => onFilter({ type: null })} />
          {CAMPAIGN_TYPES.map((t) => (
            <TypeChip key={t.id} id={t.id} label={t.label} color={t.color} active={filter.type === t.id} onClick={() => onFilter({ type: t.id })} />
          ))}
        </div>
      </div>

      {!page ? (
        <p className="ads-empty ads-empty--compact" data-testid="ads-grid-placeholder">
          {loading ? 'Loading campaigns…' : 'Campaigns could not be loaded.'}
        </p>
      ) : total === 0 ? (
        <div className="ads-empty">
          <p className="ads-empty__title">{hasAnyCampaigns ? 'No campaigns match these filters.' : 'No campaigns yet.'}</p>
          {hasAnyCampaigns ? (
            <button type="button" className="ads-btn ads-btn--ghost" onClick={() => onFilter({ status: 'all', type: null, query: '' })}>
              Clear filters
            </button>
          ) : (
            <button type="button" className="ads-btn ads-btn--primary" data-testid="ads-create-first" onClick={onCreate}>
              <Icon name="plus" size={16} />
              <span>Create your first campaign</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="ads-grid-scroll">
            <table className="ads-grid" aria-label="Campaigns">
              <thead>
                <tr>
                  {COLUMNS.map((col) => {
                    const active = sort.key === col.key;
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        className={[col.numeric && 'is-numeric', col.sticky && 'is-sticky', col.srOnly && 'sr-only-head'].filter(Boolean).join(' ')}
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : undefined}
                      >
                        {col.sortable ? (
                          <button type="button" className={`ads-grid__sort${active ? ' is-active' : ''}`} data-sort={col.key} onClick={() => onSort({ key: col.key, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}>
                            {col.label}
                            <span className="ads-grid__sort-arrow" aria-hidden="true">
                              {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          </button>
                        ) : (
                          <span className={col.srOnly ? 'sr-only' : ''}>{col.label}</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <CampaignRow
                    key={c.id}
                    ref={highlightId === c.id ? highlightRef : undefined}
                    campaign={c}
                    today={today}
                    locale={locale}
                    currency={currency}
                    highlighted={highlightId === c.id}
                    onEdit={onEdit}
                    onToggleStatus={onToggleStatus}
                    onDuplicate={onDuplicate}
                    onArchive={onArchive}
                    onUnarchive={onUnarchive}
                    onDelete={onDelete}
                  />
                ))}
              </tbody>
              {page && (
                <tfoot>
                  <tr>
                    <td className="is-sticky">Total · {plural(total, 'campaign')}</td>
                    <td />
                    <td />
                    <td className="is-numeric" data-label="Products">
                      {String(page.aggregates.products)}
                    </td>
                    <td />
                    <td />
                    <td />
                    <td className="is-numeric" data-label="Daily budget">
                      {formatMoney(page.aggregates.dailyBudget, { locale, currency })}
                    </td>
                    {COLUMNS.filter((c) => c.metric).map((c) => (
                      <td key={c.key} className="is-numeric" data-label={c.label} data-testid={`ads-grid-total-${c.key}`}>
                        {formatMetric(c.key, totals[c.key as MetricId], { locale, currency })}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Pager page={page?.page ?? 1} pageCount={page?.pageCount ?? 1} pageSize={page?.pageSize} total={total} from={bounds.from} to={bounds.to} noun="campaigns" label="Campaign pages" onPage={onPage} onPageSize={onPageSize} />
        </>
      )}
    </section>
  );
}

function TypeChip({ id, label, color, active, onClick }: { id: CampaignTypeId | null; label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`ads-chip${active ? ' is-active' : ''}`} data-type={id ?? ''} aria-pressed={active ? 'true' : 'false'} style={color ? ({ '--chip-color': color } as React.CSSProperties) : undefined} onClick={onClick}>
      {color && <span className="ads-chip__dot" aria-hidden="true" />}
      {label}
    </button>
  );
}

interface RowProps {
  ref?: React.Ref<HTMLTableRowElement>;
  campaign: CampaignWithMetrics;
  today: string;
  locale: string;
  currency: string;
  highlighted: boolean;
  onEdit: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function CampaignRow({ ref, campaign: c, today, locale, currency, highlighted, onEdit, onToggleStatus, onDuplicate, onArchive, onUnarchive, onDelete }: RowProps) {
  const type = getCampaignType(c.type);
  const archived = isArchived(c);
  const served = c.metrics.days > 0;
  const ended = Boolean(c.endDate && today && c.endDate < today);
  const label = (key: string) => COLUMNS.find((col) => col.key === key)?.label;
  const metricCell = (key: MetricId) => (
    <td data-label={label(key)} className="is-numeric" title={served ? undefined : 'No performance data in this period'}>
      {served ? formatMetric(key, c.metrics[key], { locale, currency }) : '—'}
    </td>
  );
  return (
    <tr ref={ref} className={`ads-grid__row${highlighted ? ' is-new' : ''}${c.status !== 'active' ? ' is-paused' : ''}${archived ? ' is-archived' : ''}`} data-id={c.id} data-status={c.status} data-served={served ? 'true' : 'false'}>
      <td className="is-sticky ads-grid__campaign" data-label="Campaign">
        <span className="ads-grid__name">
          <button type="button" className="ads-grid__name-btn" data-action="open" title={c.name} onClick={() => onEdit(c.id)}>
            {c.name}
          </button>
        </span>
      </td>
      <td data-label={label('status')}>
        <span className={`ads-badge ads-badge--${c.status}`}>{getStatus(c.status)?.label || c.status}</span>
      </td>
      <td data-label={label('type')}>
        <span className="ads-type-pill" style={{ '--type-color': type?.color || '#9ca3af' } as React.CSSProperties} title={type?.label || c.type}>
          <Icon name={type?.icon || 'tag'} size={12} />
          {type?.short || type?.label || c.type}
        </span>
      </td>
      <td data-label={label('products')} className="is-numeric" title={c.products.map((p) => p.name).join(', ')}>
        {String(c.products.length)}
      </td>
      <td data-label={label('bid')}>{getBidStrategy(c.bidStrategy)?.label || c.bidStrategy}</td>
      <td data-label={label('startDate')} className="ads-grid__date">
        {formatDay(c.startDate, locale)}
      </td>
      <td data-label={label('endDate')} className="ads-grid__date">
        {c.endDate ? (
          <span className={ended ? 'ads-grid__ended' : undefined} title={ended ? 'Ended' : undefined}>
            {formatDay(c.endDate, locale)}
          </span>
        ) : (
          <span className="ads-grid__muted">—</span>
        )}
      </td>
      <td data-label={label('budget')} className="is-numeric">
        {formatMoney(c.dailyBudget, { locale, currency })}
      </td>
      {metricCell('impressions')}
      {metricCell('clicks')}
      {metricCell('ctr')}
      {metricCell('spend')}
      {metricCell('cpc')}
      {metricCell('conversions')}
      {metricCell('sales')}
      {metricCell('roas')}
      <td className="ads-grid__actions">
        <button type="button" className="ads-icon-btn" data-action="edit" aria-label={`Edit "${c.name}"`} title="Edit campaign" onClick={() => onEdit(c.id)}>
          <Icon name="edit" size={15} />
        </button>
        {archived ? (
          <button type="button" className="ads-icon-btn" data-action="unarchive" aria-label={`Unarchive "${c.name}"`} title="Unarchive campaign" onClick={() => onUnarchive(c.id)}>
            <Icon name="archiveRestore" size={15} />
          </button>
        ) : (
          <button
            type="button"
            className="ads-icon-btn"
            data-action="toggle-status"
            aria-label={c.status === 'active' ? `Pause "${c.name}"` : `Resume "${c.name}"`}
            title={c.status === 'active' ? 'Pause campaign' : 'Resume campaign'}
            onClick={() => onToggleStatus(c.id)}
          >
            <Icon name={c.status === 'active' ? 'pause' : 'play'} size={15} />
          </button>
        )}
        <RowMenu
          label={`More actions for "${c.name}"`}
          items={[
            { action: 'duplicate', label: 'Duplicate', icon: 'copy', onClick: () => onDuplicate(c.id) },
            archived ? { action: 'unarchive', label: 'Unarchive', icon: 'archiveRestore', onClick: () => onUnarchive(c.id) } : { action: 'archive', label: 'Archive', icon: 'archive', onClick: () => onArchive(c.id) },
            { action: 'delete', label: 'Delete', icon: 'trash', danger: true, onClick: () => onDelete(c.id) },
          ]}
        />
      </td>
    </tr>
  );
}
