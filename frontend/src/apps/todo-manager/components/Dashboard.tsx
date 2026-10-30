import { plural } from '@shared/lib/plural';
import { Icon, type IconName } from '@shared/ui/Icon';
import { TASK_CATEGORIES, getCategory } from '../data/categories';
import { describeDue, formatDay, monthLabel } from '../lib/dates';
import type { TaskSummary } from '../lib/stats';
import type { Task, TaskCategoryId, TaskFilter, TaskStatusFilter } from '../types';

const STATUS_FILTERS: { id: TaskStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'completed', label: 'Completed' },
];

interface DashboardProps {
  /** Already filtered & sorted tasks for the month. */
  tasks: Task[];
  /** Summary of the whole month (before filters). */
  summary: TaskSummary;
  filter: TaskFilter;
  month: string;
  today: string;
  locale?: string;
  /** Whether the month has any task at all (before filters). */
  hasAnyTasks: boolean;
  overdueElsewhere?: Task[];
  chart?: React.ReactNode;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onFilter: (patch: Partial<TaskFilter>) => void;
  onCreate: () => void;
  onGoToMonth: (month: string) => void;
}

/** Dashboard page: summary cards, category chart, status + category filters and the task list. */
export function Dashboard({ tasks, summary, filter, month, today, locale = 'en-US', hasAnyTasks, overdueElsewhere = [], chart, onToggle, onDelete, onFilter, onCreate, onGoToMonth }: DashboardProps) {
  const latestOverdueMonth = overdueElsewhere.length ? (overdueElsewhere.map((t) => t.endDate).sort().at(-1) as string).slice(0, 7) : null;

  return (
    <div className="todo-dashboard" data-testid="todo-dashboard">
      <section className="todo-summary" aria-label="Task summary">
        <SummaryCard kind="open" title="Open tasks" icon="listChecks" value={summary.open} meta={`of ${plural(summary.total, 'task')} in ${monthLabel(month)}`} />
        <SummaryCard kind="due-today" title="Due today" icon="clock" value={summary.dueToday} meta={formatDay(today, locale)} />
        <SummaryCard kind="overdue" title="Overdue" icon="alert" value={summary.overdue} meta={summary.overdue ? 'Needs attention' : 'Nothing overdue'} alert={summary.overdue > 0} />
        <SummaryCard kind="completed" title="Completed" icon="checkCircle" value={summary.completed} meta={summary.total ? `${Math.round((summary.completed / summary.total) * 100)}% done` : 'Nothing yet'} />
      </section>

      <div className="todo-dashboard__chart">{chart}</div>

      <section className="todo-panel" data-testid="todo-tasks">
        <div className="todo-panel__head">
          <div>
            <h2 className="todo-panel__title">Your tasks</h2>
            <p className="todo-panel__hint">
              {plural(tasks.length, 'task')}
              {filter.status !== 'all' || filter.category ? ' matching your filters' : ''} · due in {monthLabel(month)}
            </p>
          </div>
          <button type="button" className="todo-btn todo-btn--primary" data-testid="todo-new-task" onClick={onCreate}>
            <Icon name="plus" size={16} />
            <span>New task</span>
          </button>
        </div>

        <div className="todo-filters">
          <div className="todo-segmented" role="radiogroup" aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => (
              <span key={s.id} style={{ display: 'contents' }}>
                <input type="radio" name="todo-status-filter" id={`todo-status-${s.id}`} value={s.id} className="todo-segmented__input" checked={filter.status === s.id} onChange={() => onFilter({ status: s.id })} />
                <label htmlFor={`todo-status-${s.id}`} className="todo-segmented__label">
                  {s.label}
                </label>
              </span>
            ))}
          </div>
          <div className="todo-chip-row" role="group" aria-label="Filter by category">
            <Chip active={filter.category == null} label="All categories" onClick={() => onFilter({ category: null })} />
            {TASK_CATEGORIES.map((c) => (
              <Chip key={c.id} active={filter.category === c.id} label={c.label} color={c.color} onClick={() => onFilter({ category: c.id })} />
            ))}
          </div>
        </div>

        {latestOverdueMonth && (
          <div className="todo-notice" role="status" data-testid="todo-overdue-elsewhere">
            <Icon name="alert" size={16} />
            <span>{plural(overdueElsewhere.length, 'overdue task')} in other months</span>
            <button type="button" className="todo-notice__action" onClick={() => onGoToMonth(latestOverdueMonth)}>
              View
            </button>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="todo-empty">
            <p className="todo-empty__title">{hasAnyTasks ? 'No tasks match these filters.' : `No tasks due in ${monthLabel(month)}.`}</p>
            {hasAnyTasks ? (
              <button type="button" className="todo-btn todo-btn--ghost" onClick={() => onFilter({ status: 'all', category: null })}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="todo-btn todo-btn--primary" onClick={onCreate}>
                <Icon name="plus" size={16} />
                <span>Create a task</span>
              </button>
            )}
          </div>
        ) : (
          <ul className="todo-list" aria-label="Tasks">
            {tasks.map((t) => (
              <TaskItem key={t.id} task={t} today={today} locale={locale} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ kind, title, icon, value, meta, alert = false }: { kind: string; title: string; icon: IconName; value: number; meta: string; alert?: boolean }) {
  return (
    <article className={`todo-summary-card todo-summary-card--${kind}${alert ? ' is-alert' : ''}`}>
      <div className="todo-summary-card__head">
        <span className="todo-summary-card__icon">
          <Icon name={icon} size={18} />
        </span>
        <h3 className="todo-summary-card__title">{title}</h3>
      </div>
      <p className="todo-summary-card__value" data-testid={`todo-summary-${kind}`}>
        {value}
      </p>
      <p className="todo-summary-card__meta">{meta}</p>
    </article>
  );
}

function Chip({ active, label, color, onClick }: { active: boolean; label: string; color?: string; onClick: () => void }) {
  return (
    <button type="button" className={`todo-chip${active ? ' is-active' : ''}`} aria-pressed={active ? 'true' : 'false'} style={color ? ({ '--cat-color': color } as React.CSSProperties) : undefined} onClick={onClick}>
      {color && <span className="todo-chip__dot" aria-hidden="true" />}
      {label}
    </button>
  );
}

function TaskItem({ task: t, today, locale, onToggle, onDelete }: { task: Task; today: string; locale: string; onToggle: (id: string) => void; onDelete: (id: string) => void }) {
  const cat = getCategory(t.category as TaskCategoryId);
  const due = t.completed ? null : describeDue(t.endDate, today);
  const status = t.completed ? 'completed' : (due?.status ?? 'upcoming');
  const checkboxId = `todo-done-${t.id}`;
  return (
    <li className={`todo-item todo-item--${status}${t.completed ? ' is-completed' : ''}`} data-id={t.id} data-status={status}>
      <div className="todo-item__check">
        <input type="checkbox" id={checkboxId} className="todo-item__checkbox" checked={t.completed} aria-label={`Mark "${t.name}" as ${t.completed ? 'open' : 'completed'}`} onChange={() => onToggle(t.id)} />
        <label htmlFor={checkboxId} className="todo-item__checkmark" aria-hidden="true">
          <Icon name="check" size={14} />
        </label>
      </div>
      <div className="todo-item__body">
        <p className="todo-item__name">{t.name}</p>
        {t.description ? <p className="todo-item__desc">{t.description}</p> : null}
        <div className="todo-item__meta">
          <span className="todo-category-pill" style={{ '--cat-color': cat?.color || '#9ca3af' } as React.CSSProperties}>
            <Icon name={cat?.icon || 'circle'} size={13} />
            {cat?.label || 'Uncategorised'}
          </span>
          <span className="todo-item__date">
            <Icon name="calendar" size={13} />
            <time dateTime={t.endDate}>{formatDay(t.endDate, locale)}</time>
          </span>
          <span className={`todo-badge todo-badge--${status}`}>{t.completed ? 'Completed' : due?.label}</span>
        </div>
      </div>
      <div className="todo-item__actions">
        <button type="button" className="todo-icon-btn todo-icon-btn--danger" aria-label={`Delete "${t.name}"`} onClick={() => onDelete(t.id)}>
          <Icon name="trash" size={16} />
        </button>
      </div>
    </li>
  );
}
