import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dashboardRoutes from '../src/routes/dashboard';
import { storageService } from '../src/modules/storage/services/StorageService';
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
      brand: 'brand',
      imageUrl: 'https://img.example.com/a.jpg',
      availability: 'In Stock',
      averageRating: 4.2,
      offers: [],
      description: 'desc',
      features: [],
      imageUrls: [],
    },
    ...overrides,
  };
}

describe('Dashboard metrics endpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns only basic and auditable metrics', async () => {
    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/api' });
    await app.ready();

    vi.spyOn(storageService, 'getAllProducts').mockResolvedValue([makeProduct('1')]);

    const response = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.averagePrice).toBeDefined();
    expect(payload.totalProducts).toBeDefined();
    expect(payload.uniqueProducts).toBeDefined();
    expect(payload.segmentMetrics).toBeUndefined();
    expect(payload.anomaliesCount).toBeUndefined();

    await app.close();
  });

  it('calculates median/average and marketplace shares from latest unique products', async () => {
    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/api' });
    await app.ready();

    const oldAmazon = makeProduct('1', {
      url: 'https://amazon.com/dp/B000000001',
      marketplace: 'amazon.com',
      scrapedAt: '2026-03-10T10:00:00.000Z',
      metrics: {
        price: 90,
        currency: 'USD',
        brand: 'brand',
        imageUrl: 'https://img.example.com/a.jpg',
        availability: 'In Stock',
        averageRating: 4,
        offers: [],
        description: 'desc',
        features: [],
        imageUrls: [],
      },
    });

    const latestAmazon = makeProduct('2', {
      url: 'https://amazon.com/dp/B000000001',
      marketplace: 'amazon.com',
      scrapedAt: '2026-03-10T11:00:00.000Z',
      metrics: {
        price: 100,
        currency: 'USD',
        brand: 'brand',
        imageUrl: 'https://img.example.com/a.jpg',
        availability: 'In Stock',
        averageRating: 5,
        offers: [],
        description: 'desc',
        features: [],
        imageUrls: [],
      },
    });

    const etsy = makeProduct('3', {
      url: 'https://etsy.com/listing/1',
      marketplace: 'etsy.com',
      scrapedAt: '2026-03-10T11:05:00.000Z',
      metrics: {
        price: 50,
        currency: 'USD',
        brand: 'brand',
        imageUrl: 'https://img.example.com/a.jpg',
        availability: 'In Stock',
        averageRating: 3.7,
        offers: [],
        description: 'desc',
        features: [],
        imageUrls: [],
      },
    });

    vi.spyOn(storageService, 'getAllProducts').mockResolvedValue([oldAmazon, latestAmazon, etsy]);

    const response = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.totalProducts).toBe(3);
    expect(payload.uniqueProducts).toBe(2);
    expect(payload.productsWithPrice).toBe(2);
    expect(payload.averagePrice).toBe(75);
    expect(payload.medianPrice).toBe(75);
    expect(payload.amazonProducts).toBe(1);
    expect(payload.etsyProducts).toBe(1);
    expect(payload.marketplaceShare.amazon).toBe(50);
    expect(payload.marketplaceShare.etsy).toBe(50);
    expect(payload.productsWithRating).toBe(2);
    expect(payload.ratingCoveragePercent).toBe(100);

    await app.close();
  });

  it('removes metrics definitions endpoint', async () => {
    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/api' });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/metrics/definitions' });
    expect(response.statusCode).toBe(404);

    await app.close();
  });
});
