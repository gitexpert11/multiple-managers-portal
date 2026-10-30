/**
 * Workspace theme: a single light / dark / system choice that applies to every
 * tab. It belongs to neither application, so it is persisted under its own
 * small localStorage key rather than inside either app's data.
 */

export const THEMES = ['system', 'light', 'dark'];
export const DEFAULT_THEME = 'system';
export const THEME_STORAGE_KEY = 'workspace-ng';
export const SCHEMA_VERSION = 1;

export function isTheme(value) {
  return THEMES.includes(value);
}

/** Set or clear `data-theme` on <html>; the stylesheets do the rest. */
export function applyTheme(doc, theme) {
  const docEl = doc.documentElement;
  if (!isTheme(theme) || theme === DEFAULT_THEME) docEl.removeAttribute('data-theme');
  else docEl.setAttribute('data-theme', theme);
}

/** Versioned, defensive persistence — same shape as the two app stores. */
export function createThemeStorage(backend = getDefaultBackend(), key = THEME_STORAGE_KEY) {
  return {
    key,
    /** @returns {string|null} the saved theme, or null if none/unusable */
    load() {
      if (!backend) return null;
      try {
        const raw = backend.getItem(key);
        if (!raw) return null;
        const envelope = JSON.parse(raw);
        if (!envelope || typeof envelope.version !== 'number' || envelope.version > SCHEMA_VERSION) return null;
        const theme = envelope.data?.theme;
        return isTheme(theme) ? theme : null;
      } catch {
        return null;
      }
    },
    /** @returns {boolean} whether the write succeeded */
    save(theme) {
      if (!backend || !isTheme(theme)) return false;
      try {
        backend.setItem(key, JSON.stringify({ version: SCHEMA_VERSION, savedAt: Date.now(), data: { theme } }));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        backend?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

function getDefaultBackend() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.getItem('__probe__');
      return window.localStorage;
    }
  } catch {
    /* fall through */
  }
  return null;
}

const OPTIONS = [
  { value: 'system', label: 'System', title: 'Match the system theme', icon: 'monitor' },
  { value: 'light', label: 'Light', title: 'Light theme', icon: 'sun' },
  { value: 'dark', label: 'Dark', title: 'Dark theme', icon: 'moon' },
];

/**
 * Segmented System / Light / Dark control (a radio group, so it is keyboard
 * and screen-reader friendly).
 * @param {HTMLElement} container
 * @param {{onChange: (theme: string) => void, doc?: Document}} opts
 */
export function createThemeSwitcher(container, { onChange, doc = container.ownerDocument }) {
  const inputs = [];
  const root = el(doc, 'div', { class: 'shell__theme', role: 'radiogroup', 'aria-label': 'Theme', 'data-testid': 'theme-switcher' });

  for (const opt of OPTIONS) {
    const id = `shell-theme-${opt.value}`;
    const input = el(doc, 'input', { type: 'radio', name: 'shell-theme', id, value: opt.value, class: 'shell__theme-input' });
    input.addEventListener('change', () => input.checked && onChange(opt.value));
    inputs.push(input);
    root.append(
      input,
      el(doc, 'label', { for: id, class: 'shell__theme-option', title: opt.title }, themeIcon(doc, opt.icon), el(doc, 'span', { class: 'shell__theme-label' }, opt.label)),
    );
  }
  container.append(root);

  return {
    root,
    update(theme) {
      for (const input of inputs) input.checked = input.value === theme;
    },
  };
}

function el(doc, tag, attrs = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
  }
  return node;
}

function themeIcon(doc, name) {
  const paths = {
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  };
  const span = doc.createElement('span');
  span.className = 'shell__theme-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  return span;
}
