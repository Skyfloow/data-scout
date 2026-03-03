import fs from 'fs/promises';
import path from 'path';
import { PriceSnapshot, Product } from '../types';
import { config } from '../config';
import { logger as baseLogger } from '../utils/logger';
import { resolveEffectivePrice } from '../utils/price';
import { metricsService } from './MetricsService';

const logger = baseLogger.child({ module: 'PriceHistoryService' });

const HISTORY_LEGACY_FILE = path.join(config.dataDirPath, 'price-history.json');
const HISTORY_INDEX_FILE = path.join(config.dataDirPath, 'price-history.index.json');
const HISTORY_LOG_FILE = path.join(config.dataDirPath, 'price-history.log.ndjson');

const MAX_HISTORY_PER_KEY = 180;
const COMPACTION_APPEND_THRESHOLD = 250;

type HistoryStore = Record<string, PriceSnapshot[]>;
type PriceHistoryLookup = { id: string; url: string; asin?: string };
type HistoryLogEntry = { key: string; snapshot: PriceSnapshot };

let writeQueue: Promise<void> = Promise.resolve();
let historyStoreCache: HistoryStore | null = null;
let appendedSinceCompaction = 0;

export function getHistoryKey(url: string, asin?: string): string {
  if (asin) return `asin:${asin}`;
  return url.toLowerCase().split('?')[0];
}

function trimSnapshots(snapshots: PriceSnapshot[]): PriceSnapshot[] {
  if (snapshots.length <= MAX_HISTORY_PER_KEY) return snapshots;
  return snapshots.slice(-MAX_HISTORY_PER_KEY);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      logger.warn({ err: error, filePath }, 'Failed to read JSON file');
    }
    return fallback;
  }
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const startedAt = process.hrtime.bigint();
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  metricsService.observe('storage_write_time_ms', durationMs, { op: 'history_atomic_write' });
}

function appendToStore(store: HistoryStore, key: string, snapshot: PriceSnapshot): void {
  const history = store[key] || [];
  history.push(snapshot);
  store[key] = trimSnapshots(history);
}

async function loadBaseHistoryStore(): Promise<HistoryStore> {
  const indexStore = await readJsonFile<HistoryStore>(HISTORY_INDEX_FILE, {});
  if (Object.keys(indexStore).length > 0) {
    return indexStore;
  }

  const legacyStore = await readJsonFile<HistoryStore>(HISTORY_LEGACY_FILE, {});
  const normalizedLegacy: HistoryStore = {};
  for (const [key, snapshots] of Object.entries(legacyStore)) {
    normalizedLegacy[key] = trimSnapshots(Array.isArray(snapshots) ? snapshots : []);
  }

  if (Object.keys(normalizedLegacy).length > 0) {
    await atomicWriteJson(HISTORY_INDEX_FILE, normalizedLegacy);
  }

  return normalizedLegacy;
}

async function replayHistoryLog(store: HistoryStore): Promise<void> {
  try {
    const logContent = await fs.readFile(HISTORY_LOG_FILE, 'utf-8');
    if (!logContent.trim()) return;

    const lines = logContent.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as HistoryLogEntry;
        if (!entry?.key || !entry?.snapshot) continue;
        appendToStore(store, entry.key, entry.snapshot);
      } catch {
        // Ignore malformed lines to keep history resilient.
      }
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      logger.warn({ err: error }, `Failed to replay history log from ${HISTORY_LOG_FILE}`);
    }
  }
}

async function getLoadedStore(): Promise<HistoryStore> {
  if (historyStoreCache) return historyStoreCache;

  const store = await loadBaseHistoryStore();
  await replayHistoryLog(store);
  historyStoreCache = store;
  return store;
}

async function compactHistoryLocked(store: HistoryStore): Promise<void> {
  const startedAt = process.hrtime.bigint();
  await atomicWriteJson(HISTORY_INDEX_FILE, store);
  await fs.mkdir(path.dirname(HISTORY_LOG_FILE), { recursive: true });
  await fs.writeFile(HISTORY_LOG_FILE, '', 'utf-8');
  appendedSinceCompaction = 0;
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  metricsService.observe('storage_write_time_ms', durationMs, { op: 'history_compaction' });
}

async function withWriteLock<T>(operation: (store: HistoryStore) => Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue
    .catch(() => {
      // Keep queue usable after a failed write.
    })
    .then(async () => {
      const store = await getLoadedStore();
      result = await operation(store);
    });
  await writeQueue;
  return result;
}

function buildPriceSnapshot(product: Product): PriceSnapshot {
  const effectivePrice = resolveEffectivePrice(product.metrics);
  const observedAt =
    product.metrics.buyBox?.observedAt ||
    product.metrics.priceObservedAt ||
    product.metrics.itemPriceObservedAt ||
    product.scrapedAt;

  return {
    price: effectivePrice || product.metrics.price || 0,
    priceUSD: product.metrics.priceUSD,
    itemPrice: effectivePrice || product.metrics.itemPrice,
    itemPriceUSD: product.metrics.itemPriceUSD,
    landedPrice: product.metrics.landedPrice,
    landedPriceUSD: product.metrics.landedPriceUSD,
    currency: product.metrics.currency || 'USD',
    scrapedAt: observedAt,
    priceObservedAt: product.metrics.priceObservedAt,
    itemPriceObservedAt: product.metrics.itemPriceObservedAt,
  };
}

export async function appendPriceSnapshot(url: string, product: Product): Promise<PriceSnapshot[]> {
  const key = getHistoryKey(url, product.metrics?.asin);
  const snapshot = buildPriceSnapshot(product);

  return withWriteLock(async (store) => {
    const startedAt = process.hrtime.bigint();
    appendToStore(store, key, snapshot);

    await fs.mkdir(path.dirname(HISTORY_LOG_FILE), { recursive: true });
    await fs.appendFile(HISTORY_LOG_FILE, `${JSON.stringify({ key, snapshot } satisfies HistoryLogEntry)}\n`, 'utf-8');
    const appendDurationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    metricsService.observe('storage_write_time_ms', appendDurationMs, { op: 'history_append' });

    appendedSinceCompaction += 1;
    if (appendedSinceCompaction >= COMPACTION_APPEND_THRESHOLD) {
      await compactHistoryLocked(store);
    }

    return store[key];
  });
}

export async function getPriceHistory(url: string, asin?: string): Promise<PriceSnapshot[]> {
  const store = await getLoadedStore();
  return store[getHistoryKey(url, asin)] || [];
}

export async function getPriceHistoryBatch(lookups: PriceHistoryLookup[]): Promise<Record<string, PriceSnapshot[]>> {
  const store = await getLoadedStore();
  const output: Record<string, PriceSnapshot[]> = {};
  for (const lookup of lookups) {
    output[lookup.id] = store[getHistoryKey(lookup.url, lookup.asin)] || [];
  }
  return output;
}

export async function getAllTrackedUrls(): Promise<string[]> {
  const store = await getLoadedStore();
  return Object.keys(store);
}
