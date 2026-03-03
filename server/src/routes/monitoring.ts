import { FastifyInstance } from 'fastify';
import { getMonitoredEntities, scheduleNew, unschedule, setMonitoringStatus } from '../services/SchedulerService';
import { getPriceHistory, getPriceHistoryBatch } from '../services/PriceHistoryService';
import { CrawlerAdapter } from '../modules/scraping/adapters/CrawlerAdapter';
import { appendPriceSnapshot } from '../services/PriceHistoryService';
import { storageService } from '../modules/storage/services/StorageService';
import { MonitoredEntity, TrackingType, Product } from '../types';
import { logger as baseLogger } from '../utils/logger';
import { stabilizeProductPriceWithHistory } from '../services/PriceAnomalyService';
import { createApiErrorPayload, paginate } from '../utils/http';

const logger = baseLogger.child({ module: 'MonitoringRoutes' });

const crawlerAdapter = new CrawlerAdapter();
const LATEST_INDEX_REFRESH_MS = 15_000;

type LatestKeywordData = { scrapedAt: string; topAsin?: string; topTitle?: string };
type LatestProductData = { scrapedAt: string; price?: number; currency?: string; asin?: string };
type LatestProductIndexEntry = { product: Product; lookupKey: string };

let latestProductByLookupKey = new Map<string, LatestProductIndexEntry>();
let latestKeywordByTrackerKey = new Map<string, LatestKeywordData>();
let latestIndexLastUpdatedAt = 0;
let latestIndexRefreshPromise: Promise<void> | null = null;

function extractAsinFromUrl(url: string): string | undefined {
  const dpMatch = url.match(/\/dp\/([A-Z0-9]{10})/i);
  if (dpMatch?.[1]) return dpMatch[1].toUpperCase();
  const gpMatch = url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
  if (gpMatch?.[1]) return gpMatch[1].toUpperCase();
  return undefined;
}

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().split('?')[0];
}

function getKeywordTrackerKey(keyword: string, marketplace: string): string {
  return `${keyword}::${marketplace}`;
}

async function refreshLatestIndexes(force = false): Promise<void> {
  const isFresh = Date.now() - latestIndexLastUpdatedAt < LATEST_INDEX_REFRESH_MS;
  if (!force && isFresh) return;

  if (latestIndexRefreshPromise) {
    await latestIndexRefreshPromise;
    return;
  }

  latestIndexRefreshPromise = (async () => {
    const [latestProductsIndex, latestSerpIndex] = await Promise.all([
      storageService.getLatestProductsIndex(),
      storageService.getLatestSerpIndex(),
    ]);

    const nextProductMap = new Map<string, LatestProductIndexEntry>();
    for (const [lookupKey, product] of Object.entries(latestProductsIndex)) {
      nextProductMap.set(lookupKey, { product: product as Product, lookupKey });
    }

    const nextKeywordMap = new Map<string, LatestKeywordData>();
    for (const [trackerKey, latest] of Object.entries(latestSerpIndex)) {
      nextKeywordMap.set(trackerKey, latest);
    }

    latestProductByLookupKey = nextProductMap;
    latestKeywordByTrackerKey = nextKeywordMap;
    latestIndexLastUpdatedAt = Date.now();
  })()
    .catch((error) => {
      logger.warn({ err: error }, 'Failed to refresh monitoring latest indexes');
    })
    .finally(() => {
      latestIndexRefreshPromise = null;
    });

  await latestIndexRefreshPromise;
}

async function scheduledScrape(entity: MonitoredEntity): Promise<void> {
  if (entity.type === 'product') {
      const result = await crawlerAdapter.scrapeProduct(entity.value);
      if (result.product) {
      const history = await getPriceHistory(entity.value, result.product.metrics.asin);
      const stabilized = stabilizeProductPriceWithHistory(result.product, history);
      await appendPriceSnapshot(entity.value, stabilized);
      logger.info(`Completed for Product ${entity.value} - price: ${stabilized.metrics.price}`);
    }
  } else if (entity.type === 'keyword') {
    const result = await crawlerAdapter.scrapeAmazonSearch(entity.value, entity.marketplace);
    if (result.result) {
       await storageService.saveSerpResult(result.result);
       logger.info(`Completed SERP for Keyword ${entity.value}`);
    } else {
       logger.error({ err: result.error }, `SERP failed for ${entity.value}`);
    }
  } else if (entity.type === 'category') {
    logger.info(`Implement category tracking for node: ${entity.value}`);
  }
}

