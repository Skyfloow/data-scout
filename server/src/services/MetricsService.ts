type MetricStats = {
  count: number;
  sum: number;
  min: number;
  max: number;
  last: number;
};

import { logger as baseLogger } from '../utils/logger';

const logger = baseLogger.child({ module: 'MetricsService' });

const ALERT_THRESHOLDS_MS: Record<string, number> = {
  api_latency_ms: 1200,
  scheduler_lag_ms: 5000,
  storage_write_time_ms: 250,
};
const ALERT_COOLDOWN_MS = 60_000;

function makeMetricKey(name: string, tags?: Record<string, string>): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const serialized = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${name}{${serialized}}`;
}

class MetricsService {
  private timings = new Map<string, MetricStats>();
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private lastAlertAt = new Map<string, number>();

  observe(name: string, value: number, tags?: Record<string, string>): void {
    if (!Number.isFinite(value) || value < 0) return;
    const key = makeMetricKey(name, tags);
    const existing = this.timings.get(key);
    if (!existing) {
      this.timings.set(key, {
        count: 1,
        sum: value,
        min: value,
        max: value,
        last: value,
      });
      this.evaluateThreshold(name, value, tags);
      return;
    }

    existing.count += 1;
    existing.sum += value;
    existing.min = Math.min(existing.min, value);
    existing.max = Math.max(existing.max, value);
    existing.last = value;

    this.evaluateThreshold(name, value, tags);
  }

  increment(name: string, by = 1, tags?: Record<string, string>): void {
    if (!Number.isFinite(by)) return;
    const key = makeMetricKey(name, tags);
    this.counters.set(key, (this.counters.get(key) || 0) + by);
  }

  setGauge(name: string, value: number, tags?: Record<string, string>): void {
    if (!Number.isFinite(value)) return;
    const key = makeMetricKey(name, tags);
    this.gauges.set(key, value);
  }

  private evaluateThreshold(name: string, value: number, tags?: Record<string, string>): void {
    const threshold = ALERT_THRESHOLDS_MS[name];
    if (!threshold || value <= threshold) return;

    const alertKey = makeMetricKey(name, tags);
    const now = Date.now();
    const last = this.lastAlertAt.get(alertKey) || 0;
    if (now - last < ALERT_COOLDOWN_MS) return;

    this.lastAlertAt.set(alertKey, now);
    this.increment('alerts_triggered_total', 1, { metric: name });
    logger.warn({ metric: name, value, threshold, tags }, 'Metric threshold exceeded');
  }

  snapshot(): {
    generatedAt: string;
    timings: Record<string, MetricStats & { avg: number }>;
    counters: Record<string, number>;
    gauges: Record<string, number>;
  } {
    const timings: Record<string, MetricStats & { avg: number }> = {};
    for (const [key, value] of this.timings.entries()) {
      timings[key] = {
        ...value,
        avg: value.count > 0 ? value.sum / value.count : 0,
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      timings,
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries()),
    };
  }

  getOperationalStatus(): {
    generatedAt: string;
    status: 'ok' | 'degraded';
    checks: Array<{
      metric: string;
      threshold: number;
      maxObserved: number;
      lastObserved: number;
      breachCount: number;
      degraded: boolean;
    }>;
  } {
    const checks = Object.entries(ALERT_THRESHOLDS_MS).map(([metricName, threshold]) => {
      let maxObserved = 0;
      let lastObserved = 0;
      let breachCount = 0;

      for (const [key, stat] of this.timings.entries()) {
        const metricKey = key.includes('{') ? key.slice(0, key.indexOf('{')) : key;
        if (metricKey !== metricName) continue;

        maxObserved = Math.max(maxObserved, stat.max);
        lastObserved = Math.max(lastObserved, stat.last);
        if (stat.max > threshold) breachCount += 1;
      }

      const degraded = lastObserved > threshold;
      return {
        metric: metricName,
        threshold,
        maxObserved,
        lastObserved,
        breachCount,
        degraded,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      status: checks.some((check) => check.degraded) ? 'degraded' : 'ok',
      checks,
    };
  }

  resetForTests(): void {
    this.timings.clear();
    this.counters.clear();
    this.gauges.clear();
    this.lastAlertAt.clear();
  }
}

export const metricsService = new MetricsService();
