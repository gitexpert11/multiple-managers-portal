/** "#rrggbb" -> "rgba(r, g, b, alpha)"; anything else is returned unchanged. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1] as string, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Read a design token (CSS custom property) as currently applied to the page.
 * Tokens are defined on <html> (and switched by [data-theme]), so reading them
 * there needs no element ref. Falls back when unavailable (e.g. in jsdom).
 */
export function cssToken(name: string, fallback: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
