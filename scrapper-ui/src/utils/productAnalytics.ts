import { Product } from '../types';

const normalizeUrl = (url: string): string => url.toLowerCase().split('?')[0];

export const getProductIdentity = (product: Product): string => {
  const asin = product.metrics.asin?.trim();
  if (asin) return `asin:${asin.toUpperCase()}`;
  return `url:${normalizeUrl(product.url)}`;
};

export const getLatestUniqueProducts = (products: Product[]): Product[] => {
  const latestByKey = new Map<string, Product>();
  for (const product of products) {
    const key = getProductIdentity(product);
    const current = latestByKey.get(key);
    if (!current || new Date(product.scrapedAt).getTime() > new Date(current.scrapedAt).getTime()) {
      latestByKey.set(key, product);
    }
  }
  return Array.from(latestByKey.values());
};

export const getEffectivePrice = (product: Product): number => {
  return (
    product.metrics.priceUSD ||
    product.metrics.buyBox?.price ||
    product.metrics.itemPrice ||
    product.metrics.price ||
    0
  );
};
