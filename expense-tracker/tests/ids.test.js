import { afterEach, describe, expect, it } from 'vitest';
import { uid } from '../src/lib/ids.js';

const realCrypto = globalThis.crypto;
afterEach(() => Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true, writable: true }));

describe('uid', () => {
  it('positive: uses crypto.randomUUID with an optional prefix and is unique', () => {
    const a = uid('tx');
    const b = uid('tx');
    expect(a).toMatch(/^tx_[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
    expect(uid()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('edge: still produces unique, prefixed ids when crypto.randomUUID is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true, writable: true });
    const ids = new Set(Array.from({ length: 50 }, () => uid('cat')));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^cat_[0-9a-z]+-[0-9a-z]+$/);
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    expect(uid()).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  });
});
