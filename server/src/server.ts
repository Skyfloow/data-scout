import Fastify from 'fastify';
import { config } from './config';
import { logger } from './utils/logger';
import swaggerPlugin from './plugins/swagger';
import corsPlugin from './plugins/cors';
import authPlugin from './plugins/auth';
import fastifyRateLimit from '@fastify/rate-limit';
import scrapingRoutes from './routes/scraping';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import opsRoutes from './routes/ops';
import { storageService } from './modules/storage/services/StorageService';
import { initCurrencyService, stopCurrencyService } from './services/CurrencyService';
import { initScheduler, stopScheduler } from './services/SchedulerService';
import monitoringRoutes, { scheduledScrape } from './routes/monitoring';
import { migrateLegacyMonitors } from './services/MigrationService';
import { proxyManager } from './modules/proxy/services/ProxyManager';
import { createApiErrorPayload } from './utils/http';
import { metricsService } from './services/MetricsService';

const server = Fastify({
  loggerInstance: logger,
});

async function start() {
  try {
    // Register Plugins
    await server.register(corsPlugin);
    await server.register(authPlugin);
    if (config.swaggerEnabled) {
      await server.register(swaggerPlugin);
    }
    
    // Security: Rate limiter to prevent abuse
    await server.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '1 minute'
    });

    server.addHook('onRequest', async (request) => {
      (request as any).__requestStartNs = process.hrtime.bigint();
    });

    server.addHook('onResponse', async (request, reply) => {
      const startedAt = (request as any).__requestStartNs as bigint | undefined;
      if (!startedAt) return;

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = request.routeOptions?.url || request.url;
      metricsService.observe('api_latency_ms', durationMs, {
        method: request.method,
        route,
        status: String(reply.statusCode),
      });
    });

    // Disable caching globally for all API routes to prevent RTK Query staleness
    server.addHook('onSend', async (_request, reply, payload) => {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
      return payload;
    });

    // Global Error Handler
    server.setErrorHandler((error: any, request, reply) => {
      server.log.error(error);
      const statusCode = error.statusCode || 500;
      const message = statusCode === 500 ? 'An internal error occurred' : (error.message || 'Request failed');
      const code = statusCode === 500 ? 'INTERNAL_ERROR' : (error.code || error.name || 'REQUEST_ERROR');
      reply.status(statusCode).send(createApiErrorPayload(code, message, statusCode, error.validation));
    });

    server.setNotFoundHandler((request, reply) => {
      reply.status(404).send(
        createApiErrorPayload('NOT_FOUND', `Route ${request.method} ${request.url} not found`, 404)
      );
    });

    // Initialize the storage persistence (creates directories if missing)
    await storageService.initialize();

    // Initialize Proxy Manager for fetching lists
    await proxyManager.initialize();

    // Initialize ECB currency exchange rates (fetches and caches daily)
    await initCurrencyService();

    // Migrate old settings
    await migrateLegacyMonitors();

    // Initialize the scheduler for monitored URLs/Entities
    await initScheduler(scheduledScrape);

    // Register Routes
    await server.register(scrapingRoutes, { prefix: '/api' });
    await server.register(dashboardRoutes, { prefix: '/api' });
    await server.register(monitoringRoutes, { prefix: '/api' });
    await server.register(settingsRoutes, { prefix: '/api/settings' });
    await server.register(opsRoutes, { prefix: '/api/ops' });

    server.get('/', async () => {
      return { status: 'ok' };
    });

    server.get('/health', { config: { rateLimit: false } }, async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    server.addHook('onClose', async () => {
      stopScheduler();
      stopCurrencyService();
      await proxyManager.shutdown();
    });

    await server.listen({ port: config.port, host: config.host });
    server.log.info(`Server running at http://${config.host}:${config.port}`);
    if (config.swaggerEnabled) {
      server.log.info(`Swagger UI available at http://${config.host}:${config.port}/docs`);
    }

    const shutdown = async (signal: string) => {
      server.log.info(`Received ${signal}. Shutting down gracefully...`);
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
