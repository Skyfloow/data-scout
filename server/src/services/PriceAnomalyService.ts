import { PriceSnapshot, Product } from '../types';

const MIN_HISTORY_POINTS = 5;
const HISTORY_WINDOW = 12;
const DEVIATION_THRESHOLD = 0.35;

const readSnapshotPrice = (snapshot: PriceSnapshot): number => {
  return snapshot.itemPrice && snapshot.itemPrice > 0 ? snapshot.itemPrice : snapshot.price;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};

export function stabilizeProductPriceWithHistory(product: Product, history: PriceSnapshot[]): Product {
  const currentItemPrice = product.metrics.itemPrice || product.metrics.price;
  if (!currentItemPrice || currentItemPrice <= 0) return product;

  const recent = history
    .map(readSnapshotPrice)
    .filter((p) => p > 0)
    .slice(-HISTORY_WINDOW);

  if (recent.length < MIN_HISTORY_POINTS) return product;

  const baselineMedian = median(recent);
  if (baselineMedian <= 0) return product;

  const deviation = Math.abs(currentItemPrice - baselineMedian) / baselineMedian;
  if (deviation <= DEVIATION_THRESHOLD) return product;

  const adjusted = { ...product, metrics: { ...product.metrics } };

  adjusted.metrics.priceAnomalyDetected = true;
  adjusted.metrics.priceAnomalyReason = `Raw item price ${currentItemPrice.toFixed(2)} deviates ${(deviation * 100).toFixed(1)}% from median ${baselineMedian.toFixed(2)}.`;
  adjusted.metrics.rawPrice = adjusted.metrics.price;
  adjusted.metrics.rawItemPrice = adjusted.metrics.itemPrice;
  adjusted.metrics.rawLandedPrice = adjusted.metrics.landedPrice;
  // Keep live prices untouched for storage/analytics.
  // We only flag anomaly and preserve raw fields for diagnostics.

  return adjusted;
}
