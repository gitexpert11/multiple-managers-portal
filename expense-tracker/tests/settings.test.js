/**
 * Settings dialog component: currency, category management, JSON backup /
 * restore and "delete all". Browser prompts (confirm / prompt) are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/data/defaultCategories.js';
import { createSettings } from '../src/ui/settings.js';

const categories = [...DEFAULT_CATEGORIES, { id: 'cat_custom', name: 'Pets', type: 'expense', color: '#000', builtIn: false }];
const preferences = { currency: 'EUR', locale: 'en-US', theme: 'system' };

let host;
let cb;
let settings;

// jsdom's File lacks the Blob.text() the component uses; read it the old way.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

const q = (sel) => {
  const el = host.querySelector(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el;
};
const dialog = () => q('dialog.dialog');
const btn = (label) => [...host.querySelectorAll('.dialog__actions .btn')].find((b) => b.textContent === label);
const categoryItem = (name) => [...host.querySelectorAll('.category-list__item')].find((li) => li.querySelector('.category-list__name').textContent === name);

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  cb = {
    onPreferences: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onReset: vi.fn(),
    onDeleteCategory: vi.fn(),
    onRenameCategory: vi.fn(),
  };
  settings = createSettings(host, cb);
  settings.update({ preferences, categories });
});

afterEach(() => {
  host.remove();
  vi.restoreAllMocks();
});

describe('opening / closing', () => {
  it('positive: the gear button opens the dialog; X and a backdrop click close it', () => {
    expect(dialog().open).toBe(false);
    q('[aria-label="Open settings"]').click();
    expect(dialog().open).toBe(true);
    q('[aria-label="Close settings"]').click();
    expect(dialog().open).toBe(false);

    q('[aria-label="Open settings"]').click();
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true })); // target === dialog -> backdrop
    expect(dialog().open).toBe(false);
  });

  it('negative: a click inside the dialog body does not close it', () => {
    q('[aria-label="Open settings"]').click();
    q('.dialog__body').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog().open).toBe(true);
  });
});

describe('currency', () => {
  it('positive: reflects the saved currency and reports a change', () => {
    expect(q('#pref-currency').value).toBe('EUR');
    q('#pref-currency').value = 'INR';
    q('#pref-currency').dispatchEvent(new Event('change'));
    expect(cb.onPreferences).toHaveBeenCalledWith({ currency: 'INR' });
  });

  it('negative: there is no theme control here any more (it lives in the workspace tab strip)', () => {
    expect(host.querySelector('#pref-theme')).toBeNull();
  });
});

describe('categories', () => {
  it('positive: lists expense then income categories under group headings', () => {
    const groups = [...host.querySelectorAll('.category-list__group')].map((g) => g.textContent);
    expect(groups).toEqual(['Expense', 'Income']);
    const names = [...host.querySelectorAll('.category-list__name')].map((n) => n.textContent);
    expect(names[0]).toBe('Food & Dining');
    expect(names).toContain('Pets');
    expect(names).toContain('Salary');
    expect(names.indexOf('Pets')).toBeLessThan(names.indexOf('Salary'));
  });

  it('positive: renames a category through a prompt', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('  Animals  ');
    categoryItem('Pets').querySelector('[aria-label="Rename Pets"]').click();
    expect(window.prompt).toHaveBeenCalledWith('Rename category', 'Pets');
    expect(cb.onRenameCategory).toHaveBeenCalledWith('cat_custom', 'Animals');
  });

  it('negative: a cancelled, blank or unchanged rename is ignored', () => {
    const prompt = vi.spyOn(window, 'prompt');
    for (const answer of [null, '', '   ', 'Pets', ' Pets ']) {
      prompt.mockReturnValue(answer);
      categoryItem('Pets').querySelector('[aria-label="Rename Pets"]').click();
    }
    expect(cb.onRenameCategory).not.toHaveBeenCalled();
  });

  it('positive: deletes a custom category after confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    categoryItem('Pets').querySelector('[aria-label="Delete Pets"]').click();
    expect(window.confirm).toHaveBeenCalledWith('Delete category "Pets"? Its transactions move to "Other".');
    expect(cb.onDeleteCategory).toHaveBeenCalledWith('cat_custom');
  });

  it('negative: a declined confirmation deletes nothing', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    categoryItem('Pets').querySelector('[aria-label="Delete Pets"]').click();
    expect(cb.onDeleteCategory).not.toHaveBeenCalled();
  });

  it('edge: built-in categories can be renamed but never deleted', () => {
    const food = categoryItem('Food & Dining');
    expect(food.querySelector('[aria-label="Rename Food & Dining"]')).not.toBeNull();
    expect(food.querySelector('[aria-label="Delete Food & Dining"]')).toBeNull();
    expect(categoryItem('Salary').querySelector('.icon-btn--danger')).toBeNull();
  });

  it('edge: re-rendering with a new list replaces the old items (no duplicates)', () => {
    settings.update({ preferences, categories: DEFAULT_CATEGORIES });
    expect(categoryItem('Pets')).toBeUndefined();
    expect(host.querySelectorAll('.category-list__item')).toHaveLength(DEFAULT_CATEGORIES.length);
  });
});

describe('your data', () => {
  it('positive: Export JSON triggers the export callback', () => {
    btn('Export JSON').click();
    expect(cb.onExport).toHaveBeenCalledTimes(1);
  });

  it('positive: Import JSON reads the chosen file and hands the parsed object over, then clears the input', async () => {
    const input = q('input[type=file]');
    const clickSpy = vi.spyOn(input, 'click');
    btn('Import JSON').click();
    expect(clickSpy).toHaveBeenCalled();

    const file = new File([JSON.stringify({ transactions: [{ id: 't1' }], categories: [] })], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(cb.onImport).toHaveBeenCalled());
    expect(cb.onImport).toHaveBeenCalledWith({ transactions: [{ id: 't1' }], categories: [] });
    expect(input.value).toBe('');
  });

  it('negative: a file that is not JSON reports null instead of throwing', async () => {
    const input = q('input[type=file]');
    Object.defineProperty(input, 'files', { value: [new File(['{not json'], 'bad.json')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(cb.onImport).toHaveBeenCalledWith(null));
  });

  it('negative: a change event with no file selected does nothing', () => {
    const input = q('input[type=file]');
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(cb.onImport).not.toHaveBeenCalled();
  });

  it('positive: Delete all data asks for confirmation, resets and closes the dialog', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    q('[aria-label="Open settings"]').click();
    btn('Delete all data').click();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/cannot be undone/));
    expect(cb.onReset).toHaveBeenCalledTimes(1);
    expect(dialog().open).toBe(false);
  });

  it('negative: declining the confirmation keeps the data and the dialog', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    q('[aria-label="Open settings"]').click();
    btn('Delete all data').click();
    expect(cb.onReset).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
  });
});
