import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, SCHEMA_VERSION, THEME_STORAGE_KEY, THEMES, applyTheme, createThemeStorage, createThemeSwitcher, isTheme } from '../src/theme.js';

function memoryBackend() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => void map.delete(k) };
}

afterEach(() => document.documentElement.removeAttribute('data-theme'));

describe('theme basics', () => {
  it('offers system, light and dark', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark']);
    expect(DEFAULT_THEME).toBe('system');
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('neon')).toBe(false);
  });

  it('applies the theme via <html data-theme>, clearing it for "system" or junk', () => {
    applyTheme(document, 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme(document, 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyTheme(document, 'system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    applyTheme(document, 'neon');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('theme storage', () => {
  it('uses its own key, separate from both apps', () => {
    expect(THEME_STORAGE_KEY).toBe('workspace-ng');
    expect(['expense-tracker-ng', 'todo-manager-ng']).not.toContain(THEME_STORAGE_KEY);
  });

  it('round-trips through a versioned envelope', () => {
    const backend = memoryBackend();
    const storage = createThemeStorage(backend);
    expect(storage.load()).toBeNull();
    expect(storage.save('dark')).toBe(true);
    expect(JSON.parse(backend.getItem(THEME_STORAGE_KEY))).toMatchObject({ version: SCHEMA_VERSION, data: { theme: 'dark' } });
    expect(storage.load()).toBe('dark');
    storage.clear();
    expect(storage.load()).toBeNull();
  });

  it('refuses to save junk and returns null for unusable data', () => {
    const backend = memoryBackend();
    const storage = createThemeStorage(backend);
    expect(storage.save('neon')).toBe(false);
    backend.setItem(THEME_STORAGE_KEY, '{broken');
    expect(storage.load()).toBeNull();
    backend.setItem(THEME_STORAGE_KEY, JSON.stringify({ version: 1, data: { theme: 'neon' } }));
    expect(storage.load()).toBeNull();
    backend.setItem(THEME_STORAGE_KEY, JSON.stringify({ version: 99, data: { theme: 'dark' } }));
    expect(storage.load()).toBeNull();
  });

  it('tolerates a backend that throws', () => {
    const storage = createThemeStorage({
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(storage.load()).toBeNull();
    expect(storage.save('dark')).toBe(false);
    expect(() => storage.clear()).not.toThrow();
  });

  it('uses the real localStorage by default', () => {
    window.localStorage.clear();
    const storage = createThemeStorage();
    storage.save('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toContain('"theme":"light"');
    storage.clear();
  });
});

describe('theme switcher', () => {
  it('renders a radio group with the three options and reports changes', () => {
    const host = document.createElement('div');
    document.body.append(host); // radios only dispatch `change` on click when connected
    const chosen = [];
    const switcher = createThemeSwitcher(host, { onChange: (t) => chosen.push(t) });
    const inputs = [...host.querySelectorAll('input[type=radio]')];
    expect(inputs.map((i) => i.value)).toEqual(['system', 'light', 'dark']);
    expect(host.querySelector('[role=radiogroup]').getAttribute('aria-label')).toBe('Theme');
    expect([...host.querySelectorAll('.shell__theme-label')].map((l) => l.textContent)).toEqual(['System', 'Light', 'Dark']);

    switcher.update('dark');
    expect(inputs.map((i) => i.checked)).toEqual([false, false, true]);

    inputs[1].click();
    expect(chosen).toEqual(['light']);
    expect(inputs[1].checked).toBe(true);
    host.remove();
  });
});

describe('theme storage without localStorage', () => {
  it('edge: when localStorage is blocked the default storage reports nothing saved and never throws', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try {
      const storage = createThemeStorage();
      expect(storage.load()).toBeNull();
      expect(storage.save('dark')).toBe(false);
      expect(() => storage.clear()).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', desc);
    }
  });
});
