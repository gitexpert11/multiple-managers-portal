import { BID_STRATEGIES, DEFAULT_BID_STRATEGY } from '../data/bidStrategies.js';
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, DEFAULT_CAMPAIGN_TYPE, DEFAULT_STATUS, getCampaignType } from '../data/campaignTypes.js';
import { getProduct } from '../data/products.js';
import { formatDay, isValidDayKey, todayKey } from '../lib/dates.js';
import { centsToInput, currencySymbol, formatMoney, parseAmount } from '../lib/money.js';
import { DEFAULT_PAGE_SIZE, isPageSize, pageAfterResize, paginate } from '../lib/pagination.js';
import { MAX_DAILY_BUDGET, MIN_DAILY_BUDGET, NAME_MAX } from '../store/store.js';
import { h, icon, replaceChildren } from './dom.js';
import { createPager } from './pager.js';
import { initials } from './productPicker.js';

/** Products listed per page in the selected-products grid. */
export const PRODUCT_PAGE_SIZE = DEFAULT_PAGE_SIZE;

const COPY = {
  create: {
    heading: 'Create campaign',
    hint: 'The campaign starts today and appears on your dashboard as soon as it is submitted.',
    submit: 'Submit campaign',
    submitIcon: 'megaphone',
    testid: 'ads-create',
    prefix: 'campaign',
    ids: { submit: 'ads-campaign-submit', cancel: 'ads-campaign-cancel', addProducts: 'ads-add-products', products: 'ads-products' },
  },
  edit: {
    heading: 'Edit campaign',
    hint: 'Changes apply as soon as you save. Performance history is kept.',
    submit: 'Save changes',
    submitIcon: 'check',
    testid: 'ads-edit',
    prefix: 'edit-campaign',
    ids: { submit: 'ads-edit-submit', cancel: 'ads-edit-cancel', addProducts: 'ads-edit-add-products', products: 'ads-edit-products' },
  },
};

/**
 * Campaign form, used for both the "Create campaign" page (`mode: 'create'`)
 * and the "Edit campaign" page (`mode: 'edit'`).
 *
 * Fields: name, daily budget, optional end date, campaign type, products (via
 * the picker dialog, listed in a paged grid once added) and bid strategy (auto
 * only for now).
 * In edit mode the type is locked (it cannot change once a campaign exists),
 * a status switch (active / paused) is added, and "Save changes" is enabled
 * only once something differs from the loaded campaign.
 *
 * Validation is inline with focus on the first invalid field. On success the
 * payload goes to `onSubmit`; the parent persists, toasts and navigates back
 * to the dashboard.
 *
 * @param {{mode?: 'create'|'edit', onSubmit: (payload) => boolean|void, onCancel: () => void, onAddProducts: (current: object[]) => void}} opts
 *   `onAddProducts` opens the picker; the parent calls `setProducts()` with
 *   the result.
 */
