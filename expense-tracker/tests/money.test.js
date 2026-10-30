import { describe, expect, it } from 'vitest';
import { centsToInput, formatMoney, parseAmount } from '../src/lib/money.js';

describe('parseAmount', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['.5', 50],
    ['0.01', 1],
    ['1,234.56', 123456],
    ['1.234,56', 123456],
    ['12,50', 1250],
    ['1,234', 123400],
    ['1,234,567', 123456700],
    ['  42  ', 4200],
    ['1 000.25', 100025],
  ])('parses %s -> %d cents', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([['', null], ['   ', null], ['abc', null], ['-5', null], ['0', null], ['0.00', null], ['12.345', null], ['.', null], [null, null], [undefined, null], ['1e5', null]])(
    'rejects %s',
    (input, expected) => {
      expect(parseAmount(input)).toBe(expected);
    },
  );
});

describe('centsToInput', () => {
  it('renders two decimals', () => {
    expect(centsToInput(1250)).toBe('12.50');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(100000)).toBe('1000.00');
    expect(centsToInput(-199)).toBe('-1.99');
  });

  it('round-trips through parseAmount', () => {
    for (const cents of [1, 99, 100, 1250, 999999]) {
      expect(parseAmount(centsToInput(cents))).toBe(cents);
    }
  });
});

describe('formatMoney', () => {
  it('formats USD by default', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
  });

  it('shows negatives with a leading minus', () => {
    expect(formatMoney(-1250)).toBe('-$12.50');
  });

  it('adds a plus sign when signed is requested', () => {
    expect(formatMoney(1250, { signed: true })).toBe('+$12.50');
    expect(formatMoney(0, { signed: true })).toBe('$0.00');
  });

  it('supports other currencies', () => {
    expect(formatMoney(1000, { currency: 'EUR', locale: 'en-US' })).toBe('€10.00');
  });

  it('falls back gracefully for an unknown currency code', () => {
    expect(() => formatMoney(100, { currency: 'NOPE' })).not.toThrow();
  });
});
