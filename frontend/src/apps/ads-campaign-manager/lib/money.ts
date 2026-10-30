/**
 * Money helpers. Budgets, spend and sales are stored as integer cents so sums
 * never drift (same convention as the Expense Tracker).
 */

export interface CurrencyOption {
  code: string;
  label: string;
}

/** Currencies offered by the display-currency switcher. Amounts are never converted: the code only changes how they are shown. */
export const CURRENCIES: CurrencyOption[] = [
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
export const DEFAULT_CURRENCY = 'USD';

export function isCurrency(code: unknown): code is string {
  return typeof code === 'string' && CURRENCIES.some((c) => c.code === code);
}

/** The symbol Intl uses for a currency in a locale ("$", "€", "CA$"), falling back to the code. */
export function currencySymbol(currency: string = DEFAULT_CURRENCY, locale = 'en-US'): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(1);
    return parts.find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

/**
 * Parse user-entered text into integer cents.
 * Accepts "12", "12.5", "12.50", ".5", "1,234.56", "$25".
 * @returns cents, or null if the input is not a non-negative amount
 */
export function parseAmount(text: unknown): number | null {
  if (text == null) return null;
  const s = String(text)
    .trim()
    .replace(/[\s,$]/g, '');
  if (!s || !/^\d*(\.\d*)?$/.test(s) || s === '.') return null;
  const [whole = '0', frac = ''] = s.split('.');
  if (frac.length > 2) return null;
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Integer cents -> "12.50" (for prefilling inputs). */
export function centsToInput(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

export interface MoneyFormatOptions {
  currency?: string;
  locale?: string;
  compact?: boolean;
  wholeUnits?: boolean;
}

/**
 * Format minor units (cents) in a currency. Amounts are stored as hundredths
 * whatever the display currency, so switching currency re-labels, never converts.
 */
export function formatMoney(cents: number, { currency = DEFAULT_CURRENCY, locale = 'en-US', compact = false, wholeUnits = false }: MoneyFormatOptions = {}): string {
  const value = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : wholeUnits ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    }).format(value);
  } catch {
    return `${currency} ${wholeUnits ? Math.round(value) : value.toFixed(2)}`;
  }
}

export function formatNumber(n: number, { locale = 'en-US', maximumFractionDigits = 0 }: { locale?: string; maximumFractionDigits?: number } = {}): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(Number(n) || 0);
  } catch {
    return String(Math.round(Number(n) || 0));
  }
}

export function formatPercent(ratio: number, { locale = 'en-US', digits = 2 }: { locale?: string; digits?: number } = {}): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(ratio) || 0);
  } catch {
    return `${((Number(ratio) || 0) * 100).toFixed(digits)}%`;
  }
}
