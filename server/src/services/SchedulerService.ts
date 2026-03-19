import { MonitoredEntity } from '../types';
import { storageService } from '../modules/storage/services/StorageService';
import { v4 as uuidv4 } from 'uuid';
import { logger as baseLogger } from '../utils/logger';
import { metricsService } from './MetricsService';

const logger = baseLogger.child({ module: 'SchedulerService' });

export async function getMonitoredEntities(): Promise<MonitoredEntity[]> {
  return storageService.getMonitoredEntities();
}

export async function addMonitoredEntity(
  type: MonitoredEntity['type'],
  value: string,
  marketplace: string,
  intervalHours: number
): Promise<MonitoredEntity> {
  const list = await getMonitoredEntities();
  
  // Find existing by type and value
  const existing = list.find(m => m.type === type && m.value === value && m.marketplace === marketplace);
  if (existing) {
    existing.intervalHours = intervalHours;
    await storageService.saveMonitoredEntity(existing);
    return existing;
  }
  
  const entry: MonitoredEntity = { 
    id: uuidv4(),
    type,
    value, 
    marketplace,
    intervalHours, 
    addedAt: new Date().toISOString(),
    status: 'active'
  };
  await storageService.saveMonitoredEntity(entry);
  return entry;
}

export async function removeMonitoredEntity(id: string): Promise<boolean> {
  return storageService.deleteMonitoredEntity(id);
}

// Active timer handles by Entity ID
const activeTimers = new Map<string, NodeJS.Timeout>();
const inFlightRuns = new Set<string>();

type ScrapeFn = (entity: MonitoredEntity) => Promise<boolean>;

function computeNextRunAt(intervalHours: number): string {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  return new Date(Date.now() + intervalMs).toISOString();
}

function clearEntityTimer(id: string): void {
  const timer = activeTimers.get(id);
  if (timer) {
    clearInterval(timer);
    activeTimers.delete(id);
    metricsService.setGauge('scheduler_active_timers', activeTimers.size);
  }
}

async function runScheduledScrape(entry: MonitoredEntity, scrapeFn: ScrapeFn): Promise<void> {
  if (inFlightRuns.has(entry.id)) {
    logger.warn(`Skipping overlapping run for [${entry.type}] ${entry.value}`);
    return;
  }
  inFlightRuns.add(entry.id);
  logger.info(`Running scheduled scrape for [${entry.type}] ${entry.value}`);
  try {
    const scrapeSucceeded = await scrapeFn(entry);
    // Persist run cadence so restarts can restore schedule context.
    const now = new Date().toISOString();
    const nextRunAt = computeNextRunAt(entry.intervalHours);
    await storageService.updateEntityRunState(
      entry.id,
      scrapeSucceeded
        ? {
            lastRunAt: now,
            lastScrapedAt: now,
            nextRunAt,
          }
        : {
            lastRunAt: now,
            nextRunAt,
          }
    );
  } catch (err: any) {
    logger.error(`Failed scheduled scrape for [${entry.type}] ${entry.value}: ${err.message}`);
  } finally {
    inFlightRuns.delete(entry.id);
  }
}

function scheduleEntity(entry: MonitoredEntity, scrapeFn: ScrapeFn): void {
  clearEntityTimer(entry.id);
  if (entry.status !== 'active') return;

  const intervalMs = entry.intervalHours * 60 * 60 * 1000;
  let expectedRunAtMs = Date.now() + intervalMs;

  const nextRunAt = computeNextRunAt(entry.intervalHours);
  entry.nextRunAt = nextRunAt;
  void storageService.updateEntityRunState(entry.id, { nextRunAt });
  
  const timer = setInterval(async () => {
    const now = Date.now();
    const lagMs = Math.max(0, now - expectedRunAtMs);
    metricsService.observe('scheduler_lag_ms', lagMs, { entityType: entry.type });
    expectedRunAtMs += intervalMs;
    await runScheduledScrape(entry, scrapeFn);
  }, intervalMs);

  activeTimers.set(entry.id, timer);
  metricsService.setGauge('scheduler_active_timers', activeTimers.size);
  logger.info(`Monitoring [${entry.type}] ${entry.value} every ${entry.intervalHours}h`);
}

/**
 * Initialize scheduler on server startup.
 * Loads monitored entities from disk and sets up intervals.
 */
export async function initScheduler(scrapeFn: ScrapeFn): Promise<void> {
  const list = await getMonitoredEntities();
  for (const entry of list) {
    scheduleEntity(entry, scrapeFn);
  }
  logger.info(`Started with ${list.length} monitored entities.`);
}

/**
 * Dynamically add a new entity to the scheduler at runtime.
 */
export async function scheduleNew(
  type: MonitoredEntity['type'],
  value: string,
  marketplace: string,
  intervalHours: number,
  scrapeFn: ScrapeFn
): Promise<MonitoredEntity> {
  const entry = await addMonitoredEntity(type, value, marketplace, intervalHours);
  entry.status = 'active';
  entry.nextRunAt = computeNextRunAt(intervalHours);
  await storageService.saveMonitoredEntity(entry);

  scheduleEntity(entry, scrapeFn);
  // Run first scrape immediately so UI does not stay in "waiting" state until first interval tick.
  setTimeout(() => {
    void runScheduledScrape(entry, scrapeFn);
  }, 250);
  return entry;
}

/**
 * Remove an entity from the scheduler at runtime (by ID).
 */
export async function unschedule(id: string): Promise<boolean> {
  clearEntityTimer(id);
  return removeMonitoredEntity(id);
}

export function stopScheduler(): void {
  for (const timer of activeTimers.values()) {
    clearInterval(timer);
  }
  activeTimers.clear();
  inFlightRuns.clear();
  metricsService.setGauge('scheduler_active_timers', 0);
  logger.info('Scheduler stopped.');
}

export async function setMonitoringStatus(
  id: string,
  status: 'active' | 'paused',
  scrapeFn: ScrapeFn
): Promise<MonitoredEntity | null> {
  const list = await getMonitoredEntities();
  const entry = list.find((m) => m.id === id);
  if (!entry) return null;

  entry.status = status;
  entry.nextRunAt = status === 'active' ? computeNextRunAt(entry.intervalHours) : undefined;
  await storageService.saveMonitoredEntity(entry);

  if (status === 'paused') {
    clearEntityTimer(id);
    logger.info(`Paused monitoring for [${entry.type}] ${entry.value}`);
    return entry;
  }

  scheduleEntity(entry, scrapeFn);
  logger.info(`Resumed monitoring for [${entry.type}] ${entry.value}`);
  return entry;
}
