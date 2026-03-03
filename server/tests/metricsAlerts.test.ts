import { beforeEach, describe, expect, it } from 'vitest';
import { metricsService } from '../src/services/MetricsService';

describe('MetricsService alerts', () => {
  beforeEach(() => {
    metricsService.resetForTests();
  });

  it('increments alerts counter when threshold is exceeded', () => {
    metricsService.observe('api_latency_ms', 1600, { route: '/api/test', method: 'GET', status: '200' });

    const snapshot = metricsService.snapshot();
    expect(snapshot.counters['alerts_triggered_total{metric=api_latency_ms}']).toBe(1);
  });

  it('does not trigger alert below threshold', () => {
    metricsService.observe('api_latency_ms', 120, { route: '/api/test', method: 'GET', status: '200' });

    const snapshot = metricsService.snapshot();
    expect(snapshot.counters['alerts_triggered_total{metric=api_latency_ms}']).toBeUndefined();
  });
});
