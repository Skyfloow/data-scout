/**
 * CurrencyService: Fetches EUR-based rates from ECB (European Central Bank) official XML feed.
 * Rates are cached in-memory and auto-refreshed every 24 hours.
 * All conversions are done through EUR as the pivot currency.
 *
 * Source: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 */

import { logger as baseLogger } from '../utils/logger';

const logger = baseLogger.child({ module: 'CurrencyService' });

// Rates relative to EUR: e.g., { USD: 1.09, GBP: 0.86 } means 1 EUR = 1.09 USD
let ratesFromEur: Record<string, number> = { USD: 1.09, EUR: 1.0 }; // Default fallback rates
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let refreshTimer: NodeJS.Timeout | null = null;

async function fetchRates(): Promise<void> {
  try {
    const response = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      logger.warn(`ECB fetch failed with status ${response.status}`);
      return;
    }

    const xml = await response.text();

    // Parse ECB XML format: <Cube currency="USD" rate="1.09"/>
    const currencyMatches = xml.matchAll(/currency="([A-Z]{3})"\s+rate="([\d.]+)"/g);
    const freshRates: Record<string, number> = { EUR: 1.0 };

    for (const match of currencyMatches) {
      const [, currency, rate] = match;
      freshRates[currency] = parseFloat(rate);
    }

    if (Object.keys(freshRates).length > 1) {
      ratesFromEur = freshRates;
      logger.info(`Rates refreshed at ${new Date().toISOString()}. Currencies: ${Object.keys(freshRates).length}`);
    }
  } catch (err: any) {
    logger.warn(`Failed to fetch ECB rates — ${err.message}. Using cached/fallback rates.`);
  }
}

export async function initCurrencyService(): Promise<void> {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  await fetchRates();
  refreshTimer = setInterval(fetchRates, REFRESH_INTERVAL_MS);
}

export function stopCurrencyService(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Convert an amount in any supported ISO currency to USD.
 * Returns the original amount if the currency is not recognized.
 */
export function convertToUSD(amount: number, currency: string): number {
  if (!amount || amount === 0) return 0;
  const curr = currency.toUpperCase();

  if (curr === 'USD') return parseFloat(amount.toFixed(2));
  
  const eurToOriginal = ratesFromEur[curr];
  const eurToUSD = ratesFromEur['USD'];

  if (!eurToOriginal || !eurToUSD) {
    // Currency not in ECB data — return as-is
    return parseFloat(amount.toFixed(2));
  }

  // Convert: original → EUR → USD
  const inEur = amount / eurToOriginal;
  const inUSD = inEur * eurToUSD;
  return parseFloat(inUSD.toFixed(2));
}
