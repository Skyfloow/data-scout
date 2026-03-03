import { ProductMetrics } from '../types';

export function resolveEffectivePrice(metrics: Partial<ProductMetrics>): number | undefined {
  const buyBoxPrice = metrics.buyBox?.price;
  if (buyBoxPrice && buyBoxPrice > 0) return buyBoxPrice;
  if (metrics.itemPrice && metrics.itemPrice > 0) return metrics.itemPrice;
  if (metrics.price && metrics.price > 0) return metrics.price;
  return undefined;
}

export function syncMetricsPriceFromBuyBox(
  metrics: Partial<ProductMetrics>,
  observedAtIso: string
): Partial<ProductMetrics> {
  const next: Partial<ProductMetrics> = { ...metrics };

  if (next.buyBox?.price && next.buyBox.price > 0) {
    next.price = next.buyBox.price;
    next.itemPrice = next.buyBox.price;
    next.buyBox = {
      ...next.buyBox,
      observedAt: next.buyBox.observedAt || observedAtIso,
    };
  } else if (next.price && next.price > 0) {
    next.itemPrice = next.itemPrice && next.itemPrice > 0 ? next.itemPrice : next.price;
    if (next.buyBox) {
      next.buyBox = {
        ...next.buyBox,
        price: next.buyBox.price && next.buyBox.price > 0 ? next.buyBox.price : next.price,
        observedAt: next.buyBox.observedAt || observedAtIso,
      };
    }
  } else if (next.itemPrice && next.itemPrice > 0) {
    next.price = next.itemPrice;
  }

  if (next.price && next.price > 0) {
    next.priceObservedAt = observedAtIso;
  }
  if (next.itemPrice && next.itemPrice > 0) {
    next.itemPriceObservedAt = observedAtIso;
  }

  return next;
}
