import { PRODUCT_CATEGORIES, searchProducts } from '../data/products.js';
import { formatMoney } from '../lib/money.js';
import { DEFAULT_PAGE_SIZE, isPageSize, pageAfterResize, paginate } from '../lib/pagination.js';
import { h, icon, replaceChildren } from './dom.js';
import { createPager } from './pager.js';

/**
 * "Add products" dialog: searchable, category-filterable catalogue, paged
 * PAGE_SIZE products at a time (5 / 10 / 20 selectable), with a checkbox per product. Opens with the
 * campaign's current products ticked; the selection survives searching and
 * paging. Confirming hands the full new selection back via `onConfirm(products)`.
 */
export const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export function createProductPicker(container, { onConfirm, pageSize: initialPageSize = PAGE_SIZE }) {
  let selected = new Map(); // id -> product
  let query = '';
  let category = null;
  let page = 1;
  let pageSize = initialPageSize;
  let currency;

  const searchInput = h('input', {
    type: 'search',
    class: 'ads-field__input',
    placeholder: 'Search by name, SKU or category',
    'aria-label': 'Search products',
    'data-testid': 'ads-product-search',
    autocomplete: 'off',
    oninput: () => {
      query = searchInput.value;
      page = 1;
      renderList();
    },
  });
  const categoryRow = h('div', { class: 'ads-chip-row', role: 'group', 'aria-label': 'Filter by category' });
  const list = h('ul', { class: 'ads-product-list', 'aria-label': 'Products' });
  const emptyMsg = h('p', { class: 'ads-empty ads-empty--compact', hidden: true }, 'No products match your search.');
  const count = h('span', { class: 'ads-product-picker__count', 'data-testid': 'ads-picker-count' });
  const selectVisibleBtn = h('button', { type: 'button', class: 'ads-btn ads-btn--sm', onclick: () => toggleVisible() }, 'Select all shown');
  const pagerHost = h('div', {});
  const pager = createPager(pagerHost, {
    label: 'Product pages',
    onPage: (next) => {
      page = next;
      renderList();
    },
    onPageSize: (size) => {
      if (!isPageSize(size)) return;
      page = pageAfterResize(page, pageSize, size);
      pageSize = size;
      renderList();
    },
  });

  const confirmLabel = h('span', {}, 'Add products');
  const confirmBtn = h('button', { type: 'button', class: 'ads-btn ads-btn--primary', 'data-testid': 'ads-picker-confirm', onclick: confirm }, icon('check', 16), confirmLabel);
  const cancelBtn = h('button', { type: 'button', class: 'ads-btn ads-btn--ghost', onclick: () => dialog.close() }, 'Cancel');

  const dialog = h(
    'dialog',
    { class: 'ads-dialog', 'aria-labelledby': 'ads-picker-title', 'data-testid': 'ads-product-picker' },
    h(
      'div',
      { class: 'ads-dialog__head' },
      h('div', {}, h('h2', { class: 'ads-panel__title', id: 'ads-picker-title' }, 'Add products'), h('p', { class: 'ads-panel__hint' }, 'Choose the listings this campaign should advertise.')),
      h('button', { type: 'button', class: 'ads-icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('x')),
    ),
    // Search, filters and the selection bar stay put; only the list scrolls.
    h('div', { class: 'ads-dialog__toolbar' }, h('label', { class: 'ads-search ads-search--block' }, icon('search', 15), searchInput), categoryRow, h('div', { class: 'ads-product-picker__bar' }, count, selectVisibleBtn)),
    h('div', { class: 'ads-dialog__body' }, list, emptyMsg, pagerHost),
    h('div', { class: 'ads-dialog__actions' }, cancelBtn, confirmBtn),
  );
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  container.append(dialog);

  /** Every product matching the search + category (all pages). */
  function matching() {
    return searchProducts(query, { category });
  }

  /** The current page of matching products. */
  function visible() {
    return paginate(matching(), page, pageSize).items;
  }

  function renderCategories() {
    const chipFor = (id, label) =>
      h('button', { type: 'button', class: `ads-chip${category === id ? ' is-active' : ''}`, 'data-category': id ?? '', 'aria-pressed': category === id ? 'true' : 'false', onclick: () => setCategory(id) }, label);
    replaceChildren(categoryRow, chipFor(null, 'All'), ...PRODUCT_CATEGORIES.map((c) => chipFor(c, c)));
  }

  function setCategory(id) {
    category = id;
    page = 1;
    renderCategories();
    renderList();
  }

  function renderList() {
    const paged = paginate(matching(), page, pageSize);
    page = paged.page;
    const products = paged.items;
    pager.update({ ...paged, noun: 'products' });
    emptyMsg.hidden = products.length > 0;
    list.hidden = products.length === 0;
    replaceChildren(
      list,
      ...products.map((p) => {
        const id = `ads-pick-${p.id}`;
        const checkbox = h('input', {
          type: 'checkbox',
          id,
          class: 'ads-product__checkbox',
          checked: selected.has(p.id),
          'data-product-id': p.id,
          onchange: () => {
            if (checkbox.checked) selected.set(p.id, p);
            else selected.delete(p.id);
            li.classList.toggle('is-selected', checkbox.checked);
            renderCount();
          },
        });
        const li = h(
          'li',
          { class: `ads-product${selected.has(p.id) ? ' is-selected' : ''}`, 'data-product-id': p.id },
          h(
            'label',
            { class: 'ads-product__row', for: id },
            checkbox,
            h('span', { class: 'ads-product__swatch', style: { '--swatch': p.color }, 'aria-hidden': 'true' }, initials(p.name)),
            h('span', { class: 'ads-product__text' }, h('span', { class: 'ads-product__name' }, p.name), h('span', { class: 'ads-product__meta' }, `${p.sku} · ${p.category}`)),
            h('span', { class: 'ads-product__price' }, formatMoney(p.price, { currency })),
          ),
        );
        return li;
      }),
    );
    selectVisibleBtn.textContent = products.length && products.every((p) => selected.has(p.id)) ? 'Clear shown' : 'Select all shown';
    selectVisibleBtn.disabled = products.length === 0;
    renderCount();
  }

  function toggleVisible() {
    const products = visible();
    const allSelected = products.every((p) => selected.has(p.id));
    for (const p of products) {
      if (allSelected) selected.delete(p.id);
      else selected.set(p.id, p);
    }
    renderList();
  }

  function renderCount() {
    const n = selected.size;
    count.textContent = `${n} selected`;
    confirmLabel.textContent = n ? `Add ${n} ${n === 1 ? 'product' : 'products'}` : 'Add products';
  }

  function confirm() {
    onConfirm([...selected.values()].map(({ id, sku, name, category: cat, price }) => ({ id, sku, name, category: cat, price })));
    dialog.close();
  }

  return {
    dialog,
    /** @param {{id: string}[]} current products already on the campaign (pre-ticked) */
    open(current = []) {
      selected = new Map(current.map((p) => [p.id, p]));
      query = '';
      category = null;
      page = 1;
      searchInput.value = '';
      renderCategories();
      renderList();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      searchInput.focus();
    },
    close: () => dialog.close(),
    /** @param {{currency?: string}} next — display currency for prices */
    update({ currency: nextCurrency } = {}) {
      if (nextCurrency && nextCurrency !== currency) {
        currency = nextCurrency;
        if (dialog.open) renderList();
      }
    },
    get selected() {
      return [...selected.values()];
    },
    get page() {
      return page;
    },
    get pageSize() {
      return pageSize;
    },
  };
}

/** Two-letter placeholder for a product "image". */
export function initials(name) {
  const words = String(name || '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