export function createCampaignForm(container, { mode = 'create', onSubmit, onCancel, onAddProducts }) {
  const copy = COPY[mode];
  if (!copy) throw new Error('mode must be "create" or "edit"');
  const isEdit = mode === 'edit';
  const id = (suffix) => `${copy.prefix}-${suffix}`;

  let products = [];
  let productPage = 1;
  let productPageSize = PRODUCT_PAGE_SIZE;
  let today = '';
  let currency;
  const money = (cents) => formatMoney(cents, { currency });
  /** The campaign being edited (edit mode) and its baseline payload for dirty checks. */
  let campaign = null;
  let baseline = null;

  // --- fields -----------------------------------------------------------------
  const nameInput = h('input', {
    type: 'text',
    id: id('name'),
    class: 'ads-field__input',
    placeholder: 'e.g. Spring Sale — Headphones',
    maxlength: NAME_MAX,
    autocomplete: 'off',
    required: true,
    'aria-describedby': id('name-error'),
    oninput: () => nameInput.value.trim() && showNameError(''),
  });
  const nameError = h('p', { class: 'ads-field__error', id: id('name-error'), role: 'alert' });

  const budgetInput = h('input', {
    type: 'text',
    id: id('budget'),
    class: 'ads-field__input ads-field__input--money',
    inputmode: 'decimal',
    placeholder: '25.00',
    autocomplete: 'off',
    required: true,
    'aria-describedby': `${id('budget-error')} ${id('budget-hint')}`,
    oninput: () => parseAmount(budgetInput.value) != null && showBudgetError(''),
    onblur: () => {
      const cents = parseAmount(budgetInput.value);
      if (cents != null) budgetInput.value = centsToInput(cents);
    },
  });
  const budgetError = h('p', { class: 'ads-field__error', id: id('budget-error'), role: 'alert' });
  const currencyPrefix = h('span', { class: 'ads-money__prefix', 'aria-hidden': 'true' }, currencySymbol());
  const budgetHint = h('p', { class: 'ads-field__hint', id: id('budget-hint') }, `Spent per day at most. Minimum ${money(MIN_DAILY_BUDGET)}.`);

  const endInput = h('input', {
    type: 'date',
    id: id('end-date'),
    class: 'ads-field__input',
    'aria-describedby': `${id('end-date-error')} ${id('end-date-hint')}`,
    onchange: () => showEndError(''),
  });
  const endError = h('p', { class: 'ads-field__error', id: id('end-date-error'), role: 'alert' });
  const endHint = h('p', { class: 'ads-field__hint', id: id('end-date-hint') }, 'Optional. Leave empty to run until paused or archived.');

  const typeInputs = CAMPAIGN_TYPES.map((t) =>
    h('input', { type: 'radio', name: id('type'), id: id(`type-${t.id}`), value: t.id, class: 'ads-choice__input', checked: t.id === DEFAULT_CAMPAIGN_TYPE, disabled: isEdit }),
  );
  const typeGroup = h(
    'fieldset',
    { class: `ads-choice-group${isEdit ? ' is-locked' : ''}`, id: id('type') },
    h('legend', { class: 'ads-field__label' }, 'Type of campaign', isEdit ? h('span', { class: 'ads-tag' }, icon('lock', 11), 'Locked') : null),
    h(
      'div',
      { class: 'ads-choice-row' },
      ...CAMPAIGN_TYPES.map((t, i) =>
        h(
          'label',
          { class: 'ads-choice', for: id(`type-${t.id}`), style: { '--choice-color': t.color } },
          typeInputs[i],
          h('span', { class: 'ads-choice__swatch', 'aria-hidden': 'true' }, icon(t.icon, 16)),
          h('span', { class: 'ads-choice__text' }, h('span', { class: 'ads-choice__name' }, t.label), h('span', { class: 'ads-choice__desc' }, t.description)),
        ),
      ),
    ),
    isEdit ? h('p', { class: 'ads-field__hint' }, 'The type cannot be changed once a campaign exists. Create a new campaign to use a different type.') : null,
  );

  // Edit only: status switch + read-only facts about the campaign.
  const statusInputs = CAMPAIGN_STATUSES.map((s) =>
    h('input', { type: 'radio', name: id('status'), id: id(`status-${s.id}`), value: s.id, class: 'ads-segmented__input', checked: s.id === DEFAULT_STATUS }),
  );
  const statusGroup = isEdit
    ? h(
        'fieldset',
        { class: 'ads-choice-group', id: id('status') },
        h('legend', { class: 'ads-field__label' }, 'Status'),
        h(
          'div',
          { class: 'ads-segmented ads-segmented--inline', role: 'radiogroup', 'aria-label': 'Campaign status' },
          ...CAMPAIGN_STATUSES.flatMap((s, i) => [statusInputs[i], h('label', { for: id(`status-${s.id}`), class: 'ads-segmented__label' }, s.label)]),
        ),
        h('p', { class: 'ads-field__hint' }, 'Paused campaigns stop serving ads but keep their history. Archived campaigns are hidden from the dashboard unless you filter for them.'),
      )
    : null;
  const facts = isEdit ? h('dl', { class: 'ads-facts', 'data-testid': 'ads-edit-facts' }) : null;

  const bidInputs = BID_STRATEGIES.map((s) =>
    h('input', { type: 'radio', name: id('bid'), id: id(`bid-${s.id}`), value: s.id, class: 'ads-choice__input', checked: s.id === DEFAULT_BID_STRATEGY, disabled: !s.available }),
  );
  const bidGroup = h(
    'fieldset',
    { class: 'ads-choice-group', id: id('bid') },
    h('legend', { class: 'ads-field__label' }, 'Bid strategy'),
    h(
      'div',
      { class: 'ads-choice-row ads-choice-row--2' },
      ...BID_STRATEGIES.map((s, i) =>
        h(
          'label',
          { class: `ads-choice${s.available ? '' : ' is-disabled'}`, for: id(`bid-${s.id}`), style: { '--choice-color': '#16a34a' }, title: s.available ? null : 'Not available yet' },
          bidInputs[i],
          h('span', { class: 'ads-choice__swatch', 'aria-hidden': 'true' }, icon(s.available ? 'zap' : 'target', 16)),
          h(
            'span',
            { class: 'ads-choice__text' },
            h('span', { class: 'ads-choice__name' }, s.label, s.available ? h('span', { class: 'ads-tag ads-tag--success' }, 'Selected') : h('span', { class: 'ads-tag' }, 'Coming soon')),
            h('span', { class: 'ads-choice__desc' }, s.description),
          ),
        ),
      ),
    ),
  );

  // --- products ---------------------------------------------------------------
  const addProductsBtn = h('button', { type: 'button', class: 'ads-btn', 'data-testid': copy.ids.addProducts, onclick: () => onAddProducts(products) }, icon('plus', 16), h('span', {}, 'Add products'));
  const productsError = h('p', { class: 'ads-field__error', id: id('products-error'), role: 'alert' });
  const productsHint = h('p', { class: 'ads-field__hint' });
  const productBody = h('tbody', {});
  const productTable = h(
    'table',
    { class: 'ads-grid ads-product-grid', 'aria-label': 'Selected products', hidden: true },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Product'), h('th', { scope: 'col' }, 'SKU'), h('th', { scope: 'col' }, 'Category'), h('th', { scope: 'col', class: 'is-numeric' }, 'Price'), h('th', { scope: 'col', class: 'sr-only-head' }, h('span', { class: 'sr-only' }, 'Remove')))),
    productBody,
  );
  const productsEmpty = h('div', { class: 'ads-empty ads-empty--compact ads-products-empty' }, icon('package', 22), h('p', {}, 'No products yet. Add the listings this campaign should promote.'));
  const productPagerHost = h('div', {});
  const productPager = createPager(productPagerHost, {
    label: 'Selected product pages',
    onPage: (next) => {
      productPage = next;
      renderProducts();
    },
    onPageSize: (size) => {
      if (!isPageSize(size)) return;
      productPage = pageAfterResize(productPage, productPageSize, size);
      productPageSize = size;
      renderProducts();
    },
  });
  const productsSection = h(
    'div',
    { class: 'ads-field', id: id('products'), 'data-testid': copy.ids.products },
    h('div', { class: 'ads-field__row' }, h('div', {}, h('span', { class: 'ads-field__label' }, 'Products'), productsHint), addProductsBtn),
    h('div', { class: 'ads-grid-scroll' }, productTable),
    productPagerHost,
    productsEmpty,
    productsError,
  );

  function renderProducts() {
    const n = products.length;
    productsHint.textContent = n ? `${n} ${n === 1 ? 'product' : 'products'} selected` : 'At least one product is required';
    productTable.hidden = n === 0;
    productsEmpty.hidden = n > 0;
    const paged = paginate(products, productPage, productPageSize);
    productPage = paged.page;
    productPager.update({ ...paged, noun: 'products' });
    replaceChildren(
      productBody,
      ...paged.items.map((p) =>
        h(
          'tr',
          { class: 'ads-grid__row', 'data-product-id': p.id },
          h('td', { 'data-label': 'Product' }, h('span', { class: 'ads-product__cell' }, h('span', { class: 'ads-product__swatch', style: { '--swatch': p.color || getProduct(p.id)?.color || '#94a3b8' }, 'aria-hidden': 'true' }, initials(p.name)), h('span', { class: 'ads-grid__name' }, p.name))),
          h('td', { 'data-label': 'SKU', class: 'ads-grid__mono' }, p.sku),
          h('td', { 'data-label': 'Category' }, p.category || '—'),
          h('td', { 'data-label': 'Price', class: 'is-numeric' }, money(p.price)),
          h('td', { class: 'ads-grid__actions' }, h('button', { type: 'button', class: 'ads-icon-btn ads-icon-btn--danger', 'aria-label': `Remove "${p.name}"`, title: 'Remove product', onclick: () => setProducts(products.filter((x) => x.id !== p.id)) }, icon('x', 15))),
        ),
      ),
    );
    if (n) showProductsError('');
  }

  function setProducts(next) {
    products = Array.isArray(next) ? next : [];
    renderProducts();
    syncDirty();
  }

  // --- form -------------------------------------------------------------------
  const submitBtn = h('button', { type: 'submit', class: 'ads-btn ads-btn--primary', 'data-testid': copy.ids.submit }, icon(copy.submitIcon, 16), h('span', {}, copy.submit));
  const cancelBtn = h('button', { type: 'button', class: 'ads-btn ads-btn--ghost', 'data-testid': copy.ids.cancel, onclick: () => onCancel?.() }, 'Cancel');
  const dirtyHint = isEdit ? h('p', { class: 'ads-field__hint ads-form__status', 'data-testid': 'ads-edit-dirty', 'aria-live': 'polite' }) : null;

  const form = h(
    'form',
    { class: 'ads-form', novalidate: true, onsubmit: handleSubmit, 'aria-labelledby': id('heading'), oninput: syncDirty, onchange: syncDirty },
    facts,
    h(
      'div',
      { class: 'ads-form__grid ads-form__grid--3' },
      field('Campaign name', id('name'), nameInput, nameError),
      field('Daily budget', id('budget'), h('div', { class: 'ads-money' }, currencyPrefix, budgetInput), budgetHint, budgetError),
      field('End date', id('end-date'), endInput, endHint, endError),
    ),
    statusGroup,
    typeGroup,
    productsSection,
    bidGroup,
    h('div', { class: 'ads-form__actions' }, submitBtn, cancelBtn, dirtyHint),
  );

  const root = h(
    'section',
    { class: 'ads-panel ads-form-panel', 'data-testid': copy.testid },
    h('div', { class: 'ads-panel__head' }, h('div', {}, h('h2', { class: 'ads-panel__title', id: id('heading') }, copy.heading), h('p', { class: 'ads-panel__hint' }, copy.hint))),
    form,
  );
  container.append(root);
  renderProducts();
  syncDirty();

  // --- behaviour --------------------------------------------------------------
  function field(labelText, forId, ...controls) {
    return h('div', { class: 'ads-field' }, h('label', { class: 'ads-field__label', for: forId }, labelText), ...controls);
  }

  function setFieldError(input, errorEl, msg) {
    errorEl.textContent = msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.closest('.ads-field').classList.toggle('ads-field--invalid', Boolean(msg));
  }
  const showNameError = (msg) => setFieldError(nameInput, nameError, msg);
  const showBudgetError = (msg) => setFieldError(budgetInput, budgetError, msg);
  const showEndError = (msg) => setFieldError(endInput, endError, msg);
  /** The earliest allowed end date: the campaign's start (edit) or today (create). */
  const earliestEnd = () => (isEdit && campaign ? campaign.startDate : today);
  const showProductsError = (msg) => {
    productsError.textContent = msg;
    productsSection.classList.toggle('ads-field--invalid', Boolean(msg));
  };

  const selectedType = () => typeInputs.find((i) => i.checked)?.value || DEFAULT_CAMPAIGN_TYPE;
  const selectedBid = () => bidInputs.find((i) => i.checked)?.value || DEFAULT_BID_STRATEGY;
  const selectedStatus = () => statusInputs.find((i) => i.checked)?.value || DEFAULT_STATUS;
  const snapshotProducts = () => products.map(({ id: pid, sku, name, category, price }) => ({ id: pid, sku, name, category, price }));

  /** What would be submitted right now (raw budget text parsed; null when unparsable). */
  function currentPayload() {
    const payload = { name: nameInput.value.trim(), dailyBudget: parseAmount(budgetInput.value), endDate: endInput.value || null, type: selectedType(), bidStrategy: selectedBid(), products: snapshotProducts() };
    if (isEdit) payload.status = selectedStatus();
    return payload;
  }

  function isDirty() {
    if (!isEdit) return true;
    if (!baseline) return false;
    return JSON.stringify(currentPayload()) !== JSON.stringify(baseline);
  }

  /** Edit mode: enable "Save changes" only when something differs from the loaded campaign. */
  function syncDirty() {
    if (!isEdit) return;
    const dirty = isDirty();
    submitBtn.disabled = !dirty;
    dirtyHint.textContent = campaign ? (dirty ? 'You have unsaved changes' : 'No changes yet') : '';
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (isEdit && !isDirty()) return;
    let firstInvalid = null;

    const name = nameInput.value.trim();
    if (!name) {
      showNameError('Give the campaign a name');
      firstInvalid = nameInput;
    } else showNameError('');

    const dailyBudget = parseAmount(budgetInput.value);
    if (dailyBudget == null) {
      showBudgetError('Enter a daily budget');
      firstInvalid ??= budgetInput;
    } else if (dailyBudget < MIN_DAILY_BUDGET) {
      showBudgetError(`Daily budget must be at least ${money(MIN_DAILY_BUDGET)}`);
      firstInvalid ??= budgetInput;
    } else if (dailyBudget > MAX_DAILY_BUDGET) {
      showBudgetError(`Daily budget cannot exceed ${money(MAX_DAILY_BUDGET)}`);
      firstInvalid ??= budgetInput;
    } else showBudgetError('');

    const endDate = endInput.value || null;
    if (endDate && !isValidDayKey(endDate)) {
      showEndError('Enter a valid end date');
      firstInvalid ??= endInput;
    } else if (endDate && earliestEnd() && endDate < earliestEnd()) {
      showEndError(isEdit ? 'End date cannot be before the start date' : 'End date cannot be in the past');
      firstInvalid ??= endInput;
    } else showEndError('');

    if (!products.length) {
      showProductsError('Add at least one product');
      firstInvalid ??= addProductsBtn;
    } else showProductsError('');

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const payload = { ...currentPayload(), name, dailyBudget };
    const ok = isEdit ? onSubmit(payload, campaign) : onSubmit(payload);
    if (ok !== false) reset();
  }

  /** Back to a blank form (create) or to the loaded campaign's values (edit). */
  function reset() {
    if (isEdit && campaign) return setCampaign(campaign);
    nameInput.value = '';
    budgetInput.value = '';
    endInput.value = '';
    endInput.min = today;
    typeInputs.forEach((i) => (i.checked = i.value === DEFAULT_CAMPAIGN_TYPE));
    bidInputs.forEach((i) => (i.checked = i.value === DEFAULT_BID_STRATEGY));
    statusInputs.forEach((i) => (i.checked = i.value === DEFAULT_STATUS));
    setProducts([]);
    showNameError('');
    showBudgetError('');
    showEndError('');
    showProductsError('');
  }

  /** Edit mode: load a campaign into the form and take it as the dirty-check baseline. */
  function setCampaign(next) {
    campaign = next;
    nameInput.value = next.name;
    budgetInput.value = centsToInput(next.dailyBudget);
    endInput.value = next.endDate || '';
    endInput.min = next.startDate;
    typeInputs.forEach((i) => (i.checked = i.value === next.type));
    bidInputs.forEach((i) => (i.checked = i.value === next.bidStrategy));
    statusInputs.forEach((i) => (i.checked = i.value === next.status));
    products = next.products.map((p) => ({ ...p }));
    productPage = 1;
    renderProducts();
    showNameError('');
    showBudgetError('');
    showEndError('');
    showProductsError('');
    baseline = currentPayload();
    if (facts) {
      const type = getCampaignType(next.type);
      replaceChildren(
        facts,
        fact('Type', h('span', { class: 'ads-type-pill', style: { '--type-color': type?.color || '#9ca3af' } }, icon(type?.icon || 'tag', 12), type?.label || next.type)),
        fact('Started', formatDay(next.startDate)),
        fact('Ends', next.endDate ? formatDay(next.endDate) : 'No end date'),
        fact('Days with data', String(next.performance?.length ?? 0)),
        fact('Last updated', formatDay(todayKey(new Date(next.updatedAt)))),
      );
    }
    syncDirty();
  }

  function fact(label, value) {
    return h('div', { class: 'ads-facts__item' }, h('dt', {}, label), h('dd', {}, value));
  }

  return {
    root,
    mode,
    reset,
    setProducts,
    setCampaign,
    isDirty,
    /**
     * @param {{today?: string, currency?: string}} next — today's key drives the earliest
     *   end date on the create page; the currency re-labels the budget prefix, hints and prices.
     */
    update({ today: nextToday, currency: nextCurrency } = {}) {
      if (nextToday) {
        today = nextToday;
        if (!isEdit) endInput.min = today;
      }
      if (nextCurrency && nextCurrency !== currency) {
        currency = nextCurrency;
        const symbol = currencySymbol(currency);
        currencyPrefix.textContent = symbol;
        currencyPrefix.classList.toggle('ads-money__prefix--wide', symbol.length > 1);
        budgetInput.classList.toggle('ads-field__input--money-wide', symbol.length > 1);
        budgetHint.textContent = `Spent per day at most. Minimum ${money(MIN_DAILY_BUDGET)}.`;
        renderProducts();
      }
    },
    focus: () => nameInput.focus(),
    get products() {
      return [...products];
    },
    get productPage() {
      return productPage;
    },
    get productPageSize() {
      return productPageSize;
    },
    get campaign() {
      return campaign;
    },
  };
}
