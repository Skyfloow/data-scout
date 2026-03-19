/**
 * Formats a number into a short string with K/M/B suffixes (e.g., 230000 -> 230K).
 */
export function formatCompactNumber(number: number): string {
  if (number === 0) return '0';
  if (!number || isNaN(number)) return '';

  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(number);
}

/**
 * Formats a number with standard thousand separators and optional decimal limits.
 */
export function formatStandardNumber(number: number, maxDecimals: number = 2): string {
  if (number === 0) return '0';
  if (!number || isNaN(number)) return '';

  return Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxDecimals,
  }).format(number);
}

/**
 * Formats a number as a USD currency string.
 */
export function formatCurrency(number: number, compact: boolean = false): string {
  if (number === 0) return '$0';
  if (!number || isNaN(number)) return '';

  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(number);
}

/**
 * Formats a number with a specific ISO currency code.
 */
export function formatCurrencyByCode(number: number, currencyCode: string): string {
  if (number === 0) return `0 ${currencyCode || ''}`.trim();
  if (!number || isNaN(number)) return '';
  const normalized = String(currencyCode || 'USD').toUpperCase();
  try {
    return Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalized,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${number.toFixed(2)} ${normalized}`;
  }
}
