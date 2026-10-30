/**
 * Money helpers.
 *
 * Amounts are stored as integers in minor units (cents) so that sums never
 * suffer from floating-point drift (0.1 + 0.2 !== 0.3).
 */

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'CAD', label: 'Canadian Dollar (CA$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'CNY', label: 'Chinese Yuan (¥)' },
  { code: 'BRL', label: 'Brazilian Real (R$)' },
];

export function listCurrencies() {
  return CURRENCIES.slice();
}

/**
 * Parse user-entered text into integer cents.
 *
 * Accepts "12", "12.5", "12.50", ".5", "1,234.56", "1.234,56", "12,50".
 * Heuristic for a lone comma: exactly three trailing digits => thousands
 * separator ("1,234"), otherwise a decimal separator ("12,50").
 *
 * @returns {number|null} cents, or null if the input is not a positive amount
 */
export function parseAmount(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/\s+/g, '');
  if (!s) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Whichever separator appears last is the decimal separator.
    const decimalSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    s = s.split(thousandsSep).join('');
    if (decimalSep === ',') s = s.replace(',', '.');
  } else if (hasComma) {
    const parts = s.split(',');
    const looksLikeThousands = parts.length >= 2 && parts.slice(1).every((p) => p.length === 3);
    s = looksLikeThousands ? parts.join('') : parts.join('.');
  }

  if (!/^\d*\.?\d*$/.test(s) || s === '.' || s === '') return null;

  const [whole = '0', frac = ''] = s.split('.');
  if (frac.length > 2) return null; // more precision than we store
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents;
}

/** Convert cents to a plain decimal string suitable for an input value ("12.50"). */
export function centsToInput(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const formatterCache = new Map();

function getFormatter(currency, locale) {
  const key = `${locale}|${currency}`;
  if (!formatterCache.has(key)) {
    let fmt;
    try {
      fmt = new Intl.NumberFormat(locale, { style: 'currency', currency });
    } catch {
      fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    }
    formatterCache.set(key, fmt);
  }
  return formatterCache.get(key);
}

/**
 * Format cents as a localized currency string.
 * @param {number} cents
 * @param {{currency?: string, locale?: string, signed?: boolean}} [opts]
 */
export function formatMoney(cents, { currency = 'USD', locale = 'en-US', signed = false } = {}) {
  const fmt = getFormatter(currency, locale);
  const value = (cents || 0) / 100;
  const out = fmt.format(Math.abs(value));
  if (value < 0) return `-${out}`;
  if (signed && value > 0) return `+${out}`;
  return out;
}
