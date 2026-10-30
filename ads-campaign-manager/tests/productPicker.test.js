import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCTS, PRODUCT_CATEGORIES, getProduct, searchProducts } from '../src/data/products.js';
import { PAGE_SIZE, createProductPicker, initials } from '../src/ui/productPicker.js';

let host;
let onConfirm;
let picker;
const q = (sel) => host.querySelector(sel);
const items = () => [...host.querySelectorAll('.ads-product')];
const check = (id, on = true) => {
  const box = q(`#ads-pick-${id}`);
  box.checked = on;
  box.dispatchEvent(new Event('change', { bubbles: true }));
};
const search = (text) => {
  q('[data-testid=ads-product-search]').value = text;
  q('[data-testid=ads-product-search]').dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  onConfirm = vi.fn();
  picker = createProductPicker(host, { onConfirm });
});
afterEach(() => host.remove());

describe('catalogue', () => {
  it('has unique ids, valid prices and the declared categories', () => {
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    expect(PRODUCTS.every((p) => Number.isInteger(p.price) && p.price > 0 && PRODUCT_CATEGORIES.includes(p.category))).toBe(true);
    expect(getProduct('SKU-1001').name).toBe('Wireless Noise-Cancelling Headphones');
    expect(getProduct('nope')).toBeNull();
  });

  it('searches by name, SKU or category, optionally within a category', () => {
    expect(searchProducts('headphones').map((p) => p.id)).toEqual(['SKU-1001']);
    expect(searchProducts('sku-20')).toHaveLength(7);
    expect(searchProducts('toys').every((p) => p.category === 'Toys')).toBe(true);
    expect(searchProducts('', { category: 'Books' })).toHaveLength(3);
    expect(searchProducts('zzz')).toEqual([]);
    expect(searchProducts('')).toHaveLength(PRODUCTS.length);
  });

  it('initials takes the first letters of the first two words', () => {
    expect(initials('Wireless Noise-Cancelling Headphones')).toBe('WN');
    expect(initials('4K Streaming')).toBe('4S');
    expect(initials('Solo')).toBe('S');
    expect(initials('')).toBe('');
  });
});

