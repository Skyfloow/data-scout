import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { storageService } from '../modules/storage/services/StorageService';
import { ScraperType, Product, PriceSnapshot } from '../types';
import { getPriceHistoryBatch } from '../services/PriceHistoryService';
import { getMetricsDefinitionsPayload, METRICS_DEFINITIONS_VERSION } from '../services/MetricsDefinitionsService';
import { resolveEffectivePrice, resolveEffectivePriceUSD } from '../utils/price';
import { createApiErrorPayload, paginate } from '../utils/http';

interface GetProductsQuery {
  source?: string;
  scraper?: ScraperType;
  limit?: number;
  offset?: number;
}

type SegmentMetrics = {
  count: number;
  avgPrice: number;
  avgValueScore: number;
  avgMargin: number;
  avgTrust: number;
  avgDiscount: number;
  specialSharePercent: number;
  bestOpportunityTitle: string;
};

const ProductSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string' },
    marketplace: { type: 'string' },
    metrics: {
      type: 'object',
      properties: {
        price: { type: 'number' },
        averageRating: { type: 'number' },
        reviewsCount: { type: 'number' },
        viewsCount: { type: 'number' },
      },
    },
    scrapedAt: { type: 'string', format: 'date-time' },
    scrapedBy: { type: 'string' },
  },
};

const dashboardRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readSnapshotPriceUSD = (snapshot: PriceSnapshot): number => {
    if (snapshot.priceUSD && snapshot.priceUSD > 0) return snapshot.priceUSD;
    if (snapshot.itemPriceUSD && snapshot.itemPriceUSD > 0) return snapshot.itemPriceUSD;
    if (snapshot.itemPrice && snapshot.itemPrice > 0) return snapshot.itemPrice;
    return snapshot.price > 0 ? snapshot.price : 0;
  };

  const getIdentityKey = (product: Product): string => {
    const asin = product.metrics.asin?.trim();
    if (asin) return `asin:${asin.toUpperCase()}`;
    return `url:${product.url.toLowerCase().split('?')[0]}`;
  };

  const getLatestUniqueProducts = (products: Product[]): Product[] => {
    const latestByKey = new Map<string, Product>();
    for (const product of products) {
      const key = getIdentityKey(product);
      const current = latestByKey.get(key);
      if (!current || new Date(product.scrapedAt).getTime() > new Date(current.scrapedAt).getTime()) {
        latestByKey.set(key, product);
      }
    }
    return Array.from(latestByKey.values());
  };

  const calcValueScore = (product: Product): number => {
    const ratingFactor = ((product.metrics.averageRating || 0) / 5) * 50;
    const discountFactor = Math.min((product.metrics.discountPercentage || 0) / 50, 1) * 30;
    const reviewFactor = Math.min((product.metrics.reviewsCount || 0) / 10_000, 1) * 20;
    return Math.round(ratingFactor + discountFactor + reviewFactor);
  };

  const calcTrustScore = (product: Product, mode: 'amazon' | 'etsy'): number => {
    const rating = product.metrics.averageRating || 0;
    if (mode === 'amazon') {
      return ((rating / 5) * 0.6 + (product.metrics.isAmazonChoice ? 0.2 : 0) + (product.metrics.isBestSeller ? 0.2 : 0)) * 100;
    }
    return ((rating / 5) * 0.75 + ((product.metrics.etsyMetrics?.isStarSeller || product.metrics.isStarSeller) ? 0.25 : 0)) * 100;
  };

  const calcGrossMarginAmount = (product: Product): number => {
    const price = resolveEffectivePriceUSD(product.metrics) || resolveEffectivePrice(product.metrics) || 0;
    if (!price || price <= 0) return 0;
    return price * 0.5;
  };

  const calcSegmentMetrics = (segment: Product[], mode: 'amazon' | 'etsy'): SegmentMetrics => {
    if (segment.length === 0) {
      return {
        count: 0,
        avgPrice: 0,
        avgValueScore: 0,
        avgMargin: 0,
        avgTrust: 0,
        avgDiscount: 0,
        specialSharePercent: 0,
        bestOpportunityTitle: '',
      };
    }

    let totalPrices = 0;
    let productsWithPrice = 0;
    let totalValue = 0;
    let totalMargin = 0;
    let totalTrust = 0;
    let totalDiscount = 0;
    let productsWithDiscount = 0;
    let specialCount = 0;
    let best = { score: 0, title: '' };

    for (const product of segment) {
      const price = resolveEffectivePriceUSD(product.metrics) || resolveEffectivePrice(product.metrics) || 0;
      if (price > 0) {
        totalPrices += price;
        productsWithPrice++;
      }

      totalValue += calcValueScore(product);
      totalMargin += calcGrossMarginAmount(product);
      totalTrust += calcTrustScore(product, mode);

      if (product.metrics.discountPercentage) {
        totalDiscount += product.metrics.discountPercentage;
        productsWithDiscount++;
      }

      if (mode === 'amazon' && (product.metrics.amazonMetrics?.isPrime || product.metrics.isPrime)) specialCount++;
      if (mode === 'etsy' && (product.metrics.etsyMetrics?.isDigitalDownload || product.metrics.isDigitalDownload)) specialCount++;

      const sellerCount = Math.max(1, product.metrics.sellerCount || product.metrics.offers?.length || 1);
      const opportunity = (product.metrics.discountPercentage || 0) * ((product.metrics.reviewsCount || 0) / 10_000) * (1 / sellerCount);
      if (opportunity > best.score) {
        best = { score: opportunity, title: product.title };
      }
    }

    return {
      count: segment.length,
      avgPrice: productsWithPrice > 0 ? totalPrices / productsWithPrice : 0,
      avgValueScore: Math.round(totalValue / segment.length),
      avgMargin: totalMargin / segment.length,
      avgTrust: Math.round(totalTrust / segment.length),
      avgDiscount: productsWithDiscount > 0 ? Math.round(totalDiscount / productsWithDiscount) : 0,
      specialSharePercent: Math.round((specialCount / segment.length) * 100),
      bestOpportunityTitle: best.title,
    };
  };

  fastify.get<{ Querystring: GetProductsQuery }>(
    '/products',
    {
      schema: {
        description: 'Get all scraped products with optional filtering',
        tags: ['Dashboard'],
        querystring: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            scraper: { type: 'string', enum: ['crawler', 'firecrawl'] },
            limit: { type: 'number', minimum: 1, maximum: 5000 },
            offset: { type: 'number', minimum: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: ProductSchema,
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const filters = request.query;
      const products = await storageService.getAllProducts(filters);
      const { limit, offset } = request.query;
      if (typeof limit === 'number' || typeof offset === 'number') {
        return paginate(products, limit, offset);
      }
      return { data: products };
    }
  );

  fastify.get(
    '/metrics/definitions',
    {
      schema: {
        description: 'Get versioned dashboard metrics contract and formulas',
        tags: ['Dashboard'],
        response: {
          200: {
            type: 'object',
            properties: {
              version: { type: 'string' },
              updatedAt: { type: 'string' },
              definitions: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
    async () => {
      return getMetricsDefinitionsPayload();
    }
  );

  fastify.get(
    '/metrics',
    {
      schema: {
        description: 'Get aggregated metrics for the dashboard',
        tags: ['Dashboard'],
        response: {
          200: {
            type: 'object',
            properties: {
              averagePrice: { type: 'number' },
              version: { type: 'string' },
              distributionBySource: {
                type: 'object',
                additionalProperties: { type: 'number' },
              },
              ratingsHistogram: {
                type: 'object',
                additionalProperties: { type: 'number' },
              },
              totalProducts: { type: 'number' },
              uniqueProducts: { type: 'number' },
              anomaliesCount: { type: 'number' },
              dataCoveragePercent: { type: 'number' },
              stableProductsPercent: { type: 'number' },
              buyBoxCoveragePercent: { type: 'number' },
              discountedProductsPercent: { type: 'number' },
              primeProductsPercent: { type: 'number' },
              medianPrice: { type: 'number' },
              avgSellerCount: { type: 'number' },
              segmentMetrics: {
                type: 'object',
                properties: {
                  amazon: {
                    type: 'object',
                    properties: {
                      count: { type: 'number' },
                      avgPrice: { type: 'number' },
                      avgValueScore: { type: 'number' },
                      avgMargin: { type: 'number' },
                      avgTrust: { type: 'number' },
                      avgDiscount: { type: 'number' },
                      specialSharePercent: { type: 'number' },
                      bestOpportunityTitle: { type: 'string' },
                    },
                  },
                  etsy: {
                    type: 'object',
                    properties: {
                      count: { type: 'number' },
                      avgPrice: { type: 'number' },
                      avgValueScore: { type: 'number' },
                      avgMargin: { type: 'number' },
                      avgTrust: { type: 'number' },
                      avgDiscount: { type: 'number' },
                      specialSharePercent: { type: 'number' },
                      bestOpportunityTitle: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      const allProducts = await storageService.getAllProducts();
      const products = getLatestUniqueProducts(allProducts);
      const historyBatch = await getPriceHistoryBatch(
        products.map((p) => ({ id: p.id, url: p.url, asin: p.metrics.asin }))
      );
      
      let totalPrice = 0;
      let productsWithPrice = 0;
      const distributionBySource: Record<string, number> = {};
      const ratingsHistogram: Record<string, number> = {};
      
      let anomaliesCount = 0;
      let totalGoldenFields = 0;
      const MAX_GOLDEN_FIELDS = 5;
      let buyBoxCoverageCount = 0;
      let discountedCount = 0;
      let primeCount = 0;
      let totalSellerCount = 0;
      const pricedValues: number[] = [];

      for (const p of products) {
        // Price aggregation
        const effectivePrice = resolveEffectivePriceUSD(p.metrics) || resolveEffectivePrice(p.metrics);
        if (effectivePrice && effectivePrice > 0) {
          totalPrice += effectivePrice;
          productsWithPrice++;
          pricedValues.push(effectivePrice);
        }

        // Source distribution
        const source = p.marketplace || 'unknown';
        distributionBySource[source] = (distributionBySource[source] || 0) + 1;

        // Rating
        if (p.metrics.averageRating) {
          const roundedRating = Math.round(p.metrics.averageRating).toString();
          ratingsHistogram[roundedRating] = (ratingsHistogram[roundedRating] || 0) + 1;
        }

        // Data Coverage Score (title, price, brand, imageUrl, availability)
        let filledFields = 0;
        if (p.title && p.title !== 'Unknown Product') filledFields++;
        if (effectivePrice && effectivePrice > 0) filledFields++;
        if (p.metrics.brand) filledFields++;
        if (p.metrics.imageUrl) filledFields++;
        if (p.metrics.availability) filledFields++;
        
        totalGoldenFields += (filledFields / MAX_GOLDEN_FIELDS);

        // Price Stability (Anomalies)
        const hist = historyBatch[p.id] || [];
        if (hist.length >= 2) {
          const latest = readSnapshotPriceUSD(hist[hist.length - 1]!);
          const previous = readSnapshotPriceUSD(hist[hist.length - 2]!);
          if (previous > 0) {
            const diffPct = Math.abs(latest - previous) / previous;
            if (diffPct > 0.3) {
              anomaliesCount++;
            }
          }
        }

        if (p.metrics.buyBox?.price && p.metrics.buyBox.price > 0) {
          buyBoxCoverageCount++;
        }
        if ((p.metrics.discountPercentage || 0) > 0) {
          discountedCount++;
        }
        if (p.metrics.isPrime) {
          primeCount++;
        }
        if (typeof p.metrics.sellerCount === 'number' && p.metrics.sellerCount > 0) {
          totalSellerCount += p.metrics.sellerCount;
        } else if (p.metrics.offers?.length) {
          totalSellerCount += p.metrics.offers.length;
        }
      }

      const averagePrice = productsWithPrice > 0 ? totalPrice / productsWithPrice : 0;
      const sortedPrices = [...pricedValues].sort((a, b) => a - b);
      const medianPrice = sortedPrices.length
        ? (sortedPrices.length % 2 === 1
            ? sortedPrices[(sortedPrices.length - 1) / 2]
            : (sortedPrices[sortedPrices.length / 2 - 1]! + sortedPrices[sortedPrices.length / 2]!) / 2)
        : 0;
      const dataCoveragePercent = products.length > 0 ? Math.round((totalGoldenFields / products.length) * 100) : 0;
      const stableProductsPercent = products.length > 0 ? Math.round(((products.length - anomaliesCount) / products.length) * 100) : 100;
      const buyBoxCoveragePercent = products.length > 0 ? Math.round((buyBoxCoverageCount / products.length) * 100) : 0;
      const discountedProductsPercent = products.length > 0 ? Math.round((discountedCount / products.length) * 100) : 0;
      const primeProductsPercent = products.length > 0 ? Math.round((primeCount / products.length) * 100) : 0;
      const avgSellerCount = products.length > 0 ? parseFloat((totalSellerCount / products.length).toFixed(2)) : 0;
      const amazonProducts = products.filter((p) => p.marketplace.toLowerCase().includes('amazon'));
      const etsyProducts = products.filter((p) => p.marketplace.toLowerCase().includes('etsy'));

      return {
        version: METRICS_DEFINITIONS_VERSION,
        averagePrice,
        medianPrice,
        distributionBySource,
        ratingsHistogram,
        totalProducts: allProducts.length,
        uniqueProducts: products.length,
        anomaliesCount,
        dataCoveragePercent,
        stableProductsPercent,
        buyBoxCoveragePercent,
        discountedProductsPercent,
        primeProductsPercent,
        avgSellerCount,
        segmentMetrics: {
          amazon: calcSegmentMetrics(amazonProducts, 'amazon'),
          etsy: calcSegmentMetrics(etsyProducts, 'etsy'),
        },
      };
    }
  );

  // Get single product by ID
  fastify.get<{ Params: { id: string } }>(
    '/products/by-id/:id',
    {
      schema: {
        description: 'Get a single product by its UUID',
        tags: ['Dashboard'],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const allProducts = await storageService.getAllProducts();
      const product = allProducts.find((p) => p.id === request.params.id);
      if (!product) {
        return reply.status(404).send(createApiErrorPayload('PRODUCT_NOT_FOUND', 'Product not found', 404));
      }
      return { data: product };
    }
  );

  // Delete products by array of IDs
  fastify.delete<{ Body: { ids: string[] } }>(
    '/products',
    {
      schema: {
        description: 'Delete one or more products by their IDs',
        tags: ['Dashboard'],
        body: {
          type: 'object',
          properties: {
            ids: { type: 'array', items: { type: 'string' } },
          },
          required: ['ids'],
        },
      },
    },
    async (request) => {
      const deleted = await storageService.deleteProducts(request.body.ids);
      return { deleted };
    }
  );
};

export default dashboardRoutes;
