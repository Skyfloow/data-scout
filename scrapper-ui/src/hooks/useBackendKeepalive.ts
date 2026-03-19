import { useEffect, useRef } from 'react';
import { API_BASE_URL } from '../store/apiSlice';

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10 * 1000;
const MIN_VISIBLE_PING_GAP_MS = 2 * 60 * 1000;

function buildHealthUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/api')) return `${trimmed.slice(0, -4)}/health`;
  return `${trimmed}/health`;
}

interface BackendKeepaliveOptions {
  intervalMs?: number;
  timeoutMs?: number;
  enabled?: boolean;
}

export function useBackendKeepalive(options?: BackendKeepaliveOptions) {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const enabled = options?.enabled ?? import.meta.env.PROD;

  const lastPingAtRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const healthUrl = buildHealthUrl(API_BASE_URL);
    let disposed = false;

    const ping = async (reason: 'startup' | 'interval' | 'visible') => {
      if (disposed) return;

      const startedAt = Date.now();
      lastPingAtRef.current = startedAt;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        await fetch(healthUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            accept: 'application/json',
          },
        });
        if (import.meta.env.DEV) {
          console.debug(`[keepalive] ${reason} ping ok: ${healthUrl}`);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(`[keepalive] ${reason} ping failed: ${healthUrl}`, error);
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void ping('startup');
    const intervalId = window.setInterval(() => {
      void ping('interval');
    }, intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastPingAtRef.current < MIN_VISIBLE_PING_GAP_MS) return;
      void ping('visible');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, intervalMs, timeoutMs]);
}

