import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_PAGE_SIZE, createCampaignForm } from '../src/ui/campaignForm.js';

let host;
let handlers;
let form;
const q = (sel) => host.querySelector(sel);
const setValue = (sel, value) => {
  const el = q(sel);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const submit = () => q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const product = { id: 'SKU-1001', sku: 'SKU-1001', name: 'Wireless Noise-Cancelling Headphones', category: 'Electronics', price: 14999 };

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  handlers = { onSubmit: vi.fn(() => true), onCancel: vi.fn(), onAddProducts: vi.fn() };
  form = createCampaignForm(host, handlers);
});
afterEach(() => host.remove());

describe('create campaign form', () => {
  it('has the requested fields with sensible defaults: auto bid selected, manual disabled', () => {
    expect(q('#campaign-name')).not.toBeNull();
    expect(q('#campaign-budget')).not.toBeNull();
    expect(q('#campaign-type-sponsored_products').checked).toBe(true);
    expect([...host.querySelectorAll('input[name=campaign-type]')].map((i) => i.value)).toEqual(['sponsored_products', 'sponsored_brands', 'sponsored_display']);
    expect(q('[data-testid=ads-add-products]').textContent).toContain('Add products');
    expect(q('#campaign-bid-auto').checked).toBe(true);
    expect(q('#campaign-bid-manual').disabled).toBe(true);
    expect(q('label[for=campaign-bid-manual]').textContent).toContain('Coming soon');
    expect(q('label[for=campaign-bid-auto]').textContent).toContain('Selected');
    expect(q('[data-testid=ads-campaign-submit]').textContent).toContain('Submit');
    expect(q('.ads-product-grid').hidden).toBe(true);
    expect(q('.ads-products-empty').hidden).toBe(false);
  });

  it('the Add products button asks the parent to open the picker with the current products', () => {
    q('[data-testid=ads-add-products]').click();
    expect(handlers.onAddProducts).toHaveBeenCalledWith([]);
    form.setProducts([product]);
    q('[data-testid=ads-add-products]').click();
    expect(handlers.onAddProducts).toHaveBeenLastCalledWith([product]);
  });

  it('added products appear in the product grid and can be removed', () => {
    form.setProducts([product, { id: 'SKU-2001', sku: 'SKU-2001', name: 'Bottle', category: 'Home & Kitchen', price: 2499 }]);
    expect(q('.ads-product-grid').hidden).toBe(false);
    expect(q('.ads-products-empty').hidden).toBe(true);
    const rows = [...host.querySelectorAll('.ads-product-grid tbody tr')];
    expect(rows).toHaveLength(2);
    expect([...rows[0].querySelectorAll('td')].map((td) => td.textContent.trim()).slice(0, 4)).toEqual(['WNWireless Noise-Cancelling Headphones', 'SKU-1001', 'Electronics', '$149.99']);
    expect(q('#campaign-products .ads-field__hint').textContent).toBe('2 products selected');
    rows[0].querySelector('.ads-icon-btn').click();
    expect(form.products.map((p) => p.id)).toEqual(['SKU-2001']);
    expect(q('#campaign-products .ads-field__hint').textContent).toBe('1 product selected');
  });

  it('pages the selected products 5 at a time by default and clamps the page when products are removed', () => {
    expect(PRODUCT_PAGE_SIZE).toBe(5);
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `P${i}`, sku: `P${i}`, name: `Product ${i}`, category: 'Cat', price: 100 }));
    form.setProducts(many);
    const rows = () => [...host.querySelectorAll('.ads-product-grid tbody tr')].map((tr) => tr.dataset.productId);
    expect(rows()).toHaveLength(5);
    expect(q('#campaign-products .ads-pager__summary').textContent).toBe('Showing 1–5 of 7 products');
    expect(q('#campaign-products .ads-field__hint').textContent).toBe('7 products selected');
    q('#campaign-products [aria-label="Page 2"]').click();
    expect(form.productPage).toBe(2);
    expect(rows()).toEqual(['P5', 'P6']);
    // Removing the last items on page 2 falls back to page 1.
    host.querySelector('.ads-product-grid tbody tr .ads-icon-btn').click();
    expect(rows()).toEqual(['P6']);
    host.querySelector('.ads-product-grid tbody tr .ads-icon-btn').click();
    expect(form.productPage).toBe(1);
    expect(rows()).toHaveLength(5);
    expect(q('#campaign-products .ads-pager').hidden).toBe(true);
    expect(form.products).toHaveLength(5);
  });

  it('the selected-products grid offers 5 / 10 / 20 rows per page and keeps the first visible row when resizing', () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ id: `P${i}`, sku: `P${i}`, name: `Product ${i}`, category: 'Cat', price: 100 }));
    form.setProducts(many);
    const rows = () => [...host.querySelectorAll('.ads-product-grid tbody tr')].map((tr) => tr.dataset.productId);
    const select = q('#campaign-products .ads-pager__size');
    expect(select.value).toBe('5');
    q('#campaign-products [aria-label="Page 3"]').click(); // P10–P14
    select.value = '10';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(form.productPageSize).toBe(10);
    expect(form.productPage).toBe(2); // P10–P19
    expect(rows()[0]).toBe('P10');
    expect(rows()).toHaveLength(10);
    select.value = '20';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(rows()).toHaveLength(20);
    expect(form.productPage).toBe(1);
    select.value = '7'; // not an option: ignored
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(form.productPageSize).toBe(20);
  });

  it('follows the display currency: prefix, hint, validation messages and product prices', () => {
    expect(q('[data-testid=ads-create] .ads-money__prefix').textContent).toBe('$');
    form.update({ currency: 'GBP' });
    expect(q('[data-testid=ads-create] .ads-money__prefix').textContent).toBe('£');
    expect(q('#campaign-budget-hint').textContent).toBe('Spent per day at most. Minimum £1.00.');
    form.setProducts([product]);
    expect(q('.ads-product-grid tbody td.is-numeric').textContent).toBe('£149.99');
    setValue('#campaign-name', 'x');
    setValue('#campaign-budget', '0.5');
    submit();
    expect(q('#campaign-budget-error').textContent).toBe('Daily budget must be at least £1.00');
    form.update({ currency: 'CAD' });
    expect(q('[data-testid=ads-create] .ads-money__prefix').textContent).toBe('CA$');
    expect(q('#campaign-budget').classList.contains('ads-field__input--money-wide')).toBe(true);
    form.update({ currency: 'GBP' }); // same call twice is harmless
    form.update({});
    expect(q('[data-testid=ads-create] .ads-money__prefix').textContent).toBe('£');
  });

  it('end date is optional; when given it must be a valid date that is not in the past', () => {
    form.update({ today: '2025-03-15' });
    expect(q('#campaign-end-date').min).toBe('2025-03-15');
    setValue('#campaign-name', 'Spring');
    setValue('#campaign-budget', '25');
    form.setProducts([product]);
    const endInput = q('#campaign-end-date');
    endInput.value = '2025-03-10';
    endInput.dispatchEvent(new Event('change', { bubbles: true }));
    submit();
    expect(handlers.onSubmit).not.toHaveBeenCalled();
    expect(q('#campaign-end-date-error').textContent).toBe('End date cannot be in the past');
    expect(document.activeElement).toBe(endInput);
    endInput.value = '2025-04-01';
    endInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(q('#campaign-end-date-error').textContent).toBe('');
    submit();
    expect(handlers.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ endDate: '2025-04-01' }));
    expect(q('#campaign-end-date').value).toBe(''); // reset
  });

  it('negative: validates name, budget and products inline and focuses the first invalid field', () => {
    submit();
    expect(handlers.onSubmit).not.toHaveBeenCalled();
    expect(q('#campaign-name-error').textContent).toBe('Give the campaign a name');
    expect(q('#campaign-budget-error').textContent).toBe('Enter a daily budget');
    expect(q('#campaign-products-error').textContent).toBe('Add at least one product');
    expect(q('#campaign-name').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(q('#campaign-name'));

    setValue('#campaign-name', 'Spring');
    expect(q('#campaign-name-error').textContent).toBe(''); // clears while typing
    setValue('#campaign-budget', '0.50');
    submit();
    expect(q('#campaign-budget-error').textContent).toBe('Daily budget must be at least $1.00');
    expect(document.activeElement).toBe(q('#campaign-budget'));
    setValue('#campaign-budget', '5000000');
    submit();
    expect(q('#campaign-budget-error').textContent).toBe('Daily budget cannot exceed $1,000,000.00');
    setValue('#campaign-budget', 'abc');
    submit();
    expect(q('#campaign-budget-error').textContent).toBe('Enter a daily budget');
    setValue('#campaign-budget', '25');
    submit();
    expect(q('#campaign-budget-error').textContent).toBe('');
    expect(document.activeElement).toBe(q('[data-testid=ads-add-products]'));
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('submits the payload (budget in cents, product snapshots) and resets on success', () => {
    setValue('#campaign-name', '  Spring Sale  ');
    setValue('#campaign-budget', '45');
    q('#campaign-type-sponsored_brands').checked = true;
    form.setProducts([{ ...product, color: '#123456' }]);
    submit();
    expect(handlers.onSubmit).toHaveBeenCalledWith({ name: 'Spring Sale', dailyBudget: 4500, endDate: null, type: 'sponsored_brands', bidStrategy: 'auto', products: [product] });
    expect(q('#campaign-name').value).toBe('');
    expect(q('#campaign-budget').value).toBe('');
    expect(q('#campaign-type-sponsored_products').checked).toBe(true);
    expect(form.products).toEqual([]);
    expect(q('.ads-product-grid').hidden).toBe(true);
  });

  it('keeps the input when the parent rejects the submission', () => {
    handlers.onSubmit.mockReturnValue(false);
    setValue('#campaign-name', 'Keep me');
    setValue('#campaign-budget', '12.5');
    form.setProducts([product]);
    submit();
    expect(handlers.onSubmit).toHaveBeenCalled();
    expect(q('#campaign-name').value).toBe('Keep me');
    expect(form.products).toHaveLength(1);
  });

  it('normalises the budget on blur and cancel calls back', () => {
    setValue('#campaign-budget', '12.5');
    q('#campaign-budget').dispatchEvent(new Event('blur'));
    expect(q('#campaign-budget').value).toBe('12.50');
    setValue('#campaign-budget', 'xx');
    q('#campaign-budget').dispatchEvent(new Event('blur'));
    expect(q('#campaign-budget').value).toBe('xx');
    q('[data-testid=ads-campaign-cancel]').click();
    expect(handlers.onCancel).toHaveBeenCalled();
    form.focus();
    expect(document.activeElement).toBe(q('#campaign-name'));
  });
});

describe('edit campaign form', () => {
  const campaign = {
    id: 'cmp_1',
    name: 'Spring Sale',
    dailyBudget: 4500,
    type: 'sponsored_brands',
    bidStrategy: 'auto',
    status: 'active',
    startDate: '2025-03-01',
    endDate: '2025-06-30',
    products: [product],
    performance: [{ date: '2025-03-02', impressions: 1, clicks: 0, spend: 0, conversions: 0, sales: 0 }],
    createdAt: Date.UTC(2025, 2, 1, 12),
    updatedAt: Date.UTC(2025, 2, 10, 12),
  };
  let editForm;
  let editHandlers;
  const eq = (sel) => editForm.root.querySelector(sel);
  const eSet = (sel, value) => {
    const el = eq(sel);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const eSubmit = () => eq('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  beforeEach(() => {
    editHandlers = { onSubmit: vi.fn(() => true), onCancel: vi.fn(), onAddProducts: vi.fn() };
    editForm = createCampaignForm(host, { mode: 'edit', ...editHandlers });
  });

  it('negative: rejects an unknown mode', () => {
    expect(() => createCampaignForm(host, { mode: 'clone', ...editHandlers })).toThrow(/mode/);
  });

  it('uses its own element ids so it can coexist with the create form', () => {
    expect(eq('#edit-campaign-name')).not.toBeNull();
    expect(host.querySelectorAll('#campaign-name')).toHaveLength(1);
    expect(host.querySelectorAll('#edit-campaign-name')).toHaveLength(1);
    expect(eq('[data-testid=ads-edit-submit]').textContent).toContain('Save changes');
    expect(eq('.ads-panel__title').textContent).toBe('Edit campaign');
    expect(editForm.mode).toBe('edit');
  });

  it('the status switch offers Active, Paused and Archived; archiving from the edit page is a change', () => {
    editForm.setCampaign(campaign);
    expect([...editForm.root.querySelectorAll('input[name=edit-campaign-status]')].map((i) => i.value)).toEqual(['active', 'paused', 'archived']);
    const archived = eq('#edit-campaign-status-archived');
    archived.checked = true;
    archived.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editForm.isDirty()).toBe(true);
    eSubmit();
    expect(editHandlers.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }), campaign);
    // An archived campaign loads with Archived selected and is not dirty.
    editForm.setCampaign({ ...campaign, status: 'archived' });
    expect(eq('#edit-campaign-status-archived').checked).toBe(true);
    expect(editForm.isDirty()).toBe(false);
  });

  it('setCampaign prefills every field, locks the type and shows the facts', () => {
    editForm.setCampaign(campaign);
    expect(eq('#edit-campaign-name').value).toBe('Spring Sale');
    expect(eq('#edit-campaign-budget').value).toBe('45.00');
    expect(eq('#edit-campaign-type-sponsored_brands').checked).toBe(true);
    expect([...editForm.root.querySelectorAll('input[name=edit-campaign-type]')].every((i) => i.disabled)).toBe(true);
    expect(eq('#edit-campaign-type legend').textContent).toContain('Locked');
    expect(eq('#edit-campaign-status-active').checked).toBe(true);
    expect(eq('#edit-campaign-bid-auto').checked).toBe(true);
    expect(editForm.products.map((p) => p.id)).toEqual(['SKU-1001']);
    expect(editForm.productPage).toBe(1);
    expect(editForm.root.querySelectorAll('.ads-product-grid tbody tr')).toHaveLength(1);
    const facts = [...eq('[data-testid=ads-edit-facts]').querySelectorAll('dd')].map((d) => d.textContent);
    expect(facts).toEqual(['Sponsored Brands', 'Mar 1, 2025', 'Jun 30, 2025', '1', 'Mar 10, 2025']);
    expect(eq('#edit-campaign-end-date').value).toBe('2025-06-30');
    expect(eq('#edit-campaign-end-date').min).toBe('2025-03-01');
    expect(editForm.campaign).toBe(campaign);
    editForm.setCampaign({ ...campaign, endDate: null });
    expect([...eq('[data-testid=ads-edit-facts]').querySelectorAll('dd')].map((d) => d.textContent)[2]).toBe('No end date');
    expect(eq('#edit-campaign-end-date').value).toBe('');
  });

  it('changing or clearing the end date is an edit; it may not precede the start date', () => {
    editForm.setCampaign(campaign);
    const endInput = eq('#edit-campaign-end-date');
    endInput.value = '';
    endInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editForm.isDirty()).toBe(true);
    eSubmit();
    expect(editHandlers.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ endDate: null }), campaign);
    editForm.setCampaign(campaign);
    endInput.value = '2025-02-01';
    endInput.dispatchEvent(new Event('change', { bubbles: true }));
    eSubmit();
    expect(editHandlers.onSubmit).toHaveBeenCalledTimes(1);
    expect(eq('#edit-campaign-end-date-error').textContent).toBe('End date cannot be before the start date');
  });

  it('Save changes is disabled until something differs from the loaded campaign', () => {
    editForm.setCampaign(campaign);
    const save = eq('[data-testid=ads-edit-submit]');
    expect(save.disabled).toBe(true);
    expect(editForm.isDirty()).toBe(false);
    expect(eq('[data-testid=ads-edit-dirty]').textContent).toBe('No changes yet');

    eSet('#edit-campaign-name', 'Spring Sale 2');
    expect(save.disabled).toBe(false);
    expect(eq('[data-testid=ads-edit-dirty]').textContent).toBe('You have unsaved changes');
    eSet('#edit-campaign-name', 'Spring Sale'); // back to the original
    expect(save.disabled).toBe(true);

    // Budget typed differently but worth the same is not a change; a new value is.
    eSet('#edit-campaign-budget', '45');
    expect(save.disabled).toBe(true);
    eSet('#edit-campaign-budget', '46');
    expect(save.disabled).toBe(false);
    eSet('#edit-campaign-budget', '45.00');

    const paused = eq('#edit-campaign-status-paused');
    paused.checked = true;
    paused.dispatchEvent(new Event('change', { bubbles: true }));
    expect(save.disabled).toBe(false);
    eq('#edit-campaign-status-active').checked = true;
    eq('#edit-campaign-status-active').dispatchEvent(new Event('change', { bubbles: true }));
    expect(save.disabled).toBe(true);

    editForm.setProducts([product, { id: 'SKU-2001', sku: 'SKU-2001', name: 'Bottle', category: 'Home & Kitchen', price: 2499 }]);
    expect(save.disabled).toBe(false);
    editForm.setProducts([product]);
    expect(save.disabled).toBe(true);
  });

  it('submits the changed payload together with the campaign, then re-baselines', () => {
    editForm.setCampaign(campaign);
    eSet('#edit-campaign-name', '  Spring Sale — v2 ');
    eSet('#edit-campaign-budget', '60');
    const paused = eq('#edit-campaign-status-paused');
    paused.checked = true;
    paused.dispatchEvent(new Event('change', { bubbles: true }));
    eSubmit();
    expect(editHandlers.onSubmit).toHaveBeenCalledWith(
      { name: 'Spring Sale — v2', dailyBudget: 6000, endDate: '2025-06-30', type: 'sponsored_brands', bidStrategy: 'auto', products: [product], status: 'paused' },
      campaign,
    );
    // After a successful save the form shows the loaded campaign again (the parent reloads it with the fresh record).
    expect(eq('#edit-campaign-name').value).toBe('Spring Sale');
  });

  it('negative: a submit without changes does nothing; validation still applies to edits', () => {
    editForm.setCampaign(campaign);
    eSubmit();
    expect(editHandlers.onSubmit).not.toHaveBeenCalled();
    eSet('#edit-campaign-name', '');
    eSubmit();
    expect(editHandlers.onSubmit).not.toHaveBeenCalled();
    expect(eq('#edit-campaign-name-error').textContent).toBe('Give the campaign a name');
    editForm.setProducts([]);
    eSet('#edit-campaign-name', 'x');
    eSubmit();
    expect(eq('#edit-campaign-products-error').textContent).toBe('Add at least one product');
    expect(editHandlers.onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the edits when the parent rejects the save; reset() restores the loaded campaign', () => {
    editHandlers.onSubmit.mockReturnValue(false);
    editForm.setCampaign(campaign);
    eSet('#edit-campaign-name', 'Keep me');
    eSubmit();
    expect(editHandlers.onSubmit).toHaveBeenCalled();
    expect(eq('#edit-campaign-name').value).toBe('Keep me');
    editForm.reset();
    expect(eq('#edit-campaign-name').value).toBe('Spring Sale');
    expect(editForm.isDirty()).toBe(false);
  });

  it('Add products passes the campaign’s current products; cancel calls back', () => {
    editForm.setCampaign(campaign);
    eq('[data-testid=ads-edit-add-products]').click();
    expect(editHandlers.onAddProducts).toHaveBeenCalledWith([product]);
    eq('[data-testid=ads-edit-cancel]').click();
    expect(editHandlers.onCancel).toHaveBeenCalled();
  });

  it('edge: before a campaign is loaded the form is not dirty and shows no status text', () => {
    expect(editForm.isDirty()).toBe(false);
    expect(eq('[data-testid=ads-edit-submit]').disabled).toBe(true);
    expect(eq('[data-testid=ads-edit-dirty]').textContent).toBe('');
    expect(editForm.campaign).toBeNull();
  });
});