describe('product picker dialog', () => {
  it('opens with the current products ticked and lists the first page of the catalogue', () => {
    picker.open([{ id: 'SKU-1001', name: 'x' }]);
    expect(q('dialog').hasAttribute('open')).toBe(true);
    expect(PAGE_SIZE).toBe(5);
    expect(items()).toHaveLength(PAGE_SIZE);
    expect(items().map((li) => li.dataset.productId)).toEqual(PRODUCTS.slice(0, PAGE_SIZE).map((p) => p.id));
    expect(q('.ads-pager__summary').textContent).toBe(`Showing 1–5 of ${PRODUCTS.length} products`);
    expect(q('.ads-pager__size').value).toBe('5');
    expect(q('#ads-pick-SKU-1001').checked).toBe(true);
    expect(q('#ads-pick-SKU-1002').checked).toBe(false);
    expect(q('[data-testid=ads-picker-count]').textContent).toBe('1 selected');
    expect(q('[data-testid=ads-picker-confirm]').textContent).toContain('Add 1 product');
    expect(document.activeElement).toBe(q('[data-testid=ads-product-search]'));
  });

  it('search and category chips narrow the list; the selection survives filtering', () => {
    picker.open();
    search('bottle');
    expect(items().map((li) => li.dataset.productId)).toEqual(['SKU-2001']);
    check('SKU-2001');
    search('');
    expect(items()).toHaveLength(PAGE_SIZE);
    expect(picker.page).toBe(1);
    q('.ads-pager__controls [aria-label="Previous page"]').nextElementSibling.querySelector('[aria-label="Page 2"]').click();
    expect(picker.page).toBe(2);
    expect(q('#ads-pick-SKU-2001')).toBeNull(); // on page 1
    q('[aria-label="Page 1"]').click();
    expect(q('#ads-pick-SKU-2001').checked).toBe(true);
    q('[aria-label="Page 2"]').click();
    q('.ads-chip[data-category="Beauty"]').click();
    expect(picker.page).toBe(1); // category change resets the page
    expect(items().every((li) => li.dataset.productId.startsWith('SKU-3'))).toBe(true);
    expect(q('.ads-chip[data-category="Beauty"]').getAttribute('aria-pressed')).toBe('true');
    search('zzz');
    expect(items()).toHaveLength(0);
    expect(q('.ads-empty').hidden).toBe(false);
    expect(q('.ads-product-picker__bar .ads-btn').disabled).toBe(true);
    expect(picker.selected.map((p) => p.id)).toEqual(['SKU-2001']);
  });

  it('select all shown toggles the visible products', () => {
    picker.open();
    q('.ads-chip[data-category="Books"]').click();
    const btn = q('.ads-product-picker__bar .ads-btn');
    expect(btn.textContent).toBe('Select all shown');
    btn.click();
    expect(picker.selected.map((p) => p.id)).toEqual(['SKU-8001', 'SKU-8002', 'SKU-8003']);
    expect(btn.textContent).toBe('Clear shown');
    btn.click();
    expect(picker.selected).toEqual([]);
  });

  it('confirm hands back product snapshots (no colour) and closes; cancel keeps the form untouched', () => {
    picker.open();
    check('SKU-1001');
    check('SKU-1004');
    check('SKU-1001', false);
    q('[data-testid=ads-picker-confirm]').click();
    expect(onConfirm).toHaveBeenCalledWith([{ id: 'SKU-1004', sku: 'SKU-1004', name: 'Smart Fitness Watch', category: 'Electronics', price: 19999 }]);
    expect(q('dialog').hasAttribute('open')).toBe(false);

    picker.open();
    check('SKU-1002');
    q('.ads-dialog__actions .ads-btn--ghost').click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(q('dialog').hasAttribute('open')).toBe(false);
  });

  it('edge: reopening resets the search and category but reflects the given products', () => {
    picker.open();
    search('kettle');
    q('.ads-chip[data-category="Toys"]').click();
    picker.close();
    picker.open([{ id: 'SKU-5001', name: 'x' }]);
    expect(q('[data-testid=ads-product-search]').value).toBe('');
    expect(items()).toHaveLength(PAGE_SIZE);
    expect(picker.page).toBe(1);
    expect(q('.ads-chip[data-category=""]').getAttribute('aria-pressed')).toBe('true');
    expect(picker.selected.map((p) => p.id)).toEqual(['SKU-5001']);
  });

  it('pages through the catalogue 5 at a time; "select all shown" applies to the current page', () => {
    picker.open();
    const pages = Math.ceil(PRODUCTS.length / PAGE_SIZE); // 8
    expect([...host.querySelectorAll('.ads-pager__page')].map((b) => b.textContent)).toEqual(['1', '2', '3', '4', String(pages)]); // collapsed with an ellipsis
    expect(q('[aria-label="Previous page"]').disabled).toBe(true);
    q('[aria-label="Next page"]').click();
    expect(picker.page).toBe(2);
    expect(items().map((li) => li.dataset.productId)).toEqual(PRODUCTS.slice(PAGE_SIZE, 2 * PAGE_SIZE).map((p) => p.id));
    expect(q('.ads-pager__summary').textContent).toBe(`Showing 6–10 of ${PRODUCTS.length} products`);
    q('.ads-product-picker__bar .ads-btn').click(); // select all shown
    expect(picker.selected.map((p) => p.id)).toEqual(PRODUCTS.slice(PAGE_SIZE, 2 * PAGE_SIZE).map((p) => p.id));
    q(`[aria-label="Page ${pages}"]`).click();
    expect(picker.page).toBe(pages);
    expect(q('[aria-label="Next page"]').disabled).toBe(true);
    expect(items().length).toBe(PRODUCTS.length - (pages - 1) * PAGE_SIZE);
    // A search that fits on the smallest page hides the pager.
    search('SKU-80'); // the three books
    expect(q('.ads-pager').hidden).toBe(true);
    expect(picker.page).toBe(1);
  });

  it('rows per page can be changed to 10 or 20, keeping the first visible product', () => {
    picker.open();
    q('[aria-label="Page 3"]').click(); // products 11–15
    const select = q('.ads-pager__size');
    select.value = '10';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(picker.pageSize).toBe(10);
    expect(picker.page).toBe(2); // 11–20
    expect(items()).toHaveLength(10);
    expect(items()[0].dataset.productId).toBe(PRODUCTS[10].id);
    select.value = '20';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(items()).toHaveLength(20);
    expect(picker.page).toBe(1);
    expect(q('.ads-pager__summary').textContent).toBe(`Showing 1–20 of ${PRODUCTS.length} products`);
  });

  it('keeps search and filters outside the scrolling area so they stay visible', () => {
    picker.open();
    const toolbar = q('.ads-dialog__toolbar');
    expect(toolbar.contains(q('[data-testid=ads-product-search]'))).toBe(true);
    expect(toolbar.contains(q('.ads-chip-row'))).toBe(true);
    expect(q('.ads-dialog__body').contains(q('.ads-product-list'))).toBe(true);
    expect(q('.ads-dialog__body').contains(q('[data-testid=ads-product-search]'))).toBe(false);
  });

  it('prices follow the display currency, re-rendering while open', () => {
    picker.open();
    expect(q('.ads-product__price').textContent).toBe('$149.99');
    picker.update({ currency: 'EUR' });
    expect(q('.ads-product__price').textContent).toBe('€149.99');
    picker.close();
    picker.update({ currency: 'GBP' }); // closed: applied on next open
    picker.open();
    expect(q('.ads-product__price').textContent).toBe('£149.99');
    picker.update({}); // no-op
    expect(q('.ads-product__price').textContent).toBe('£149.99');
  });

  it('clicking the backdrop closes the dialog', () => {
    picker.open();
    q('dialog').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(q('dialog').hasAttribute('open')).toBe(false);
  });
});
