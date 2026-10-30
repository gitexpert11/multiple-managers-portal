/** Generate a unique id, preferring the platform's crypto UUID. */
export function uid(prefix = '') {
  let id;
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    id = c.randomUUID();
  } else {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return prefix ? `${prefix}_${id}` : id;
}
