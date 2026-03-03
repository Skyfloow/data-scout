import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { config } from '../config';

export default fp(async (fastify: FastifyInstance) => {
  if (!config.authEnabled) {
    fastify.log.warn('API key auth is disabled because API_KEYS/API_KEY is empty.');
    return;
  }

  const allowedKeys = new Set(config.apiKeys);
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api')) return;
    const apiKey = request.headers['x-api-key'];
    const value = Array.isArray(apiKey) ? apiKey[0] : apiKey;

    if (!value || !allowedKeys.has(value)) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Valid x-api-key header is required',
        statusCode: 401,
      });
    }
  });
});
