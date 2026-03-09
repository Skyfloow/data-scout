export const METRICS_DEFINITIONS_VERSION = '1.0.0';

export const metricsDefinitions = {
  scope: {
    endpoint: '/api/metrics',
    entitySelection: 'latest unique products by asin/url',
    anomalyHistorySource: 'PriceHistoryService.getPriceHistoryBatch',
  },
  priceResolution: {
    effectiveLocalPriceOrder: ['buyBox.price', 'itemPrice', 'price'],
    effectiveUsdPriceOrder: ['priceUSD', 'itemPriceUSD', 'landedPriceUSD', 'convert(local,currency->USD)'],
  },
  globalMetrics: {
    totalProducts: 'count(raw stored products)',
    uniqueProducts: 'count(latest unique products)',
    averagePrice: 'mean(effectivePrice over products with price>0)',
    medianPrice: 'median(effectivePrice over products with price>0)',
    distributionBySource: 'count by marketplace',
    ratingsHistogram: 'count by round(averageRating)',
    dataCoveragePercent: 'round(avg(productCoverageScore)*100), 5 fields: title, effectivePrice, brand, imageUrl, availability',
    anomaliesCount: 'count(diffPct>0.30), diffPct=abs(latest-previous)/previous',
    stableProductsPercent: 'round((uniqueProducts-anomaliesCount)/uniqueProducts*100)',
    buyBoxCoveragePercent: 'round(products with buyBox.price>0 / uniqueProducts * 100)',
    discountedProductsPercent: 'round(products with discountPercentage>0 / uniqueProducts * 100)',
    primeProductsPercent: 'round(products with isPrime / uniqueProducts * 100)',
    avgSellerCount: 'avg(sellerCount>0 ? sellerCount : offers.length || 0), fixed to 2 decimals',
  },
  segmentMetrics: {
    segmentSelection: {
      amazon: "marketplace contains 'amazon'",
      etsy: "marketplace contains 'etsy'",
    },
    fields: {
      count: 'count(products in segment)',
      avgPrice: 'mean(effectivePrice in segment)',
      avgMargin: 'mean(effectivePrice*0.5 in segment)',
      avgValueScore: 'round(avg(valueScore)), valueScore=(rating/5*50)+(min(discount/50,1)*30)+(min(reviews/10000,1)*20)',
      avgTrust: 'round(avg(trustScore)), Amazon=((rating/5)*0.6+choice*0.2+bestseller*0.2)*100, Etsy=((rating/5)*0.75+starseller*0.25)*100',
      avgDiscount: 'round(mean(discountPercentage over discounted products only))',
      specialSharePercent: 'round(specialProducts/segmentCount*100), Amazon=special if isPrime, Etsy=special if isDigitalDownload',
      bestOpportunityTitle: 'title with max(discount * reviews/10000 * 1/max(1,sellerCount|offers.length|1))',
    },
  },
} as const;

export function getMetricsDefinitionsPayload() {
  return {
    version: METRICS_DEFINITIONS_VERSION,
    updatedAt: '2026-03-05',
    definitions: metricsDefinitions,
  };
}
