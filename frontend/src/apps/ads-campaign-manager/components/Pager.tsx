import { Icon } from '@shared/ui/Icon';
import { PAGE_SIZE_OPTIONS, pageNumbers } from '../lib/pagination';

interface PagerProps {
  page: number;
  pageCount: number;
  pageSize?: number;
  total: number;
  from: number;
  to: number;
  noun?: string;
  label?: string;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}

/**
 * Pagination control: a rows-per-page select (5 / 10 / 20), "Showing 1–5 of
 * 96 campaigns", previous / next and page-number buttons (with ellipses for
 * long ranges). Hidden when everything fits on the smallest page.
 */
export function Pager({ page, pageCount, pageSize, total, from, to, noun = 'items', label = 'Pagination', onPage, onPageSize }: PagerProps) {
  // Nothing to page and nothing to resize: stay out of the way.
  const hidden = total === 0 || (pageCount <= 1 && total <= (PAGE_SIZE_OPTIONS[0] as number));
  const emit = (next: number) => {
    if (next < 1 || next > pageCount || next === page) return;
    onPage(next);
  };
  return (
    <nav className="ads-pager" aria-label={label} hidden={hidden}>
      <div className="ads-pager__left">
        <label className="ads-pager__size-wrap" hidden={!onPageSize}>
          <span>Rows per page</span>
          <select className="ads-pager__size" aria-label="Rows per page" value={String(pageSize ?? PAGE_SIZE_OPTIONS[0])} onChange={(e) => onPageSize?.(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <p className="ads-pager__summary" aria-live="polite">
          {total ? `Showing ${from}–${to} of ${total} ${noun}` : ''}
        </p>
      </div>
      <div className="ads-pager__controls">
        <button type="button" className="ads-pager__btn" aria-label="Previous page" disabled={page <= 1} onClick={() => emit(page - 1)}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <div className="ads-pager__pages">
          {pageNumbers(page, pageCount).map((n, i) =>
            n == null ? (
              <span key={`gap-${i}`} className="ads-pager__gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button key={n} type="button" className={`ads-pager__page${n === page ? ' is-current' : ''}`} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`} onClick={() => emit(n)}>
                {n}
              </button>
            ),
          )}
        </div>
        <button type="button" className="ads-pager__btn" aria-label="Next page" disabled={page >= pageCount} onClick={() => emit(page + 1)}>
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </nav>
  );
}
