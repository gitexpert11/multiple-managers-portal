import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, clampPage, isPageSize, pageAfterResize, pageNumbers, pageOfIndex, paginate } from '../src/lib/pagination.js';

const list = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('paginate', () => {
  it('slices 5 items per page by default (options 5 / 10 / 20) and reports positions', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([5, 10, 20]);
    expect(DEFAULT_PAGE_SIZE).toBe(5);
    expect(isPageSize(10)).toBe(true);
    expect(isPageSize('20')).toBe(true);
    expect(isPageSize(7)).toBe(false);
    const p = paginate(list(25), 1);
    expect(p).toMatchObject({ page: 1, pageCount: 5, pageSize: 5, total: 25, from: 1, to: 5 });
    expect(p.items).toEqual(list(5));
    const last = paginate(list(23), 5);
    expect(last.items).toEqual([21, 22, 23]);
    expect(last).toMatchObject({ from: 21, to: 23 });
    expect(paginate(list(25), 2, 10).items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('edge: clamps out-of-range pages and handles empty lists', () => {
    expect(paginate(list(25), 99).page).toBe(5);
    expect(paginate(list(25), 0).page).toBe(1);
    expect(paginate(list(25), -4).page).toBe(1);
    expect(paginate(list(25), 'x').page).toBe(1);
    expect(paginate(list(25), 2.7).page).toBe(2);
    expect(paginate([], 3)).toMatchObject({ items: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
    expect(paginate(null, 1).items).toEqual([]);
    expect(paginate(list(5), 1).pageCount).toBe(1);
    expect(paginate(list(6), 1).pageCount).toBe(2);
  });

  it('negative: a bad page size falls back to the default', () => {
    expect(paginate(list(30), 1, 0).pageSize).toBe(5);
    expect(paginate(list(30), 1, -5).pageSize).toBe(5);
    expect(paginate(list(30), 1, 2.5).pageSize).toBe(5);
    expect(paginate(list(30), 1, 20).items).toEqual(list(20));
  });

  it('clampPage and pageOfIndex', () => {
    expect(clampPage(5, 3)).toBe(3);
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(2, 0)).toBe(1);
    expect(pageOfIndex(0)).toBe(1);
    expect(pageOfIndex(4)).toBe(1);
    expect(pageOfIndex(5)).toBe(2);
    expect(pageOfIndex(95)).toBe(20);
    expect(pageOfIndex(95, 10)).toBe(10);
    expect(pageOfIndex(7, 5)).toBe(2);
    expect(pageOfIndex(-1)).toBe(1);
    expect(pageOfIndex('x')).toBe(1);
  });
});

describe('pageAfterResize', () => {
  it('keeps the first row of the current page visible', () => {
    expect(pageAfterResize(1, 5, 20)).toBe(1);
    expect(pageAfterResize(3, 5, 10)).toBe(2); // rows 11–15 -> page 2 of 10
    expect(pageAfterResize(2, 10, 5)).toBe(3); // rows 11–20 -> page 3 of 5
    expect(pageAfterResize(4, 5, 20)).toBe(1); // rows 16–20 -> page 1 of 20
    expect(pageAfterResize(2, 20, 5)).toBe(5); // rows 21–40 -> page 5 of 5
    expect(pageAfterResize('x', 0, 0)).toBe(1);
  });
});

describe('pageNumbers', () => {
  it('lists every page when there are few', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(1, 0)).toEqual([1]);
    expect(pageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('collapses long ranges around the current page with ellipses', () => {
    expect(pageNumbers(1, 10)).toEqual([1, 2, 3, 4, null, 10]);
    expect(pageNumbers(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageNumbers(10, 10)).toEqual([1, null, 7, 8, 9, 10]);
    expect(pageNumbers(2, 10)).toEqual([1, 2, 3, 4, null, 10]);
    expect(pageNumbers(9, 10)).toEqual([1, null, 7, 8, 9, 10]);
    expect(pageNumbers(50, 100, 2)).toEqual([1, null, 48, 49, 50, 51, 52, null, 100]);
    expect(pageNumbers(99, 10)).toEqual([1, null, 7, 8, 9, 10]); // clamped
  });
});