export default async function monitoringRoutes(fastify: FastifyInstance) {
  await refreshLatestIndexes(true);
  const refreshTimer = setInterval(() => {
    void refreshLatestIndexes(true);
  }, LATEST_INDEX_REFRESH_MS);

  fastify.addHook('onClose', async () => {
    clearInterval(refreshTimer);
  });

  // GET /api/trackers — list all monitored entities
  fastify.get<{ Querystring: { limit?: number; offset?: number } }>('/trackers', async (request) => {
    const trackers = await getMonitoredEntities();
    const { limit, offset } = request.query;
    if (typeof limit === 'number' || typeof offset === 'number') {
      return paginate(trackers, limit, offset);
    }
    return { data: trackers };
  });

  // POST /api/trackers/bulk (or single)
  fastify.post<{ Body: { type: TrackingType; values: string[]; marketplace: string; intervalHours?: number } }>('/trackers/bulk', {
    schema: {
      body: {
        type: 'object',
        required: ['type', 'values', 'marketplace'],
        properties: {
          type: { type: 'string', enum: ['product', 'keyword', 'category'] },
          values: { type: 'array', items: { type: 'string' } },
          marketplace: { type: 'string' },
          intervalHours: { type: 'number', minimum: 0.1, default: 24 }
        }
      }
    }
  }, async (request, reply) => {
    const { type, values, marketplace, intervalHours = 24 } = request.body;
    const addedEntries = [];
    
    for (const value of values) {
      let finalValue = value.trim();
      if (!finalValue) continue;

      // Smart ASIN detection: If it's a product, doesn't start with http, and is exactly 10 alphanumeric characters
      if (type === 'product' && !finalValue.startsWith('http') && /^[A-Z0-9]{10}$/i.test(finalValue)) {
        finalValue = `https://www.${marketplace}/dp/${finalValue}`;
      }

      const entry = await scheduleNew(type, finalValue, marketplace, intervalHours, scheduledScrape);
      addedEntries.push(entry);
    }
    
    reply.status(201).send({ message: 'Trackers added', count: addedEntries.length, entries: addedEntries });
  });

  // DELETE /api/trackers/:id
  fastify.delete<{ Params: { id: string } }>('/trackers/:id', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const removed = await unschedule(id);
    if (!removed) {
      return reply.status(404).send(createApiErrorPayload('TRACKER_NOT_FOUND', 'Tracker not found', 404));
    }
    return { message: 'Tracker removed', id };
  });

  // PATCH /api/trackers/:id/status — pause or resume monitoring
  fastify.patch<{ Params: { id: string }; Body: { status: 'active' | 'paused' } }>('/trackers/:id/status', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'paused'] },
        },
        required: ['status'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;
    const updated = await setMonitoringStatus(id, status, scheduledScrape);
    if (!updated) {
      return reply.status(404).send(createApiErrorPayload('TRACKER_NOT_FOUND', 'Tracker not found', 404));
    }
    return { message: `Tracker ${status === 'paused' ? 'paused' : 'resumed'}`, data: updated };
  });

  // GET /api/monitor/history?url=... (Legacy / Product specific)
  fastify.get<{ Querystring: { url: string } }>('/monitor/history', {
    schema: {
      querystring: {
        type: 'object',
        required: ['url'],
        properties: { url: { type: 'string' } }
      }
    }
  }, async (request, reply) => {
      const url = request.query.url;
      const product = await storageService.getProductByUrl(url);
      const asin = product?.metrics?.asin || extractAsinFromUrl(url);
      
      const history = await getPriceHistory(url, asin);
      return reply.send({ data: history });
    });

  // GET /api/rankings/:keyword
  fastify.get<{ Querystring: { keyword: string; marketplace: string; limit?: number; offset?: number } }>('/rankings', {
    schema: {
      querystring: {
        type: 'object',
        required: ['keyword', 'marketplace'],
        properties: {
          keyword: { type: 'string' },
          marketplace: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 5000 },
          offset: { type: 'number', minimum: 0 },
        }
      }
    }
  }, async (request, reply) => {
    const { keyword, marketplace, limit, offset } = request.query;
    const history = await storageService.getSerpHistory(keyword, marketplace);
    if (typeof limit === 'number' || typeof offset === 'number') {
      return reply.send(paginate(history, limit, offset));
    }
    return reply.send({ data: history });
  });

  // GET /api/trackers/results/latest — lightweight dashboard endpoint with only latest snapshots
  fastify.get<{ Querystring: { limit?: number; offset?: number } }>('/trackers/results/latest', async (request) => {
    await refreshLatestIndexes();
    const trackers = await getMonitoredEntities();

    const data = trackers.map((tracker) => {
      let latestData: unknown = null;
      if (tracker.type === 'product') {
        const latestProduct = latestProductByLookupKey.get(normalizeLookupKey(tracker.value))?.product;
        if (latestProduct) {
          latestData = {
            scrapedAt: latestProduct.scrapedAt,
            price: latestProduct.metrics.price,
            currency: latestProduct.metrics.currency,
            asin: latestProduct.metrics.asin,
          } as LatestProductData;
        }
      } else if (tracker.type === 'keyword') {
        latestData = latestKeywordByTrackerKey.get(getKeywordTrackerKey(tracker.value, tracker.marketplace)) || null;
      }
      return { ...tracker, latestData };
    });

    const { limit, offset } = request.query;
    if (typeof limit === 'number' || typeof offset === 'number') {
      return paginate(data, limit, offset);
    }
    return { data };
  });

  // GET /api/trackers/results — Unified dashboard endpoint joining trackers with their latest scraped outcome
  fastify.get<{ Querystring: { limit?: number; offset?: number } }>('/trackers/results', async (request) => {
    await refreshLatestIndexes();
    const trackers = await getMonitoredEntities();

    const priceHistoryBatch = await getPriceHistoryBatch(
      trackers
        .filter((t) => t.type === 'product')
        .map((t) => {
          const product = latestProductByLookupKey.get(normalizeLookupKey(t.value))?.product;
          return {
            id: t.id,
            url: t.value,
            asin: product?.metrics?.asin || extractAsinFromUrl(t.value),
          };
        })
    );

    const data = trackers.map((tracker) => {
      let latestData: unknown = null;
      if (tracker.type === 'product') {
        const history = priceHistoryBatch[tracker.id] || [];
        if (history.length > 0) {
          latestData = history[history.length - 1];
        }
      } else if (tracker.type === 'keyword') {
        latestData = latestKeywordByTrackerKey.get(getKeywordTrackerKey(tracker.value, tracker.marketplace)) || null;
      }
      return { ...tracker, latestData };
    });

    const { limit, offset } = request.query;
    if (typeof limit === 'number' || typeof offset === 'number') {
      return paginate(data, limit, offset);
    }
    return { data };
  });

}

// Also export the scraper logic for the init loop in server.ts
export { scheduledScrape };
