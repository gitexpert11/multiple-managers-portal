import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPager } from '../src/ui/pager.js';

let host;
let onPage;
let onPageSize;
let pager;
const q = (sel) => host.querySelector(sel);
const pageButtons = () => [...host.querySelectorAll('.ads-pager__page')].map((b) => b.textContent);

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  onPage = vi.fn();
  onPageSize = vi.fn();
  pager = createPager(host, { onPage, onPageSize, label: 'Test pages' });
});
afterEach(() => host.remove());

describe('pager', () => {
  it('is hidden when everything fits on the smallest page and shows the summary + buttons otherwise', () => {
    pager.update({ page: 1, pageCount: 1, total: 4, from: 1, to: 4, noun: 'things' });
    expect(pager.root.hidden).toBe(true);
    // One page of 20, but the user could still choose 5 or 10: keep the control.
    pager.update({ page: 1, pageCount: 1, pageSize: 20, total: 12, from: 1, to: 12, noun: 'things' });
    expect(pager.root.hidden).toBe(false);
    expect(pageButtons()).toEqual(['1']);
    pager.update({ page: 2, pageCount: 3, pageSize: 10, total: 25, from: 11, to: 20, noun: 'things' });
    expect(pager.root.hidden).toBe(false);
    expect(pager.root.getAttribute('aria-label')).toBe('Test pages');
    expect(q('.ads-pager__summary').textContent).toBe('Showing 11–20 of 25 things');
    expect(pageButtons()).toEqual(['1', '2', '3']);
    expect(q('.ads-pager__page.is-current').textContent).toBe('2');
    expect(q('.ads-pager__page.is-current').getAttribute('aria-current')).toBe('page');
    expect(q('[aria-label="Previous page"]').disabled).toBe(false);
    expect(q('[aria-label="Next page"]').disabled).toBe(false);
  });

  it('emits page changes from the arrows and the numbers, never out of range or to the same page', () => {
    pager.update({ page: 1, pageCount: 3, total: 25, from: 1, to: 10 });
    expect(q('[aria-label="Previous page"]').disabled).toBe(true);
    q('[aria-label="Next page"]').click();
    expect(onPage).toHaveBeenCalledWith(2);
    q('[aria-label="Page 3"]').click();
    expect(onPage).toHaveBeenCalledWith(3);
    q('[aria-label="Page 1"]').click(); // current page
    expect(onPage).toHaveBeenCalledTimes(2);
    pager.update({ page: 3, pageCount: 3, total: 25, from: 21, to: 25 });
    expect(q('[aria-label="Next page"]').disabled).toBe(true);
    q('[aria-label="Previous page"]').click();
    expect(onPage).toHaveBeenLastCalledWith(2);
  });

  it('renders ellipses for long ranges', () => {
    pager.update({ page: 5, pageCount: 10, total: 96, from: 41, to: 50, noun: 'campaigns' });
    expect(pageButtons()).toEqual(['1', '4', '5', '6', '10']);
    expect(host.querySelectorAll('.ads-pager__gap')).toHaveLength(2);
    expect(q('.ads-pager__summary').textContent).toBe('Showing 41–50 of 96 campaigns');
  });

  it('offers rows-per-page choices and reports a change as a number', () => {
    pager.update({ page: 1, pageCount: 5, pageSize: 5, total: 25, from: 1, to: 5 });
    const select = q('.ads-pager__size');
    expect([...select.options].map((o) => o.value)).toEqual(['5', '10', '20']);
    expect(select.value).toBe('5');
    select.value = '20';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onPageSize).toHaveBeenCalledWith(20);
    pager.update({ page: 1, pageCount: 2, pageSize: 20, total: 25, from: 1, to: 20 });
    expect(select.value).toBe('20');
  });

  it('hides the rows-per-page control when the parent does not support it', () => {
    const host2 = document.createElement('div');
    document.body.append(host2);
    const p2 = createPager(host2, { onPage });
    p2.update({ page: 1, pageCount: 3, total: 25, from: 1, to: 10 });
    expect(host2.querySelector('.ads-pager__size-wrap').hidden).toBe(true);
    expect(host2.querySelector('.ads-pager').getAttribute('aria-label')).toBe('Pagination');
    host2.remove();
  });

  it('edge: an empty result hides the pager and clears the summary', () => {
    pager.update({ page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
    expect(pager.root.hidden).toBe(true);
    expect(q('.ads-pager__summary').textContent).toBe('');
  });
});
