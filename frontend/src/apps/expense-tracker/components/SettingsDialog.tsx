import { useRef } from 'react';
import { Dialog } from '@shared/ui/Dialog';
import { Icon } from '@shared/ui/Icon';
import { listCurrencies } from '../lib/money';
import type { Category, Preferences } from '../types';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  preferences: Preferences;
  categories: Category[];
  onPreferences: (patch: Partial<Preferences>) => void;
  onExport: () => void;
  onImport: (data: unknown) => void;
  onReset: () => void;
  onDeleteCategory: (id: string) => void;
  onRenameCategory: (id: string, name: string) => void;
}

/**
 * Settings dialog: currency, manage categories, export / import / reset.
 * (The light/dark theme is a workspace-level setting, chosen in the tab strip.)
 * Because all data lives in this browser, export/import is the user's backup.
 */
export function SettingsDialog({ open, onClose, preferences, categories, onPreferences, onExport, onImport, onReset, onDeleteCategory, onRenameCategory }: SettingsDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFileChange() {
    const input = fileRef.current;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      onImport(JSON.parse(text));
    } catch {
      onImport(null);
    } finally {
      if (input) input.value = '';
    }
  }

  const item = (c: Category) => (
    <li key={c.id} className="category-list__item">
      <span className="swatch" style={{ background: c.color }} />
      <span className="category-list__name">{c.name}</span>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label={`Rename ${c.name}`}
        onClick={() => {
          const name = window.prompt('Rename category', c.name);
          if (name && name.trim() && name.trim() !== c.name) onRenameCategory(c.id, name.trim());
        }}
      >
        <Icon name="edit" size={14} />
      </button>
      {!c.builtIn && (
        <button
          type="button"
          className="icon-btn icon-btn--sm icon-btn--danger"
          aria-label={`Delete ${c.name}`}
          onClick={() => {
            if (window.confirm(`Delete category "${c.name}"? Its transactions move to "Other".`)) onDeleteCategory(c.id);
          }}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </li>
  );

  return (
    <Dialog open={open} onClose={onClose} className="dialog" aria-labelledby="settings-title" data-testid="settings-dialog">
      <div className="dialog__head">
        <h2 id="settings-title" className="panel__title">
          Settings
        </h2>
        <button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="dialog__body">
        <div className="field">
          <label className="field__label" htmlFor="pref-currency">
            Currency
          </label>
          <select id="pref-currency" className="field__input" value={preferences.currency} onChange={(e) => onPreferences({ currency: e.target.value })}>
            {listCurrencies().map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <h3 className="dialog__section">Categories</h3>
        <p className="panel__hint">Deleting a category moves its transactions to "Other".</p>
        <ul className="category-list">
          <li className="category-list__group">Expense</li>
          {categories.filter((c) => c.type === 'expense').map(item)}
          <li className="category-list__group">Income</li>
          {categories.filter((c) => c.type === 'income').map(item)}
        </ul>
        <h3 className="dialog__section">Your data</h3>
        <p className="panel__hint">Everything is stored only in this browser. Export a backup before clearing site data or switching devices.</p>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onExport}>
            Export JSON
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import JSON file" onChange={onFileChange} />
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (window.confirm('Delete ALL transactions and custom categories? This cannot be undone.')) {
                onReset();
                onClose();
              }
            }}
          >
            Delete all data
          </button>
        </div>
      </div>
    </Dialog>
  );
}
