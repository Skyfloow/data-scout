import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import opsRoutes from '../src/routes/ops';
import { metricsService } from '../src/services/MetricsService';

describe('Ops metrics endpoint', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    metricsService.resetForTests();
    app = Fastify();
    await app.register(opsRoutes, { prefix: '/api/ops' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns in-memory metrics snapshot', async () => {
    metricsService.observe('api_latency_ms', 42, { route: '/api/test', method: 'GET', status: '200' });
    metricsService.setGauge('scheduler_active_timers', 2);

    const response = await app.inject({
      method: 'GET',
      url: '/api/ops/metrics',
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.generatedAt).toBeDefined();
    expect(payload.timings['api_latency_ms{method=GET,route=/api/test,status=200}']).toBeDefined();
    expect(payload.gauges.scheduler_active_timers).toBe(2);
  });

  it('returns degraded status when thresholds are exceeded', async () => {
    metricsService.observe('api_latency_ms', 1400, { route: '/api/test', method: 'GET', status: '200' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/ops/status',
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.status).toBe('degraded');
    const latencyCheck = payload.checks.find((check: any) => check.metric === 'api_latency_ms');
    expect(latencyCheck).toBeDefined();
    expect(latencyCheck.degraded).toBe(true);
  });
});
