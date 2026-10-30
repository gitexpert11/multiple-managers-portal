import { listCurrencies } from '../lib/money.js';
import { h, icon } from './dom.js';

/**
 * Settings dialog: currency, manage categories, export / import / reset.
 * (The light/dark theme is a workspace-level setting, chosen in the tab strip.)
 * Because all data lives in this browser, export/import is the user's backup.
 */
export function createSettings(container, { onPreferences, onExport, onImport, onReset, onDeleteCategory, onRenameCategory }) {
  let prefs = {};
  let categories = [];

  const currencySelect = h(
    'select',
    { id: 'pref-currency', class: 'field__input', onchange: () => onPreferences({ currency: currencySelect.value }) },
    ...listCurrencies().map((c) => h('option', { value: c.code }, c.label)),
  );

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'sr-only',
    'aria-label': 'Import JSON file',
    onchange: async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        onImport(JSON.parse(text));
      } catch {
        onImport(null);
      } finally {
        fileInput.value = '';
      }
    },
  });

  const categoryList = h('ul', { class: 'category-list' });

  const dialog = h(
    'dialog',
    { class: 'dialog', 'aria-labelledby': 'settings-title' },
    h(
      'div',
      { class: 'dialog__head' },
      h('h2', { id: 'settings-title', class: 'panel__title' }, 'Settings'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close settings', onclick: () => dialog.close() }, icon('x')),
    ),
    h(
      'div',
      { class: 'dialog__body' },
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pref-currency' }, 'Currency'), currencySelect),
      h('h3', { class: 'dialog__section' }, 'Categories'),
      h('p', { class: 'panel__hint' }, 'Deleting a category moves its transactions to "Other".'),
      categoryList,
      h('h3', { class: 'dialog__section' }, 'Your data'),
      h('p', { class: 'panel__hint' }, 'Everything is stored only in this browser. Export a backup before clearing site data or switching devices.'),
      h(
        'div',
        { class: 'dialog__actions' },
        h('button', { type: 'button', class: 'btn', onclick: onExport }, 'Export JSON'),
        h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'Import JSON'),
        fileInput,
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--danger',
            onclick: () => {
              if (window.confirm('Delete ALL transactions and custom categories? This cannot be undone.')) {
                onReset();
                dialog.close();
              }
            },
          },
          'Delete all data',
        ),
      ),
    ),
  );
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // backdrop click
  });

  const openBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Open settings', onclick: () => dialog.showModal?.() ?? dialog.setAttribute('open', '') }, icon('settings', 20));
  container.append(openBtn, dialog);

  function renderCategories() {
    const byType = (type) => categories.filter((c) => c.type === type);
    const item = (c) =>
      h(
        'li',
        { class: 'category-list__item' },
        h('span', { class: 'swatch', style: { background: c.color } }),
        h('span', { class: 'category-list__name' }, c.name),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn icon-btn--sm',
            'aria-label': `Rename ${c.name}`,
            onclick: () => {
              const name = window.prompt('Rename category', c.name);
              if (name && name.trim() && name.trim() !== c.name) onRenameCategory(c.id, name.trim());
            },
          },
          icon('edit', 14),
        ),
        !c.builtIn &&
          h(
            'button',
            {
              type: 'button',
              class: 'icon-btn icon-btn--sm icon-btn--danger',
              'aria-label': `Delete ${c.name}`,
              onclick: () => {
                if (window.confirm(`Delete category "${c.name}"? Its transactions move to "Other".`)) onDeleteCategory(c.id);
              },
            },
            icon('trash', 14),
          ),
      );
    categoryList.replaceChildren(
      h('li', { class: 'category-list__group' }, 'Expense'),
      ...byType('expense').map(item),
      h('li', { class: 'category-list__group' }, 'Income'),
      ...byType('income').map(item),
    );
  }

  return {
    update({ preferences, categories: cats }) {
      prefs = preferences;
      categories = cats;
      currencySelect.value = prefs.currency;
      renderCategories();
    },
  };
}
