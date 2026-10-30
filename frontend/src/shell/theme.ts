import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createStorage, type Storage, type StorageBackend } from '@shared/storage/createStorage';

/**
 * Workspace theme: a single light / dark / system choice that applies to every
 * tab. It belongs to no application, so it is persisted under its own small
 * localStorage key rather than inside any app's data.
 */

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'system';
export const THEME_STORAGE_KEY = 'workspace-ng';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** Set or clear `data-theme` on <html>; the stylesheets do the rest. */
export function applyTheme(doc: Document, theme: Theme): void {
  const docEl = doc.documentElement;
  if (!isTheme(theme) || theme === DEFAULT_THEME) docEl.removeAttribute('data-theme');
  else docEl.setAttribute('data-theme', theme);
}

export interface ThemeStorage {
  load(): Theme | null;
  save(theme: Theme): boolean;
  clear(): void;
}

/** Versioned, defensive persistence — same envelope shape as the app stores. */
export function createThemeStorage(backend?: StorageBackend | null, key = THEME_STORAGE_KEY): ThemeStorage {
  const storage: Storage<{ theme: Theme }> = backend === undefined ? createStorage(key) : createStorage(key, backend);
  return {
    load() {
      const theme = storage.load()?.theme;
      return isTheme(theme) ? theme : null;
    },
    save(theme) {
      if (!isTheme(theme)) return false;
      return storage.save({ theme });
    },
    clear: () => storage.clear(),
  };
}

export const ThemeContext = createContext<Theme>(DEFAULT_THEME);

/** The current workspace theme (components that draw with CSS variables re-render on change). */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Owns the theme for the shell: loads it from storage, applies it to <html>
 * before the first paint and persists every change.
 */
export function useThemeController(storage: ThemeStorage, initial?: Theme | null): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    const legacy = isTheme(initial) && initial !== DEFAULT_THEME ? initial : null;
    const loaded = storage.load() ?? legacy ?? DEFAULT_THEME;
    if (legacy && loaded === legacy) storage.save(loaded); // migrate once
    if (typeof document !== 'undefined') applyTheme(document, loaded);
    return loaded;
  });

  // Safety net (e.g. React StrictMode re-running the initializer); normally the
  // attribute is already in place by the time this runs.
  useEffect(() => {
    applyTheme(document, theme);
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme) => {
      const value = isTheme(next) ? next : DEFAULT_THEME;
      // Apply to <html> *before* React re-renders so components that read design
      // tokens during render (the charts) pick up the new colours immediately.
      applyTheme(document, value);
      setThemeState(value);
      storage.save(value);
    },
    [storage],
  );

  return [theme, setTheme];
}
