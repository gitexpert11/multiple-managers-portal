/**
 * Transaction form component: inline category creation (mouse + keyboard),
 * validation paths, submit outcomes and edit mode — driven in isolation so
 * every branch can be reached without the rest of the app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/data/defaultCategories.js';
import { createTransactionForm } from '../src/ui/transactionForm.js';

const NOW = new Date(2025, 2, 15);
const base = {
  categories: DEFAULT_CATEGORIES,
  month: '2025-03',
  lastCategory: { expense: 'cat_food', income: 'cat_salary' },
  editing: null,
  currencySymbol: '$',
  maxDate: '2025-03-15',
};

let host;
let cb;
let form;

const q = (sel) => {
  const el = host.querySelector(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el;
};
const setValue = (sel, value) => {
  const el = q(sel);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const key = (sel, k) => q(sel).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const submit = () => q('form.tx-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const newRow = () => q('.field__inline');
const newInput = () => q('[aria-label="New category name"]');

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  host = document.createElement('div');
  document.body.append(host);
  cb = {
    onSubmit: vi.fn(() => true),
    onCancelEdit: vi.fn(),
    onAddCategory: vi.fn((name, type) => ({ id: `cat_${name.toLowerCase()}`, name, type, color: '#000', builtIn: false })),
  };
  form = createTransactionForm(host, cb);
  form.update(base);
});

afterEach(() => {
  host.remove();
  vi.useRealTimers();
});

describe('inline "new category"', () => {
  it('positive: choosing "+ New category…" reveals the inline row and focuses it; Add commits and selects the new category', () => {
    expect(newRow().hidden).toBe(true);
    setValue('#tx-category', '__new__');
    expect(newRow().hidden).toBe(false);
    expect(document.activeElement).toBe(newInput());

    // The parent answers with the created record (and would re-render categories).
    cb.onAddCategory.mockImplementation((name, type) => {
      const cat = { id: 'cat_pets', name, type, color: '#000', builtIn: false };
      form.update({ ...base, categories: [...DEFAULT_CATEGORIES, cat] });
      return cat;
    });
    newInput().value = 'Pets';
    newRow().querySelector('.btn:not(.btn--ghost)').click();
    expect(cb.onAddCategory).toHaveBeenCalledWith('Pets', 'expense');
    expect(newRow().hidden).toBe(true);
    expect(q('#tx-category').value).toBe('cat_pets');
    expect(document.activeElement).toBe(q('#tx-amount')); // empty amount -> back to amount
  });

  it('positive: Enter in the new-category field commits (without submitting the form); focus goes to description when an amount is typed', () => {
    setValue('#tx-amount', '10');
    setValue('#tx-category', '__new__');
    newInput().value = 'Garden';
    key('[aria-label="New category name"]', 'Enter');
    expect(cb.onAddCategory).toHaveBeenCalledWith('Garden', 'expense');
    expect(cb.onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(q('#tx-description'));
  });

  it('positive: Escape (or Cancel) hides the row and restores the previously selected category', () => {
    setValue('#tx-category', 'cat_transport');
    setValue('#tx-category', '__new__');
    key('[aria-label="New category name"]', 'Escape');
    expect(newRow().hidden).toBe(true);
    expect(q('#tx-category').value).toBe('cat_transport');
    expect(document.activeElement).toBe(q('#tx-category'));

    setValue('#tx-category', '__new__');
    newRow().querySelector('.btn--ghost').click();
    expect(newRow().hidden).toBe(true);
    expect(q('#tx-category').value).toBe('cat_transport');
    expect(cb.onAddCategory).not.toHaveBeenCalled();
  });

  it('negative: an empty name is not committed — the field just keeps focus', () => {
    setValue('#tx-category', '__new__');
    newInput().value = '   ';
    key('[aria-label="New category name"]', 'Enter');
    expect(cb.onAddCategory).not.toHaveBeenCalled();
    expect(newRow().hidden).toBe(false);
    expect(document.activeElement).toBe(newInput());
  });

  it('negative: when the parent refuses the category (returns null) the row closes and the old selection is restored', () => {
    cb.onAddCategory.mockReturnValue(null);
    setValue('#tx-category', 'cat_health');
    setValue('#tx-category', '__new__');
    newInput().value = 'Nope';
    key('[aria-label="New category name"]', 'Enter');
    expect(newRow().hidden).toBe(true);
    expect(q('#tx-category').value).toBe('cat_health');
  });

  it('edge: submitting the form while the row is open commits the category instead of the transaction', () => {
    setValue('#tx-amount', '5');
    setValue('#tx-category', '__new__');
    newInput().value = 'Books';
    submit();
    expect(cb.onAddCategory).toHaveBeenCalledWith('Books', 'expense');
    expect(cb.onSubmit).not.toHaveBeenCalled();
  });

  it('edge: other keys in the new-category field are left alone', () => {
    setValue('#tx-category', '__new__');
    newInput().value = 'Abc';
    key('[aria-label="New category name"]', 'a');
    expect(newRow().hidden).toBe(false);
    expect(cb.onAddCategory).not.toHaveBeenCalled();
  });

  it('edge: the new-category row follows the active type (income categories for income)', () => {
    q('#tx-type-income').checked = true;
    q('#tx-type-income').dispatchEvent(new Event('change'));
    setValue('#tx-category', '__new__');
    newInput().value = 'Royalties';
    key('[aria-label="New category name"]', 'Enter');
    expect(cb.onAddCategory).toHaveBeenCalledWith('Royalties', 'income');
  });
});

describe('validation and submit', () => {
  it('negative: an invalid amount shows an error, focuses and selects the field, and does not submit', () => {
    setValue('#tx-amount', 'abc');
    submit();
    expect(q('#tx-amount-error').textContent).toMatch(/positive amount/);
    expect(q('#tx-amount').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(q('#tx-amount'));
    expect(cb.onSubmit).not.toHaveBeenCalled();
    for (const bad of ['', '0', '-5', '1,2,3']) {
      setValue('#tx-amount', bad);
      submit();
    }
    expect(cb.onSubmit).not.toHaveBeenCalled();
  });

  it('negative: a future date is rejected with its own message', () => {
    setValue('#tx-amount', '10');
    setValue('#tx-date', '2025-03-16');
    submit();
    expect(q('#tx-date-error').textContent).toBe('Date cannot be in the future');
    expect(q('#tx-date').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(q('#tx-date'));
    expect(cb.onSubmit).not.toHaveBeenCalled();
    expect(q('#tx-date').max).toBe('2025-03-15');
  });

  it('edge: a cleared date falls back to the month default before submitting', () => {
    setValue('#tx-amount', '10');
    q('#tx-date').value = '';
    submit();
    expect(cb.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ date: '2025-03-15', amount: 1000 }), null);
  });

  it('positive: a successful submit clears amount + description and refocuses the amount', () => {
    setValue('#tx-amount', '12.5');
    setValue('#tx-description', 'Lunch');
    submit();
    expect(cb.onSubmit).toHaveBeenCalledWith({ type: 'expense', amount: 1250, categoryId: 'cat_food', description: 'Lunch', date: '2025-03-15' }, null);
    expect(q('#tx-amount').value).toBe('');
    expect(q('#tx-description').value).toBe('');
    expect(document.activeElement).toBe(q('#tx-amount'));
  });

  it('negative: when the parent rejects the submit (returns false) the typed values are kept', () => {
    cb.onSubmit.mockReturnValue(false);
    setValue('#tx-amount', '12.5');
    setValue('#tx-description', 'Lunch');
    submit();
    expect(q('#tx-amount').value).toBe('12.5');
    expect(q('#tx-description').value).toBe('Lunch');
  });

  it('edge: the error clears again on the next valid submit', () => {
    setValue('#tx-amount', 'x');
    submit();
    setValue('#tx-amount', '3');
    submit();
    expect(q('#tx-amount-error').textContent).toBe('');
    expect(q('#tx-amount').getAttribute('aria-invalid')).toBe('false');
  });
});

describe('edit mode', () => {
  const tx = { id: 'tx1', type: 'income', amount: 300000, categoryId: 'cat_freelance', description: 'Invoice', date: '2025-03-02' };

  it('positive: entering edit mode fills every field, switches copy and focuses the amount', () => {
    form.update({ ...base, editing: tx });
    expect(q('.panel__title').textContent).toBe('Edit transaction');
    expect(q('#tx-type-income').checked).toBe(true);
    expect(q('#tx-amount').value).toBe('3000.00');
    expect(q('#tx-category').value).toBe('cat_freelance');
    expect(q('#tx-description').value).toBe('Invoice');
    expect(q('#tx-date').value).toBe('2025-03-02');
    expect(q('button[type=submit]').textContent).toBe('Save changes');
    expect(host.querySelector('.tx-panel--editing')).not.toBeNull();
    expect(document.activeElement).toBe(q('#tx-amount'));
    const cancel = [...host.querySelectorAll('.tx-form__actions .btn')].find((b) => b.textContent === 'Cancel');
    expect(cancel.hidden).toBe(false);
  });

  it('positive: saving passes the editing id and keeps the values in place', () => {
    form.update({ ...base, editing: tx });
    setValue('#tx-amount', '3100');
    submit();
    expect(cb.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 310000, type: 'income' }), 'tx1');
    expect(q('#tx-amount').value).toBe('3100'); // the parent decides when to leave edit mode
  });

  it('positive: Cancel reports back, and leaving edit mode resets the form to add mode', () => {
    form.update({ ...base, editing: tx });
    [...host.querySelectorAll('.tx-form__actions .btn')].find((b) => b.textContent === 'Cancel').click();
    expect(cb.onCancelEdit).toHaveBeenCalledTimes(1);
    form.update({ ...base, editing: null });
    expect(q('.panel__title').textContent).toBe('Add transaction');
    expect(q('#tx-amount').value).toBe('');
    expect(q('#tx-date').value).toBe('2025-03-15');
    expect(host.querySelector('.tx-panel--editing')).toBeNull();
    expect(q('button[type=submit]').textContent).toBe('Add income'); // type stays as it was
  });

  it('edge: switching to a different record while editing re-fills the form', () => {
    form.update({ ...base, editing: tx });
    form.update({ ...base, editing: { ...tx, id: 'tx2', amount: 500, description: 'Other', type: 'expense', categoryId: 'cat_food' } });
    expect(q('#tx-amount').value).toBe('5.00');
    expect(q('#tx-description').value).toBe('Other');
    expect(q('#tx-type-expense').checked).toBe(true);
  });

  it('edge: a record whose category no longer exists falls back to the first category of its type', () => {
    form.update({ ...base, editing: { ...tx, categoryId: 'cat_gone' } });
    expect(q('#tx-category').value).toBe('cat_salary');
  });

  it('edge: the selected month changing while editing does not disturb the record date', () => {
    form.update({ ...base, editing: tx });
    form.update({ ...base, editing: tx, month: '2025-01' });
    expect(q('#tx-date').value).toBe('2025-03-02');
  });
});

describe('month / date defaults', () => {
  it('positive: a month change re-defaults an untouched date, but a user-chosen date survives within the same month', () => {
    form.update({ ...base, month: '2025-01' });
    expect(q('#tx-date').value).toBe('2025-01-01');
    form.update({ ...base, month: '2025-03' });
    expect(q('#tx-date').value).toBe('2025-03-15');
    setValue('#tx-date', '2025-03-10');
    form.update({ ...base, month: '2025-03' }); // re-render, same month
    expect(q('#tx-date').value).toBe('2025-03-10');
    form.update({ ...base, month: '2025-02' }); // month change wins
    expect(q('#tx-date').value).toBe('2025-02-01');
  });

  it('positive: focusAmount() and the currency prefix', () => {
    q('#tx-amount').blur();
    form.focusAmount();
    expect(document.activeElement).toBe(q('#tx-amount'));
    form.update({ ...base, currencySymbol: '€' });
    expect(q('.field__prefix').textContent).toBe('€');
  });
});
