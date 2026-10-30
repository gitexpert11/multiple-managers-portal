/**
 * Client-side pagination helpers, shared by the campaign grid, the product
 * picker and the selected-products grid.
 */

/** Rows-per-page choices offered by every grid; the first is the default. */
export const PAGE_SIZE_OPTIONS = [5, 10, 20];
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

export function isPageSize(size) {
  return PAGE_SIZE_OPTIONS.includes(Number(size));
}

/** Page (1-based) that keeps the first row of the current page visible after a page-size change. */
export function pageAfterResize(page, oldSize, newSize) {
  const first = (clampPage(page, Infinity) - 1) * (oldSize > 0 ? oldSize : DEFAULT_PAGE_SIZE);
  return pageOfIndex(first, newSize > 0 ? newSize : DEFAULT_PAGE_SIZE);
}

/**
 * Slice `items` for one page. The page is clamped into range, so callers can
 * keep a stale page number after items were removed.
 * @returns {{items: any[], page: number, pageCount: number, pageSize: number, total: number, from: number, to: number}}
 *   `from`/`to` are 1-based positions of the first and last shown item (0 when empty).
 */
export function paginate(items, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = clampPage(page, pageCount);
  const start = (current - 1) * size;
  const slice = list.slice(start, start + size);
  return {
    items: slice,
    page: current,
    pageCount,
    pageSize: size,
    total,
    from: total ? start + 1 : 0,
    to: total ? start + slice.length : 0,
  };
}

export function clampPage(page, pageCount) {
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), Math.max(1, pageCount));
}

/** The page (1-based) on which the item at `index` appears. */
export function pageOfIndex(index, pageSize = DEFAULT_PAGE_SIZE) {
  if (!Number.isInteger(index) || index < 0) return 1;
  return Math.floor(index / pageSize) + 1;
}

/**
 * Page numbers to offer as buttons, with `null` for an ellipsis, e.g.
 * [1, null, 4, 5, 6, null, 10]. Always includes the first, last and current
 * page plus `siblings` pages either side of the current one.
 */
export function pageNumbers(page, pageCount, siblings = 1) {
  if (pageCount <= 1) return [1];
  const max = 2 * siblings + 5; // first, last, current, siblings, two ellipses
  if (pageCount <= max) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const current = clampPage(page, pageCount);
  let start = Math.max(2, current - siblings);
  let end = Math.min(pageCount - 1, current + siblings);
  // Keep the window the same width near the edges.
  const width = 2 * siblings + 1;
  if (end - start + 1 < width) {
    if (start === 2) end = Math.min(pageCount - 1, start + width - 1);
    else start = Math.max(2, end - width + 1);
  }
  const out = [1];
  if (start > 2) out.push(null);
  for (let p = start; p <= end; p++) out.push(p);
  if (end < pageCount - 1) out.push(null);
  out.push(pageCount);
  return out;
}
