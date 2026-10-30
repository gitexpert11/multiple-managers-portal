import { defaultDateForMonth } from '../lib/dates.js';
import { centsToInput, parseAmount } from '../lib/money.js';
import { h, icon, replaceChildren } from './dom.js';

const NEW_CATEGORY = '__new__';

/**
 * Add / edit form.
 *
 * Optimised for speed: the amount field is focused, type + category + date are
 * pre-filled from context (last used category, selected month), and Enter
 * submits from any field. The quickest path is "type amount, press Enter".
 */
export function createTransactionForm(container, { onSubmit, onCancelEdit, onAddCategory }) {
  let props = { categories: [], month: '', lastCategory: {}, editing: null, currencySymbol: '$', maxDate: '' };
  let type = 'expense';
  let editingId = null;
  let dateTouched = false;
  let categorySignature = '';

  // --- fields ---------------------------------------------------------------
  const typeInputs = ['expense', 'income'].map((t) =>
    h('input', {
      type: 'radio',
      name: 'tx-type',
      id: `tx-type-${t}`,
      value: t,
      class: 'segmented__input',
      checked: t === type,
      onchange: () => setType(t),
    }),
  );
  const typeGroup = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Transaction type' },
    typeInputs[0],
    h('label', { for: 'tx-type-expense', class: 'segmented__label segmented__label--expense' }, 'Expense'),
    typeInputs[1],
    h('label', { for: 'tx-type-income', class: 'segmented__label segmented__label--income' }, 'Income'),
  );

  const currencyPrefix = h('span', { class: 'field__prefix', 'aria-hidden': 'true' }, '$');
  const amountInput = h('input', {
    type: 'text',
    inputmode: 'decimal',
    id: 'tx-amount',
    class: 'field__input field__input--amount',
    placeholder: '0.00',
    autocomplete: 'off',
    required: true,
    'aria-describedby': 'tx-amount-error',
  });
  const amountError = h('p', { class: 'field__error', id: 'tx-amount-error', role: 'alert' });

  const categorySelect = h('select', { id: 'tx-category', class: 'field__input', onchange: onCategoryChange });
  const newCategoryInput = h('input', {
    type: 'text',
    class: 'field__input',
    placeholder: 'New category name',
    'aria-label': 'New category name',
    maxlength: 40,
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commitNewCategory();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelNewCategory();
      }
    },
  });
  const newCategoryRow = h(
    'div',
    { class: 'field__inline', hidden: true },
    newCategoryInput,
    h('button', { type: 'button', class: 'btn btn--sm', onclick: commitNewCategory }, 'Add'),
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: cancelNewCategory }, 'Cancel'),
  );

  const descriptionInput = h('input', {
    type: 'text',
    id: 'tx-description',
    class: 'field__input',
    placeholder: 'What was it for? (optional)',
    maxlength: 200,
    autocomplete: 'off',
  });

  const dateInput = h('input', {
    type: 'date',
    id: 'tx-date',
    class: 'field__input',
    required: true,
    'aria-describedby': 'tx-date-error',
    onchange: () => (dateTouched = true),
  });
  const dateError = h('p', { class: 'field__error', id: 'tx-date-error', role: 'alert' });

  const submitIcon = icon('plus', 16);
  const submitBtn = h('button', { type: 'submit', class: 'btn btn--primary' }, submitIcon, h('span', {}, 'Add expense'));
  const cancelBtn = h('button', { type: 'button', class: 'btn btn--ghost', hidden: true, onclick: () => onCancelEdit?.() }, 'Cancel');
  const heading = h('h2', { class: 'panel__title' }, 'Add transaction');

  const form = h(
    'form',
    { class: 'tx-form', novalidate: true, onsubmit: handleSubmit, 'aria-labelledby': 'tx-form-heading' },
    typeGroup,
    field('Amount', 'tx-amount', h('div', { class: 'field__wrap' }, currencyPrefix, amountInput), amountError),
    field('Category', 'tx-category', categorySelect, newCategoryRow),
    field('Description', 'tx-description', descriptionInput),
    field('Date', 'tx-date', dateInput, dateError),
    h('div', { class: 'tx-form__actions' }, submitBtn, cancelBtn),
  );
  heading.id = 'tx-form-heading';

  const root = h('section', { class: 'panel tx-panel' }, heading, form);
  container.append(root);

  // --- behaviour ------------------------------------------------------------

  function field(labelText, forId, ...controls) {
    return h('div', { class: 'field' }, h('label', { class: 'field__label', for: forId }, labelText), ...controls);
  }

  function setType(next) {
    type = next;
    typeInputs.forEach((i) => (i.checked = i.value === type));
    root.dataset.type = type;
    submitBtn.lastChild.textContent = editingId ? 'Save changes' : type === 'expense' ? 'Add expense' : 'Add income';
    renderCategories();
    if (!editingId) selectCategory(props.lastCategory[type]);
  }

  function renderCategories() {
    const list = props.categories.filter((c) => c.type === type);
    const sig = `${type}|${list.map((c) => `${c.id}:${c.name}`).join(',')}`;
    if (sig === categorySignature) return;
    categorySignature = sig;
    const current = categorySelect.value;
    replaceChildren(
      categorySelect,
      ...list.map((c) => h('option', { value: c.id }, c.name)),
      h('option', { value: NEW_CATEGORY }, '+ New category…'),
    );
    if (list.some((c) => c.id === current)) categorySelect.value = current;
  }

  function selectCategory(id) {
    if (id && [...categorySelect.options].some((o) => o.value === id)) categorySelect.value = id;
    else categorySelect.selectedIndex = 0;
    categorySelect.dataset.prev = categorySelect.value;
  }

  function onCategoryChange() {
    if (categorySelect.value === NEW_CATEGORY) {
      newCategoryRow.hidden = false;
      newCategoryInput.value = '';
      newCategoryInput.focus();
    } else {
      categorySelect.dataset.prev = categorySelect.value;
    }
  }

  function commitNewCategory() {
    const name = newCategoryInput.value.trim();
    if (!name) {
      newCategoryInput.focus();
      return;
    }
    const created = onAddCategory?.(name, type);
    newCategoryRow.hidden = true;
    if (created) {
      // Parent will re-render categories via update(); make sure the new one is picked.
      renderCategories();
      selectCategory(created.id);
    } else {
      cancelNewCategory();
    }
    amountInput.value ? descriptionInput.focus() : amountInput.focus();
  }

  function cancelNewCategory() {
    newCategoryRow.hidden = true;
    categorySelect.value = categorySelect.dataset.prev || '';
    if (categorySelect.value === NEW_CATEGORY || !categorySelect.value) categorySelect.selectedIndex = 0;
    categorySelect.focus();
  }

  function showError(msg) {
    setFieldError(amountInput, amountError, msg);
  }

  function showDateError(msg) {
    setFieldError(dateInput, dateError, msg);
  }

  function setFieldError(input, errorEl, msg) {
    errorEl.textContent = msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.closest('.field').classList.toggle('field--invalid', Boolean(msg));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!newCategoryRow.hidden) {
      commitNewCategory();
      return;
    }
    const amount = parseAmount(amountInput.value);
    if (amount == null) {
      showError('Enter a positive amount, e.g. 12.50');
      amountInput.focus();
      amountInput.select();
      return;
    }
    showError('');
    if (!dateInput.value) {
      dateInput.value = defaultDateForMonth(props.month);
    }
    // Day keys are zero-padded ISO strings, so string comparison is chronological.
    if (props.maxDate && dateInput.value > props.maxDate) {
      showDateError('Date cannot be in the future');
      dateInput.focus();
      return;
    }
    showDateError('');
    const payload = {
      type,
      amount,
      categoryId: categorySelect.value === NEW_CATEGORY ? '' : categorySelect.value,
      description: descriptionInput.value,
      date: dateInput.value,
    };
    const ok = onSubmit(payload, editingId);
    if (ok === false) return;
    if (!editingId) {
      amountInput.value = '';
      descriptionInput.value = '';
      amountInput.focus();
    }
  }

  function enterEditMode(tx) {
    editingId = tx.id;
    heading.textContent = 'Edit transaction';
    cancelBtn.hidden = false;
    setType(tx.type);
    amountInput.value = centsToInput(tx.amount);
    descriptionInput.value = tx.description || '';
    dateInput.value = tx.date;
    dateTouched = true;
    selectCategory(tx.categoryId);
    submitBtn.lastChild.textContent = 'Save changes';
    submitIcon.hidden = true;
    showError('');
    showDateError('');
    root.classList.add('tx-panel--editing');
    amountInput.focus();
    amountInput.select();
  }

  function exitEditMode() {
    editingId = null;
    heading.textContent = 'Add transaction';
    cancelBtn.hidden = true;
    submitIcon.hidden = false;
    root.classList.remove('tx-panel--editing');
    amountInput.value = '';
    descriptionInput.value = '';
    dateTouched = false;
    dateInput.value = defaultDateForMonth(props.month);
    setType(type);
    showError('');
    showDateError('');
  }

  return {
    root,
    focusAmount: () => amountInput.focus(),
    /** @param {{categories: object[], month: string, lastCategory: object, editing: object|null, currencySymbol: string, maxDate?: string}} next */
    update(next) {
      const prevMonth = props.month;
      props = { ...props, ...next };
      currencyPrefix.textContent = props.currencySymbol;
      if (props.maxDate) dateInput.max = props.maxDate;
      renderCategories();

      if (props.editing && props.editing.id !== editingId) enterEditMode(props.editing);
      else if (!props.editing && editingId) exitEditMode();

      if (!editingId) {
        if (!categorySelect.value || categorySelect.value === NEW_CATEGORY) selectCategory(props.lastCategory[type]);
        if (props.month !== prevMonth || !dateInput.value) {
          if (!dateTouched || props.month !== prevMonth) {
            dateInput.value = defaultDateForMonth(props.month);
            dateTouched = false;
          }
        }
      }
    },
  };
}
