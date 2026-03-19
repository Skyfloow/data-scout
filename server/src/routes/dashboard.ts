import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { storageService } from '../modules/storage/services/StorageService';
import { ScraperType, Product } from '../types';
import { getPriceHistory } from '../services/PriceHistoryService';
import { resolveEffectivePrice, resolveEffectivePriceUSD } from '../utils/price';
import { createApiErrorPayload, paginate } from '../utils/http';

interface GetProductsQuery {
  source?: string;
  scraper?: ScraperType;
  limit?: number;
  offset?: number;
}

interface GetMetricsQuery {
  source?: string;
  scraper?: ScraperType;
}

interface RankingsQuery {
  keyword: string;
  marketplace: string;
  limit?: number;
  offset?: number;
}

const ProductSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string' },
    marketplace: { type: 'string' },
    metrics: {
      type: 'object',
      additionalProperties: true,
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

  const extractAsinFromUrl = (url: string): string | undefined => {
    const dpMatch = url.match(/\/dp\/([A-Z0-9]{10})/i);
    if (dpMatch?.[1]) return dpMatch[1].toUpperCase();
    const gpMatch = url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
    if (gpMatch?.[1]) return gpMatch[1].toUpperCase();
    return undefined;
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
    async (request) => {
      const filters = request.query;
      const products = await storageService.getAllProducts(filters);
      const { limit, offset } = request.query;
      if (typeof limit === 'number' || typeof offset === 'number') {
        return paginate(products, limit, offset);
      }
      return { data: products };
    }
  );

  fastify.get<{ Querystring: GetMetricsQuery }>(
    '/metrics',
    {
      schema: {
        description: 'Get basic and auditable dashboard metrics',
        tags: ['Dashboard'],
        querystring: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            scraper: { type: 'string', enum: ['crawler', 'firecrawl'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              averagePrice: { type: 'number' },
              medianPrice: { type: 'number' },
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
              productsWithPrice: { type: 'number' },
              productsWithRating: { type: 'number' },
              ratingCoveragePercent: { type: 'number' },
              amazonProducts: { type: 'number' },
              etsyProducts: { type: 'number' },
              marketplaceShare: {
                type: 'object',
                properties: {
                  amazon: { type: 'number' },
                  etsy: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const filters = request.query;
      const allProducts = await storageService.getAllProducts(filters);
      const products = getLatestUniqueProducts(allProducts);

      let totalPrice = 0;
      const pricedValues: number[] = [];
      let productsWithPrice = 0;
      let productsWithRating = 0;
      let amazonProducts = 0;
      let etsyProducts = 0;

      const distributionBySource: Record<string, number> = {};
      const ratingsHistogram: Record<string, number> = {};

      for (const product of products) {
        const effectivePrice = resolveEffectivePriceUSD(product.metrics) || resolveEffectivePrice(product.metrics);
        if (effectivePrice && effectivePrice > 0) {
          totalPrice += effectivePrice;
          productsWithPrice++;
          pricedValues.push(effectivePrice);
        }

        const source = product.marketplace || 'unknown';
        distributionBySource[source] = (distributionBySource[source] || 0) + 1;

        if (product.metrics.averageRating && product.metrics.averageRating > 0) {
          productsWithRating++;
          const roundedRating = Math.round(product.metrics.averageRating).toString();
          ratingsHistogram[roundedRating] = (ratingsHistogram[roundedRating] || 0) + 1;
        }

        const marketplace = source.toLowerCase();
        if (marketplace.includes('amazon')) amazonProducts++;
        if (marketplace.includes('etsy')) etsyProducts++;
      }

      const averagePrice = productsWithPrice > 0 ? totalPrice / productsWithPrice : 0;
      const sortedPrices = [...pricedValues].sort((a, b) => a - b);
      const medianPrice = sortedPrices.length
        ? sortedPrices.length % 2 === 1
          ? sortedPrices[(sortedPrices.length - 1) / 2]
          : (sortedPrices[sortedPrices.length / 2 - 1]! + sortedPrices[sortedPrices.length / 2]!) / 2
        : 0;
      const ratingCoveragePercent = products.length > 0 ? Math.round((productsWithRating / products.length) * 100) : 0;

      return {
        averagePrice,
        medianPrice,
        distributionBySource,
        ratingsHistogram,
        totalProducts: allProducts.length,
        uniqueProducts: products.length,
        productsWithPrice,
        productsWithRating,
        ratingCoveragePercent,
        amazonProducts,
        etsyProducts,
        marketplaceShare: {
          amazon: products.length > 0 ? Math.round((amazonProducts / products.length) * 100) : 0,
          etsy: products.length > 0 ? Math.round((etsyProducts / products.length) * 100) : 0,
        },
      };
    }
  );

  fastify.get<{ Querystring: { url: string } }>(
    '/monitor/history',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['url'],
          properties: { url: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const url = request.query.url;
      const product = await storageService.getProductByUrl(url);
      const asin = product?.metrics?.asin || extractAsinFromUrl(url);
      const history = await getPriceHistory(url, asin);
      return reply.send({ data: history });
    }
  );

  fastify.get<{ Querystring: RankingsQuery }>(
    '/rankings',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['keyword', 'marketplace'],
          properties: {
            keyword: { type: 'string' },
            marketplace: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 5000 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { keyword, marketplace, limit, offset } = request.query;
      const history = await storageService.getSerpHistory(keyword, marketplace);
      if (typeof limit === 'number' || typeof offset === 'number') {
        return reply.send(paginate(history, limit, offset));
      }
      return reply.send({ data: history });
    }
  );

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
