import { describe, expect, it } from 'vitest';
import { CURRENCIES, DEFAULT_CURRENCY, centsToInput, currencySymbol, formatMoney, formatNumber, formatPercent, isCurrency, listCurrencies, parseAmount } from '../src/lib/money.js';

describe('parseAmount', () => {
  it('parses common inputs into cents', () => {
    expect(parseAmount('12')).toBe(1200);
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('.5')).toBe(50);
    expect(parseAmount('1,234.56')).toBe(123456);
    expect(parseAmount('$25')).toBe(2500);
    expect(parseAmount(' 7 ')).toBe(700);
    expect(parseAmount('0')).toBe(0);
  });

  it('negative: rejects junk', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('1.234')).toBeNull(); // more than two decimals
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats money, optionally compact or in whole units', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(1234567, { compact: true })).toBe('$12.3K');
    expect(formatMoney(200000, { wholeUnits: true })).toBe('$2,000');
    expect(formatMoney(NaN)).toBe('$0.00');
    expect(centsToInput(1250)).toBe('12.50');
  });

  it('formats in any supported currency without converting the amount', () => {
    expect(DEFAULT_CURRENCY).toBe('USD');
    expect(CURRENCIES.map((c) => c.code)).toEqual(['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'BRL']);
    expect(listCurrencies()).toEqual(CURRENCIES);
    expect(listCurrencies()).not.toBe(CURRENCIES);
    expect(isCurrency('EUR')).toBe(true);
    expect(isCurrency('usd')).toBe(false);
    expect(isCurrency('XXX')).toBe(false);
    expect(formatMoney(123456, { currency: 'EUR' })).toBe('€1,234.56');
    expect(formatMoney(123456, { currency: 'GBP' })).toBe('£1,234.56');
    expect(formatMoney(123456, { currency: 'INR' })).toBe('₹1,234.56');
    expect(formatMoney(123456, { currency: 'JPY' })).toBe('¥1,235'); // zero-decimal currency
    expect(formatMoney(123456, { currency: 'CHF' })).toBe('CHF\u00a01,234.56'); // Intl uses a non-breaking space
    expect(formatMoney(1234567, { currency: 'EUR', compact: true })).toBe('€12.3K');
    expect(formatMoney(200000, { currency: 'GBP', wholeUnits: true })).toBe('£2,000');
  });

  it('currencySymbol gives the symbol Intl would print, or the code', () => {
    expect(currencySymbol()).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('CAD')).toBe('CA$');
    expect(currencySymbol('CHF')).toBe('CHF');
    expect(currencySymbol('XYZ')).toBe('XYZ');
    expect(currencySymbol('EUR', 'zz-!!')).toBe('EUR');
  });

  it('formats counts and percentages', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1.239, { maximumFractionDigits: 2 })).toBe('1.24');
    expect(formatPercent(0.0123)).toBe('1.23%');
    expect(formatPercent(0.5, { digits: 0 })).toBe('50%');
    expect(formatPercent(undefined)).toBe('0.00%');
  });

  it('negative: falls back to plain formatting for an unusable locale', () => {
    expect(formatMoney(1250, { locale: 'zz-!!' })).toBe('USD 12.50');
    expect(formatMoney(1250, { locale: 'zz-!!', currency: 'EUR', wholeUnits: true })).toBe('EUR 13');
    expect(formatNumber(12.6, { locale: 'zz-!!' })).toBe('13');
    expect(formatPercent(0.5, { locale: 'zz-!!' })).toBe('50.00%');
  });
});
