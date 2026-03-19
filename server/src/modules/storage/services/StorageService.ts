import fs from 'fs/promises';
import path from 'path';
import { Product, ScraperType, AppSettings, MonitoredEntity, SerpResult } from '../../../types';
import { config } from '../../../config';
import { logger as baseLogger } from '../../../utils/logger';
import { metricsService } from '../../../services/MetricsService';

const logger = baseLogger.child({ module: 'StorageService' });

export class StorageService {
  private dataDir: string;
  private locks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.dataDir = config.dataDirPath;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      logger.error({ err: error }, 'Failed to create data directory');
    }
  }

  private getFilePath(scraper: ScraperType): string {
    return path.join(this.dataDir, `${scraper}-data.json`);
  }

  private getLatestProductsIndexPath(): string {
    return path.join(this.dataDir, 'latest-products.json');
  }

  private getScansDirPath(): string {
    return path.join(this.dataDir, 'scans');
  }

  private getScanFilePath(scanId: string): string {
    return path.join(this.getScansDirPath(), `${scanId}.json`);
  }

  private getLatestSerpIndexPath(): string {
    return path.join(this.dataDir, 'latest-serp.json');
  }

  private normalizeUrlKey(url: string): string {
    return url.toLowerCase().split('?')[0];
  }

  private getSerpTrackerKey(keyword: string, marketplace: string): string {
    return `${keyword}::${marketplace}`;
  }

  private async executeLocked<T>(lockKey: string, operation: () => Promise<T>): Promise<T> {
    const existingLock = this.locks.get(lockKey) || Promise.resolve();

    let releaseLock: () => void = () => {};
    const newLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(lockKey, existingLock.then(() => newLock));

    try {
      await existingLock;
      return await operation();
    } finally {
      releaseLock();
      if (this.locks.get(lockKey) === newLock) {
        this.locks.delete(lockKey);
      }
    }
  }

  private async atomicWrite(filePath: string, data: any): Promise<void> {
    const startedAt = process.hrtime.bigint();
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    metricsService.observe('storage_write_time_ms', durationMs, { op: 'atomicWrite' });
  }

  async saveProduct(scraper: ScraperType, product: Product): Promise<void> {
    const filePath = this.getFilePath(scraper);
    await this.executeLocked(filePath, async () => {
      let data: Product[] = [];
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        data = JSON.parse(fileContent);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          logger.error({ err }, `Failed to read file ${filePath}`);
        }
      }

      data.push(product);

      await this.atomicWrite(filePath, data);
    });

    const scanFilePath = this.getScanFilePath(product.id);
    await this.executeLocked(scanFilePath, async () => {
      await fs.mkdir(this.getScansDirPath(), { recursive: true });
      await this.atomicWrite(scanFilePath, product);
    });

    const latestProductsPath = this.getLatestProductsIndexPath();
    await this.executeLocked(latestProductsPath, async () => {
      let latestByUrl: Record<string, Product> = {};
      try {
        const content = await fs.readFile(latestProductsPath, 'utf-8');
        latestByUrl = JSON.parse(content);
      } catch {
        // file missing, start fresh
      }
      const lookupKey = this.normalizeUrlKey(product.url);
      const existing = latestByUrl[lookupKey];
      if (!existing || new Date(product.scrapedAt).getTime() >= new Date(existing.scrapedAt).getTime()) {
        latestByUrl[lookupKey] = product;
        await this.atomicWrite(latestProductsPath, latestByUrl);
      }
    });
  }

  async getAllProducts(filters?: { source?: string; scraper?: ScraperType }): Promise<Product[]> {
    const scrapers: ScraperType[] = ['crawler', 'firecrawl'];
    const scrapersToRead = filters?.scraper ? [filters.scraper] : scrapers;

    let allProducts: Product[] = [];

    for (const scraper of scrapersToRead) {
      const filePath = this.getFilePath(scraper);
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const data: Product[] = JSON.parse(fileContent);
        allProducts = allProducts.concat(data);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          logger.error({ err }, `Failed to read file ${filePath}`);
        }
      }
    }

    if (filters?.source) {
      const requestedSource = filters.source.toLowerCase();
      allProducts = allProducts.filter((p) => {
        const marketplace = (p.marketplace || '').toLowerCase();
        if (!marketplace) return false;
        if (marketplace === requestedSource) return true;
        // Backward-compatible filtering: source=amazon should include amazon.com/.de/.it etc.
        if (requestedSource === 'amazon') return marketplace.includes('amazon');
        if (requestedSource === 'etsy') return marketplace.includes('etsy');
        return marketplace.includes(requestedSource);
      });
    }

    // Sort by scrapedAt descending
    return allProducts.sort((a, b) => new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime());
  }

  async getProductByAsin(asin: string): Promise<Product | null> {
    const allProducts = await this.getAllProducts();
    return allProducts.find((p) => p.metrics.asin === asin) || null;
  }

  async getProductByUrl(url: string): Promise<Product | null> {
    const allProducts = await this.getAllProducts();
    // Use URL without query parameters for matching (simplistic match)
    const baseSearchUrl = url.toLowerCase().split('?')[0];
    return allProducts.find((p) => {
      const pUrl = p.url.toLowerCase().split('?')[0];
      return pUrl === baseSearchUrl;
    }) || null;
  }

  async deleteProducts(ids: string[]): Promise<number> {
    const scrapers: ScraperType[] = ['crawler', 'firecrawl'];
    const idSet = new Set(ids);
    let deletedCount = 0;

    for (const scraper of scrapers) {
      const filePath = this.getFilePath(scraper);
      await this.executeLocked(filePath, async () => {
        let data: Product[] = [];

        try {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          data = JSON.parse(fileContent);
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            logger.error({ err }, `Failed to read file ${filePath}`);
          }
          return;
        }

        const before = data.length;
        data = data.filter((p) => !idSet.has(p.id));
        deletedCount += before - data.length;

        if (before !== data.length) {
          await this.atomicWrite(filePath, data);
        }
      });
    }

    return deletedCount;
  }

  async getSettings(): Promise<AppSettings> {
    const filePath = path.join(this.dataDir, 'settings.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { scrapingStrategy: 'hybrid', defaultScraper: 'crawler' };
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const filePath = path.join(this.dataDir, 'settings.json');
    return this.executeLocked(filePath, async () => {
      await this.atomicWrite(filePath, settings);
    });
  }

  // ─── Phase 10: Multi-Entity Monitoring ───

  async getMonitoredEntities(): Promise<MonitoredEntity[]> {
    const filePath = path.join(this.dataDir, 'monitored-entities.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  async saveMonitoredEntities(entities: MonitoredEntity[]): Promise<void> {
    const filePath = path.join(this.dataDir, 'monitored-entities.json');
    return this.executeLocked(filePath, async () => {
      await this.atomicWrite(filePath, entities);
    });
  }

  async saveMonitoredEntity(entity: MonitoredEntity): Promise<void> {
    const filePath = path.join(this.dataDir, 'monitored-entities.json');
    return this.executeLocked(filePath, async () => {
      let entities: MonitoredEntity[] = [];
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        entities = JSON.parse(content);
      } catch {
        // file missing, start fresh
      }
      const existingIndex = entities.findIndex(e => e.id === entity.id);
      if (existingIndex >= 0) {
        entities[existingIndex] = entity;
      } else {
        entities.push(entity);
      }
      await this.atomicWrite(filePath, entities);
    });
  }

  async deleteMonitoredEntity(id: string): Promise<boolean> {
    const filePath = path.join(this.dataDir, 'monitored-entities.json');
    return this.executeLocked(filePath, async () => {
      let entities: MonitoredEntity[] = [];
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        entities = JSON.parse(content);
      } catch {
        return false;
      }
      const beforeLength = entities.length;
      entities = entities.filter(e => e.id !== id);
      if (entities.length < beforeLength) {
        await this.atomicWrite(filePath, entities);
        return true;
      }
      return false;
    });
  }

  // ─── SERP Results ───

  async getSerpHistory(keyword: string, marketplace: string): Promise<SerpResult[]> {
    const filePath = path.join(this.dataDir, 'serp-history.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const allResults: SerpResult[] = JSON.parse(content);
      return allResults.filter(r => r.keyword === keyword && r.marketplace === marketplace);
    } catch {
      return [];
    }
  }

  async getAllSerpResults(): Promise<SerpResult[]> {
    const filePath = path.join(this.dataDir, 'serp-history.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  async saveSerpResult(result: SerpResult): Promise<void> {
    const filePath = path.join(this.dataDir, 'serp-history.json');
    await this.executeLocked(filePath, async () => {
      let allResults: SerpResult[] = [];
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        allResults = JSON.parse(content);
      } catch {
        // file missing, start fresh
      }
      allResults.push(result);
      await this.atomicWrite(filePath, allResults);
    });

    const latestSerpPath = this.getLatestSerpIndexPath();
    await this.executeLocked(latestSerpPath, async () => {
      let latestByTracker: Record<string, { scrapedAt: string; topAsin?: string; topTitle?: string }> = {};
      try {
        const content = await fs.readFile(latestSerpPath, 'utf-8');
        latestByTracker = JSON.parse(content);
      } catch {
        // file missing, start fresh
      }
      const trackerKey = this.getSerpTrackerKey(result.keyword, result.marketplace);
      const topRank = result.rankings?.find((r) => r.rank === 1) || result.rankings?.[0];
      const existing = latestByTracker[trackerKey];
      if (!existing || new Date(result.scrapedAt).getTime() >= new Date(existing.scrapedAt).getTime()) {
        latestByTracker[trackerKey] = {
          scrapedAt: result.scrapedAt,
          topAsin: topRank?.asin,
          topTitle: topRank?.title,
        };
        await this.atomicWrite(latestSerpPath, latestByTracker);
      }
    });
  }

  async getLatestProductsIndex(): Promise<Record<string, Product>> {
    const filePath = this.getLatestProductsIndexPath();
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') return {};

      // One-time migration: build compact latest index from legacy full product files.
      const allProducts = await this.getAllProducts();
      const latestByUrl: Record<string, Product> = {};
      for (const product of allProducts) {
        const lookupKey = this.normalizeUrlKey(product.url);
        const existing = latestByUrl[lookupKey];
        if (!existing || new Date(product.scrapedAt).getTime() >= new Date(existing.scrapedAt).getTime()) {
          latestByUrl[lookupKey] = product;
        }
      }

      await this.executeLocked(filePath, async () => {
        await this.atomicWrite(filePath, latestByUrl);
      });
      return latestByUrl;
    }
  }

  async getLatestSerpIndex(): Promise<Record<string, { scrapedAt: string; topAsin?: string; topTitle?: string }>> {
    const filePath = this.getLatestSerpIndexPath();
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') return {};

      // One-time migration: build compact latest index from serp history.
      const allResults = await this.getAllSerpResults();
      const latestByTracker: Record<string, { scrapedAt: string; topAsin?: string; topTitle?: string }> = {};
      for (const result of allResults) {
        const key = this.getSerpTrackerKey(result.keyword, result.marketplace);
        const existing = latestByTracker[key];
        if (!existing || new Date(result.scrapedAt).getTime() >= new Date(existing.scrapedAt).getTime()) {
          const topRank = result.rankings?.find((r) => r.rank === 1) || result.rankings?.[0];
          latestByTracker[key] = {
            scrapedAt: result.scrapedAt,
            topAsin: topRank?.asin,
            topTitle: topRank?.title,
          };
        }
      }

      await this.executeLocked(filePath, async () => {
        await this.atomicWrite(filePath, latestByTracker);
      });
      return latestByTracker;
    }
  }
  
  // Update scheduling timestamps surgically to avoid rewriting and losing entries if there's a race
  async updateEntityRunState(
    id: string,
    update: { lastScrapedAt?: string; lastRunAt?: string; nextRunAt?: string }
  ): Promise<boolean> {
    const filePath = path.join(this.dataDir, 'monitored-entities.json');
    return this.executeLocked(filePath, async () => {
      let entities: MonitoredEntity[] = [];
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        entities = JSON.parse(content);
      } catch {
        return false;
      }
      
      const entity = entities.find(e => e.id === id);
      if (!entity) return false;

      if (update.lastScrapedAt) entity.lastScrapedAt = update.lastScrapedAt;
      if (update.lastRunAt) entity.lastRunAt = update.lastRunAt;
      if (update.nextRunAt) entity.nextRunAt = update.nextRunAt;

      await this.atomicWrite(filePath, entities);
      return true;
    });
  }

  async updateEntityScrapedTimestamp(id: string, timestamp: string): Promise<boolean> {
    return this.updateEntityRunState(id, { lastScrapedAt: timestamp, lastRunAt: timestamp });
  }
}

// Singleton export
export const storageService = new StorageService();
