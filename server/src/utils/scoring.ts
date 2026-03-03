import { Product } from '../types';

/**
 * Calculates a data quality score for a scraped product.
 * Returns a score out of 100 based on the presence of key attributes.
 */
export function calculateDataQualityScore(product: Product): number {
  let score = 0;
  const m = product.metrics;

  if (m.price && m.price > 0) score += 30;
  if (product.title && !product.title.includes('Unknown') && product.title.length > 5) score += 20;
  if (m.currency && m.currency.length === 3) score += 15;
  if (!m.originalPrice || (m.originalPrice >= (m.price || 0))) score += 15;
  if (m.asin) score += 10;
  if (m.brand || m.offers?.length || m.bsrCategories?.length) score += 10;

  return score;
}
