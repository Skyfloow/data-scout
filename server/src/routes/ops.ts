import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { metricsService } from '../services/MetricsService';

const opsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get(
    '/status',
    {
      schema: {
        description: 'Operational status derived from runtime metric thresholds',
        tags: ['Ops'],
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async () => {
      return metricsService.getOperationalStatus();
    }
  );

  fastify.get(
    '/metrics',
    {
      schema: {
        description: 'Runtime in-memory operational metrics snapshot',
        tags: ['Ops'],
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async () => {
      return metricsService.snapshot();
    }
  );
};

export default opsRoutes;
