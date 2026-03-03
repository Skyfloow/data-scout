import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { storageService } from '../modules/storage/services/StorageService';
import { proxyManager } from '../modules/proxy/services/ProxyManager';
import { AppSettings } from '../types';

const settingsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get(
    '/',
    {
      schema: {
        description: 'Get application settings',
        tags: ['Settings'],
        response: {
          200: {
            type: 'object',
            properties: {
              scrapingStrategy: { type: 'string', enum: ['hybrid', 'fast', 'stealth'] },
              defaultScraper: { type: 'string', enum: ['crawler', 'firecrawl'] },
              proxyMode: { type: 'string', enum: ['direct', 'free', 'paid'] },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const settings = await storageService.getSettings();
      return settings;
    }
  );

  fastify.post<{ Body: AppSettings }>(
    '/',
    {
      schema: {
        description: 'Update application settings',
        tags: ['Settings'],
        body: {
          type: 'object',
          properties: {
            scrapingStrategy: { type: 'string', enum: ['hybrid', 'fast', 'stealth'] },
            defaultScraper: { type: 'string', enum: ['crawler', 'firecrawl'] },
            proxyMode: { type: 'string', enum: ['direct', 'free', 'paid'] },
          },
          required: ['scrapingStrategy', 'defaultScraper'],
        },
      },
    },
    async (request, reply) => {
      await storageService.saveSettings(request.body);
      // Re-initialize proxy manager if settings change
      await proxyManager.initialize();
      return { success: true };
    }
  );
};

export default settingsRoutes;
