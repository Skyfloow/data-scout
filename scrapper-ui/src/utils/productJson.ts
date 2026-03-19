import { Product, ProductMetrics } from '../types';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const isNil = (value: unknown): value is null | undefined => value === null || value === undefined;

const pickFirst = <T>(...values: Array<T | null | undefined>): T | undefined => {
  for (const value of values) {
    if (!isNil(value)) {
      return value;
    }
  }
  return undefined;
};

function cleanJsonValue(value: unknown): JsonValue | undefined {
  if (isNil(value)) return undefined;
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => cleanJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
    return cleaned.length ? cleaned : undefined;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, cleanJsonValue(entry)] as const)
      .filter(([, entry]) => entry !== undefined);

    if (!entries.length) return undefined;
    return Object.fromEntries(entries) as JsonValue;
  }

  return undefined;
}

function normalizeAmazon(metrics: ProductMetrics) {
  const amazon = metrics.amazonMetrics;
  const asin = pickFirst(amazon?.asin, metrics.asin);
  const buyBoxRaw = pickFirst(amazon?.buyBox, metrics.buyBox);
  const buyBox = cleanJsonValue(
    buyBoxRaw
      ? {
          sellerName: buyBoxRaw.sellerName,
          isFBA: buyBoxRaw.isFBA,
          isAmazon: buyBoxRaw.isAmazon,
          sellerRatingPercent: buyBoxRaw.sellerRatingPercent,
          sellerRatingsCount: buyBoxRaw.sellerRatingsCount,
        }
      : undefined
  );
  const offers = pickFirst(amazon?.offers, metrics.offers);

  return cleanJsonValue({
    asin,
    bestSellerRank: pickFirst(amazon?.bestSellerRank, metrics.bestSellerRank),
    bsrCategories: pickFirst(amazon?.bsrCategories, metrics.bsrCategories),
    badges: {
      isPrime: pickFirst(amazon?.isPrime, metrics.isPrime),
      isAmazonChoice: pickFirst(amazon?.isAmazonChoice, metrics.isAmazonChoice),
      isBestSeller: pickFirst(amazon?.isBestSeller, metrics.isBestSeller),
      isClimateFriendly: pickFirst(amazon?.isClimateFriendly, metrics.isClimateFriendly),
    },
    sellerCount: pickFirst(amazon?.sellerCount, metrics.sellerCount),
    offers,
    newOffersCount: pickFirst(amazon?.newOffersCount, metrics.newOffersCount),
    usedOffersCount: pickFirst(amazon?.usedOffersCount, metrics.usedOffersCount),
    collectibleOffersCount: pickFirst(amazon?.collectibleOffersCount, metrics.collectibleOffersCount),
    lightningDeal: pickFirst(amazon?.lightningDeal, metrics.lightningDeal),
    subscribeAndSavePrice: pickFirst(amazon?.subscribeAndSavePrice, metrics.subscribeAndSavePrice),
    subscribeAndSavePercent: pickFirst(amazon?.subscribeAndSavePercent, metrics.subscribeAndSavePercent),
    buyBox,
  });
}

function normalizeEtsy(metrics: ProductMetrics) {
  const etsy = metrics.etsyMetrics;
  return cleanJsonValue({
    shippingProfiles: pickFirst(etsy?.shippingProfiles, metrics.shippingProfiles),
    dispatchTime: pickFirst(etsy?.dispatchTime, metrics.dispatchTime),
    dispatchMinDays: pickFirst(etsy?.dispatchMinDays, metrics.dispatchMinDays),
    dispatchMaxDays: pickFirst(etsy?.dispatchMaxDays, metrics.dispatchMaxDays),
    madeToOrder: pickFirst(etsy?.madeToOrder, metrics.madeToOrder),
    materials: pickFirst(etsy?.materials, metrics.materials),
    tags: pickFirst(etsy?.tags, metrics.tags),
    isDigitalDownload: pickFirst(etsy?.isDigitalDownload, metrics.isDigitalDownload),
    shopAgeText: pickFirst(etsy?.shopAgeText, metrics.shopAgeText),
    shopAgeYears: pickFirst(etsy?.shopAgeYears, metrics.shopAgeYears),
    isStarSeller: pickFirst(etsy?.isStarSeller, metrics.isStarSeller),
    shopResponseRate: pickFirst(etsy?.shopResponseRate, metrics.shopResponseRate),
  });
}

export function normalizeProductForJson(product: Product) {
  const metrics = product.metrics;
  const buyBox = pickFirst(metrics.amazonMetrics?.buyBox, metrics.buyBox);
  const observedAt = pickFirst(
    buyBox?.observedAt,
    metrics.priceObservedAt,
    metrics.itemPriceObservedAt,
    product.scrapedAt
  );
  const price = pickFirst(metrics.price, metrics.itemPrice, buyBox?.price);
  const priceUsd = pickFirst(metrics.priceUSD, metrics.itemPriceUSD);

  const normalized = {
    id: product.id,
    title: product.title,
    marketplace: product.marketplace,
    url: product.url,
    scrapedAt: product.scrapedAt,
    scrapedBy: product.scrapedBy,
    dates: {
      observedAt,
      dateFirstAvailable: metrics.dateFirstAvailable,
    },
    metrics: {
      price: {
        amount: price,
        amountUsd: priceUsd,
        currency: metrics.currency,
        originalPrice: metrics.originalPrice,
        discountPercentage: metrics.discountPercentage,
        landedPrice: metrics.landedPrice,
        landedPriceUsd: metrics.landedPriceUSD,
      },
      quality: {
        rating: metrics.averageRating,
        reviewsCount: metrics.reviewsCount,
        dataQualityScore: metrics.dataQualityScore,
      },
      stock: {
        availability: metrics.availability,
        deliveryInfo: metrics.deliveryInfo,
      },
      catalog: {
        brand: metrics.brand,
        category: metrics.category,
        modelNumber: metrics.modelNumber,
        manufacturer: metrics.manufacturer,
        countryOfOrigin: metrics.countryOfOrigin,
        warranty: metrics.warranty,
      },
      media: {
        imageUrls: metrics.imageUrls,
      },
      features: metrics.features,
    },
    amazon: normalizeAmazon(metrics),
    etsy: normalizeEtsy(metrics),
  };

  return cleanJsonValue(normalized) ?? {};
}
