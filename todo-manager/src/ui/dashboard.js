import { TASK_CATEGORIES, getCategory } from '../data/categories.js';
import { describeDue, formatDay, monthLabel } from '../lib/dates.js';
import { h, icon, replaceChildren } from './dom.js';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'completed', label: 'Completed' },
];

/**
 * Dashboard page: summary cards, status + category filters and the task list.
 *
 * Rendering is prop-driven: the parent passes the already filtered & sorted
 * tasks plus the summary, and gets callbacks for every user action.
 *
 * @param {{onToggle, onDelete, onFilter, onCreate, onGoToMonth}} opts
 */
export function createDashboard(container, { onToggle, onDelete, onFilter, onCreate, onGoToMonth }) {
  // --- summary cards --------------------------------------------------------
  const cards = {
    open: card('open', 'Open tasks', 'listChecks'),
    dueToday: card('due-today', 'Due today', 'clock'),
    overdue: card('overdue', 'Overdue', 'alert'),
    completed: card('completed', 'Completed', 'checkCircle'),
  };

  function card(kind, title, iconName) {
    const value = h('p', { class: 'todo-summary-card__value', 'data-testid': `todo-summary-${kind}` }, '0');
    const meta = h('p', { class: 'todo-summary-card__meta' });
    const root = h(
      'article',
      { class: `todo-summary-card todo-summary-card--${kind}` },
      h('div', { class: 'todo-summary-card__head' }, h('span', { class: 'todo-summary-card__icon' }, icon(iconName, 18)), h('h3', { class: 'todo-summary-card__title' }, title)),
      value,
      meta,
    );
    return { root, value, meta };
  }

  // --- filters --------------------------------------------------------------
  const statusInputs = STATUS_FILTERS.map((s) =>
    h('input', {
      type: 'radio',
      name: 'todo-status-filter',
      id: `todo-status-${s.id}`,
      value: s.id,
      class: 'todo-segmented__input',
      checked: s.id === 'all',
      onchange: () => onFilter({ status: s.id }),
    }),
  );
  const statusGroup = h(
    'div',
    { class: 'todo-segmented', role: 'radiogroup', 'aria-label': 'Filter by status' },
    ...STATUS_FILTERS.flatMap((s, i) => [statusInputs[i], h('label', { for: `todo-status-${s.id}`, class: 'todo-segmented__label' }, s.label)]),
  );

  const categoryChips = [
    chip(null, 'All categories', null),
    ...TASK_CATEGORIES.map((c) => chip(c.id, c.label, c)),
  ];
  function chip(id, label, cat) {
    return h(
      'button',
      {
        type: 'button',
        class: 'todo-chip',
        'data-category': id ?? '',
        'aria-pressed': 'false',
        style: cat ? { '--cat-color': cat.color } : null,
        onclick: () => onFilter({ category: id }),
      },
      cat ? h('span', { class: 'todo-chip__dot', 'aria-hidden': 'true' }) : null,
      label,
    );
  }
  const categoryRow = h('div', { class: 'todo-chip-row', role: 'group', 'aria-label': 'Filter by category' }, ...categoryChips);

  // --- list -----------------------------------------------------------------
  const subtitle = h('p', { class: 'todo-panel__hint' });
  const list = h('ul', { class: 'todo-list', 'aria-label': 'Tasks' });
  const empty = h('div', { class: 'todo-empty', hidden: true });
  // Month scoping can hide overdue work due in other months; point at it.
  const elsewhereText = h('span', {});
  const elsewhere = h(
    'div',
    { class: 'todo-notice', role: 'status', hidden: true, 'data-testid': 'todo-overdue-elsewhere' },
    icon('alert', 16),
    elsewhereText,
    h('button', { type: 'button', class: 'todo-notice__action', onclick: () => onGoToMonth?.(elsewhere.dataset.month) }, 'View'),
  );

  const newTaskBtn = h('button', { type: 'button', class: 'todo-btn todo-btn--primary', 'data-testid': 'todo-new-task', onclick: () => onCreate() }, icon('plus', 16), h('span', {}, 'New task'));

  // Slot for the category chart (mounted by the app between the cards and the list).
  const chartHost = h('div', { class: 'todo-dashboard__chart' });

  const root = h(
    'div',
    { class: 'todo-dashboard', 'data-testid': 'todo-dashboard' },
    h('section', { class: 'todo-summary', 'aria-label': 'Task summary' }, cards.open.root, cards.dueToday.root, cards.overdue.root, cards.completed.root),
    chartHost,
    h(
      'section',
      { class: 'todo-panel', 'data-testid': 'todo-tasks' },
      h('div', { class: 'todo-panel__head' }, h('div', {}, h('h2', { class: 'todo-panel__title' }, 'Your tasks'), subtitle), newTaskBtn),
      h('div', { class: 'todo-filters' }, statusGroup, categoryRow),
      elsewhere,
      list,
      empty,
    ),
  );
  container.append(root);

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  function renderTask(t, today, locale) {
    const cat = getCategory(t.category);
    const due = t.completed ? null : describeDue(t.endDate, today);
    const status = t.completed ? 'completed' : due.status;
    const checkboxId = `todo-done-${t.id}`;
    return h(
      'li',
      { class: `todo-item todo-item--${status}${t.completed ? ' is-completed' : ''}`, 'data-id': t.id, 'data-status': status },
      h(
        'div',
        { class: 'todo-item__check' },
        h('input', {
          type: 'checkbox',
          id: checkboxId,
          class: 'todo-item__checkbox',
          checked: t.completed,
          'aria-label': `Mark "${t.name}" as ${t.completed ? 'open' : 'completed'}`,
          onchange: () => onToggle(t.id),
        }),
        h('label', { for: checkboxId, class: 'todo-item__checkmark', 'aria-hidden': 'true' }, icon('check', 14)),
      ),
      h(
        'div',
        { class: 'todo-item__body' },
        h('p', { class: 'todo-item__name' }, t.name),
        t.description ? h('p', { class: 'todo-item__desc' }, t.description) : null,
        h(
          'div',
          { class: 'todo-item__meta' },
          h(
            'span',
            { class: 'todo-category-pill', style: { '--cat-color': cat?.color || '#9ca3af' } },
            icon(cat?.icon || 'circle', 13),
            cat?.label || 'Uncategorised',
          ),
          h('span', { class: 'todo-item__date' }, icon('calendar', 13), h('time', { datetime: t.endDate }, formatDay(t.endDate, locale))),
          h('span', { class: `todo-badge todo-badge--${status}` }, t.completed ? 'Completed' : due.label),
        ),
      ),
      h(
        'div',
        { class: 'todo-item__actions' },
        h('button', { type: 'button', class: 'todo-icon-btn todo-icon-btn--danger', 'aria-label': `Delete "${t.name}"`, onclick: () => onDelete(t.id) }, icon('trash', 16)),
      ),
    );
  }

  return {
    root,
    chartHost,
    /**
     * @param {{tasks: object[], summary: object, filter: {status: string, category: string|null},
     *          month: string, today: string, locale?: string, hasAnyTasks: boolean,
     *          overdueElsewhere?: object[]}} props
     *   `tasks` and `summary` are already scoped to `month`; `hasAnyTasks` says
     *   whether that month has any task at all (before filters).
     */
    update({ tasks, summary, filter, month, today, locale = 'en-US', hasAnyTasks, overdueElsewhere = [] }) {
      cards.open.value.textContent = String(summary.open);
      cards.open.meta.textContent = `of ${plural(summary.total, 'task')} in ${monthLabel(month)}`;
      cards.dueToday.value.textContent = String(summary.dueToday);
      cards.dueToday.meta.textContent = formatDay(today, locale);
      cards.overdue.value.textContent = String(summary.overdue);
      cards.overdue.meta.textContent = summary.overdue ? 'Needs attention' : 'Nothing overdue';
      cards.overdue.root.classList.toggle('is-alert', summary.overdue > 0);
      cards.completed.value.textContent = String(summary.completed);
      cards.completed.meta.textContent = summary.total ? `${Math.round((summary.completed / summary.total) * 100)}% done` : 'Nothing yet';

      statusInputs.forEach((i) => (i.checked = i.value === filter.status));
      for (const c of categoryChips) {
        const active = (c.dataset.category || null) === (filter.category || null);
        c.setAttribute('aria-pressed', active ? 'true' : 'false');
        c.classList.toggle('is-active', active);
      }

      subtitle.textContent = `${monthLabel(month)} · ${plural(tasks.length, 'task')}` + (filter.status !== 'all' || filter.category ? ' matching your filters' : '');

      if (overdueElsewhere.length) {
        const latest = overdueElsewhere.map((t) => t.endDate).sort().at(-1).slice(0, 7);
        elsewhere.dataset.month = latest;
        elsewhereText.textContent = `${plural(overdueElsewhere.length, 'overdue task')} in other months`;
        elsewhere.hidden = false;
      } else {
        elsewhere.hidden = true;
      }

      if (!tasks.length) {
        list.hidden = true;
        empty.hidden = false;
        replaceChildren(
          empty,
          h('p', { class: 'todo-empty__title' }, hasAnyTasks ? 'No tasks match these filters.' : `No tasks due in ${monthLabel(month)}.`),
          hasAnyTasks
            ? h('button', { type: 'button', class: 'todo-btn todo-btn--ghost', onclick: () => onFilter({ status: 'all', category: null }) }, 'Clear filters')
            : h('button', { type: 'button', class: 'todo-btn todo-btn--primary', onclick: () => onCreate() }, icon('plus', 16), h('span', {}, 'Create a task')),
        );
        replaceChildren(list);
        return;
      }
      list.hidden = false;
      empty.hidden = true;
      replaceChildren(list, ...tasks.map((t) => renderTask(t, today, locale)));
    },
  };
}
