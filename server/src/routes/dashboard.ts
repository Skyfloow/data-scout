import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { storageService } from '../modules/storage/services/StorageService';
import { ScraperType, Product } from '../types';
import { resolveEffectivePrice } from '../utils/price';
import { createApiErrorPayload, paginate } from '../utils/http';

interface GetProductsQuery {
  source?: string;
  scraper?: ScraperType;
  limit?: number;
  offset?: number;
}

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
            },
          },
        },
      },
    },
    async () => {
      const allProducts = await storageService.getAllProducts();
      const products = getLatestUniqueProducts(allProducts);
      
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
        const effectivePrice = resolveEffectivePrice(p.metrics);
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
        if (p.metrics.price && p.metrics.price > 0) filledFields++;
        if (p.metrics.brand) filledFields++;
        if (p.metrics.imageUrl) filledFields++;
        if (p.metrics.availability) filledFields++;
        
        totalGoldenFields += (filledFields / MAX_GOLDEN_FIELDS);

        // Price Stability (Anomalies)
        if (p.priceHistory && p.priceHistory.length >= 2) {
          const hist = p.priceHistory;
          const latest = hist[hist.length - 1].price;
          const previous = hist[hist.length - 2].price;
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

      return {
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
