import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dashboardRoutes from '../src/routes/dashboard';
import { storageService } from '../src/modules/storage/services/StorageService';
import * as priceHistoryService from '../src/services/PriceHistoryService';
import { Product } from '../src/types';

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    title: 'Test product',
    url: `https://example.com/p/${id}`,
    marketplace: 'amazon',
    scrapedAt: new Date().toISOString(),
    scrapedBy: 'crawler',
    metrics: {
      price: 100,
      currency: 'USD',
      buyBox: {
        sellerName: 'seller',
        price: 100,
        isFBA: true,
        isAmazon: false,
      },
      brand: 'brand',
      imageUrl: 'https://img.example.com/a.jpg',
      availability: 'In Stock',
    },
    ...overrides,
  };
}

describe('Dashboard metrics endpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates anomalies from price history batch', async () => {
    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/api' });
    await app.ready();

    const p1 = makeProduct('1');
    const p2 = makeProduct('2');

    vi.spyOn(storageService, 'getAllProducts').mockResolvedValue([p1, p2]);
    vi.spyOn(priceHistoryService, 'getPriceHistoryBatch').mockResolvedValue({
      '1': [
        { price: 100, currency: 'USD', scrapedAt: '2026-03-05T10:00:00.000Z' },
        { price: 150, currency: 'USD', scrapedAt: '2026-03-05T11:00:00.000Z' },
      ],
      '2': [
        { price: 100, currency: 'USD', scrapedAt: '2026-03-05T10:00:00.000Z' },
        { price: 105, currency: 'USD', scrapedAt: '2026-03-05T11:00:00.000Z' },
      ],
    });

    const response = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.version).toBeDefined();
    expect(payload.anomaliesCount).toBe(1);
    expect(payload.stableProductsPercent).toBe(50);

    await app.close();
  });

  it('uses effective price for coverage and averagePrice', async () => {
    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/api' });
    await app.ready();

    const product = makeProduct('3', {
      metrics: {
        price: undefined,
        currency: 'USD',
        buyBox: {
          sellerName: 'seller',
          price: 42,
          isFBA: true,
          isAmazon: false,
        },
        brand: 'brand',
        imageUrl: 'https://img.example.com/a.jpg',
        availability: 'In Stock',
      },
    });

    vi.spyOn(storageService, 'getAllProducts').mockResolvedValue([product]);
    vi.spyOn(priceHistoryService, 'getPriceHistoryBatch').mockResolvedValue({ '3': [] });

    const response = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.version).toBeDefined();
    expect(payload.averagePrice).toBe(42);
    expect(payload.dataCoveragePercent).toBe(100);

    await app.close();
  });

  it('returns segmented marketplace metrics from backend formulas', async () => {
    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/api' });
    await app.ready();

    const amazon = makeProduct('4', {
      title: 'Amazon Product',
      marketplace: 'amazon',
      metrics: {
        price: 100,
        priceUSD: 100,
        currency: 'USD',
        averageRating: 4.5,
        reviewsCount: 2000,
        discountPercentage: 20,
        isPrime: true,
        isAmazonChoice: true,
        sellerCount: 2,
        buyBox: {
          sellerName: 'seller',
          price: 100,
          isFBA: true,
          isAmazon: false,
        },
      },
    });

    const etsy = makeProduct('5', {
      title: 'Etsy Product',
      marketplace: 'etsy',
      metrics: {
        price: 50,
        priceUSD: 50,
        currency: 'USD',
        averageRating: 5,
        reviewsCount: 100,
        discountPercentage: 10,
        isDigitalDownload: true,
        isStarSeller: true,
        sellerCount: 1,
      },
    });

    vi.spyOn(storageService, 'getAllProducts').mockResolvedValue([amazon, etsy]);
    vi.spyOn(priceHistoryService, 'getPriceHistoryBatch').mockResolvedValue({ '4': [], '5': [] });

    const response = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.version).toBeDefined();

    expect(payload.segmentMetrics.amazon.count).toBe(1);
    expect(payload.segmentMetrics.amazon.avgPrice).toBe(100);
    expect(payload.segmentMetrics.amazon.avgMargin).toBe(50);
    expect(payload.segmentMetrics.amazon.specialSharePercent).toBe(100);
    expect(payload.segmentMetrics.etsy.count).toBe(1);
    expect(payload.segmentMetrics.etsy.avgPrice).toBe(50);
    expect(payload.segmentMetrics.etsy.avgMargin).toBe(25);
    expect(payload.segmentMetrics.etsy.specialSharePercent).toBe(100);

    await app.close();
  });

  it('matches golden dataset metrics contract', async () => {
    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/api' });
    await app.ready();

    const amazonA = makeProduct('ga-1', {
      title: 'Amazon A',
      marketplace: 'amazon',
      metrics: {
        priceUSD: 100,
        price: 100,
        currency: 'USD',
        averageRating: 4,
        reviewsCount: 1000,
        discountPercentage: 10,
        isPrime: true,
        isAmazonChoice: true,
        sellerCount: 2,
        buyBox: { sellerName: 'seller', price: 100, isFBA: true, isAmazon: false },
        brand: 'A',
        imageUrl: 'https://img.example.com/a.jpg',
        availability: 'In Stock',
      },
    });

    const amazonB = makeProduct('ga-2', {
      title: 'Amazon B',
      marketplace: 'amazon',
      metrics: {
        price: 80,
        currency: 'EUR',
        offers: [
          { sellerName: 's1', price: 80, currency: 'EUR', stockStatus: 'In Stock' },
          { sellerName: 's2', price: 82, currency: 'EUR', stockStatus: 'In Stock' },
          { sellerName: 's3', price: 83, currency: 'EUR', stockStatus: 'In Stock' },
        ],
      },
    });

    const etsyA = makeProduct('ge-1', {
      title: 'Etsy A',
      marketplace: 'etsy',
      metrics: {
        priceUSD: 50,
        price: 50,
        currency: 'USD',
        averageRating: 5,
        reviewsCount: 200,
        discountPercentage: 20,
        sellerCount: 1,
        isDigitalDownload: true,
        isStarSeller: true,
        brand: 'E',
        imageUrl: 'https://img.example.com/e.jpg',
        availability: 'In Stock',
      },
    });

    vi.spyOn(storageService, 'getAllProducts').mockResolvedValue([amazonA, amazonB, etsyA]);
    vi.spyOn(priceHistoryService, 'getPriceHistoryBatch').mockResolvedValue({
      'ga-1': [
        { price: 100, currency: 'USD', scrapedAt: '2026-03-05T10:00:00.000Z' },
        { price: 110, currency: 'USD', scrapedAt: '2026-03-05T11:00:00.000Z' },
      ],
      'ga-2': [
        { price: 80, currency: 'EUR', scrapedAt: '2026-03-05T10:00:00.000Z' },
        { price: 84, currency: 'EUR', scrapedAt: '2026-03-05T11:00:00.000Z' },
      ],
      'ge-1': [
        { price: 50, currency: 'USD', scrapedAt: '2026-03-05T10:00:00.000Z' },
        { price: 80, currency: 'USD', scrapedAt: '2026-03-05T11:00:00.000Z' },
      ],
    });

    const response = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.version).toBeDefined();

    expect(payload.totalProducts).toBe(3);
    expect(payload.uniqueProducts).toBe(3);
    expect(payload.anomaliesCount).toBe(1);
    expect(payload.stableProductsPercent).toBe(67);
    expect(payload.dataCoveragePercent).toBe(80);
    expect(payload.buyBoxCoveragePercent).toBe(33);
    expect(payload.discountedProductsPercent).toBe(67);
    expect(payload.primeProductsPercent).toBe(33);
    expect(payload.avgSellerCount).toBe(2);
    expect(payload.distributionBySource.amazon).toBe(2);
    expect(payload.distributionBySource.etsy).toBe(1);
    expect(payload.ratingsHistogram['4']).toBe(1);
    expect(payload.ratingsHistogram['5']).toBe(1);
    expect(payload.medianPrice).toBeCloseTo(87.2, 6);
    expect(payload.averagePrice).toBeCloseTo((100 + 87.2 + 50) / 3, 6);

    expect(payload.segmentMetrics.amazon.count).toBe(2);
    expect(payload.segmentMetrics.amazon.avgPrice).toBeCloseTo(93.6, 6);
    expect(payload.segmentMetrics.amazon.avgValueScore).toBe(24);
    expect(payload.segmentMetrics.amazon.avgMargin).toBeCloseTo(46.8, 6);
    expect(payload.segmentMetrics.amazon.avgTrust).toBe(34);
    expect(payload.segmentMetrics.amazon.avgDiscount).toBe(10);
    expect(payload.segmentMetrics.amazon.specialSharePercent).toBe(50);
    expect(payload.segmentMetrics.amazon.bestOpportunityTitle).toBe('Amazon A');

    expect(payload.segmentMetrics.etsy.count).toBe(1);
    expect(payload.segmentMetrics.etsy.avgPrice).toBe(50);
    expect(payload.segmentMetrics.etsy.avgValueScore).toBe(62);
    expect(payload.segmentMetrics.etsy.avgMargin).toBe(25);
    expect(payload.segmentMetrics.etsy.avgTrust).toBe(100);
    expect(payload.segmentMetrics.etsy.avgDiscount).toBe(20);
    expect(payload.segmentMetrics.etsy.specialSharePercent).toBe(100);
    expect(payload.segmentMetrics.etsy.bestOpportunityTitle).toBe('Etsy A');

    await app.close();
  });

  it('returns metrics definitions contract endpoint', async () => {
    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/api' });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/metrics/definitions' });
    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.version).toBeDefined();
    expect(payload.updatedAt).toBeDefined();
    expect(payload.definitions).toBeDefined();
    expect(payload.definitions.scope.endpoint).toBe('/api/metrics');
    expect(payload.definitions.globalMetrics.averagePrice).toContain('mean');
    expect(payload.definitions.segmentMetrics.fields.avgTrust).toContain('Amazon');

    await app.close();
  });
});
