import { PAGE_SIZE_OPTIONS, pageNumbers } from '../lib/pagination.js';
import { h, icon, replaceChildren } from './dom.js';

/**
 * Pagination control: a rows-per-page select (5 / 10 / 20), "Showing 1–5 of
 * 96 campaigns", previous / next and page-number buttons (with ellipses for
 * long ranges). Hidden when everything fits on the smallest page. Prop-driven:
 * the parent owns the page and the page size.
 *
 * @param {{onPage: (page: number) => void, onPageSize?: (size: number) => void, label?: string}} opts
 */
export function createPager(container, { onPage, onPageSize, label = 'Pagination' }) {
  const summary = h('p', { class: 'ads-pager__summary', 'aria-live': 'polite' });
  const prevBtn = h('button', { type: 'button', class: 'ads-pager__btn', 'aria-label': 'Previous page', onclick: () => emit(current - 1) }, icon('chevronLeft', 16));
  const nextBtn = h('button', { type: 'button', class: 'ads-pager__btn', 'aria-label': 'Next page', onclick: () => emit(current + 1) }, icon('chevronRight', 16));
  const pages = h('div', { class: 'ads-pager__pages' });
  const sizeSelect = h(
    'select',
    { class: 'ads-pager__size', 'aria-label': 'Rows per page', onchange: () => onPageSize?.(Number(sizeSelect.value)) },
    ...PAGE_SIZE_OPTIONS.map((n) => h('option', { value: String(n) }, String(n))),
  );
  const sizeWrap = h('label', { class: 'ads-pager__size-wrap', hidden: !onPageSize }, h('span', {}, 'Rows per page'), sizeSelect);
  const root = h('nav', { class: 'ads-pager', 'aria-label': label, hidden: true }, h('div', { class: 'ads-pager__left' }, sizeWrap, summary), h('div', { class: 'ads-pager__controls' }, prevBtn, pages, nextBtn));
  container.append(root);

  let current = 1;
  let count = 1;

  function emit(page) {
    if (page < 1 || page > count || page === current) return;
    onPage(page);
  }

  return {
    root,
    /** @param {{page: number, pageCount: number, pageSize?: number, total: number, from: number, to: number, noun?: string}} props */
    update({ page, pageCount, pageSize, total, from, to, noun = 'items' }) {
      current = page;
      count = pageCount;
      if (pageSize) sizeSelect.value = String(pageSize);
      // Nothing to page and nothing to resize: stay out of the way.
      root.hidden = total === 0 || (pageCount <= 1 && total <= PAGE_SIZE_OPTIONS[0]);
      summary.textContent = total ? `Showing ${from}–${to} of ${total} ${noun}` : '';
      prevBtn.disabled = page <= 1;
      nextBtn.disabled = page >= pageCount;
      replaceChildren(
        pages,
        ...pageNumbers(page, pageCount).map((n) =>
          n == null
            ? h('span', { class: 'ads-pager__gap', 'aria-hidden': 'true' }, '…')
            : h('button', { type: 'button', class: `ads-pager__page${n === page ? ' is-current' : ''}`, 'aria-current': n === page ? 'page' : null, 'aria-label': `Page ${n}`, onclick: () => emit(n) }, String(n)),
        ),
      );
    },
  };
}
