import fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { storageService } from '../modules/storage/services/StorageService';
import { MonitoredEntity } from '../types';
import { logger as baseLogger } from '../utils/logger';
import { config } from '../config';

const logger = baseLogger.child({ module: 'MigrationService' });

const LEGACY_FILE = path.join(config.dataDirPath, 'monitored-urls.json');

export async function migrateLegacyMonitors(): Promise<void> {
  try {
    await fs.access(LEGACY_FILE);
  } catch {
    return;
  }

  try {
    const content = await fs.readFile(LEGACY_FILE, 'utf-8');
    const legacyUrls: Array<Record<string, unknown>> = JSON.parse(content);
    
    if (legacyUrls.length === 0) return;

    logger.info(`Found ${legacyUrls.length} legacy monitored URLs. Migrating...`);
    
    // Deduplication Set
    const currentEntities = await storageService.getMonitoredEntities();
    const existingValues = new Set(currentEntities.map(e => e.value));

    // Convert
    for (const legacy of legacyUrls) {
      const legacyUrl = typeof legacy.url === 'string' ? legacy.url : '';
      if (!legacyUrl || existingValues.has(legacyUrl)) continue;
      
      let marketplace = 'unknown';
      if (legacyUrl.includes('amazon')) marketplace = 'amazon.com';
      else if (legacyUrl.includes('ebay')) marketplace = 'ebay';
      
      const entity: MonitoredEntity = {
        id: uuidv4(),
        type: 'product',
        value: legacyUrl,
        marketplace,
        intervalHours: typeof legacy.intervalHours === 'number' && legacy.intervalHours > 0 ? legacy.intervalHours : 24,
        addedAt: typeof legacy.addedAt === 'string' ? legacy.addedAt : new Date().toISOString(),
        lastScrapedAt: typeof legacy.lastScrapedAt === 'string' ? legacy.lastScrapedAt : undefined,
        status: 'active'
      };
      
      await storageService.saveMonitoredEntity(entity);
    }

    // Rename file to prevent re-migration
    await fs.rename(LEGACY_FILE, `${LEGACY_FILE}.migrated`);
    logger.info(`Legacy migration complete. Rest in peace monitored-urls.json.`);

  } catch (err) {
    logger.error({ err }, `Error migrating legacy monitors`);
  }
}
