type LogLevel = 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

function log(level: LogLevel, message: string, error?: unknown) {
  if (isDev) {
    if (level === 'error') {
      console.error(message, error);
      return;
    }
    if (level === 'warn') {
      console.warn(message, error);
      return;
    }
    console.info(message, error);
    return;
  }

  // Production hook: replace with Sentry/Datadog/etc.
  if (level === 'error') {
    console.error(message);
  }
}

export const logger = {
  info: (message: string, payload?: unknown) => log('info', message, payload),
  warn: (message: string, payload?: unknown) => log('warn', message, payload),
  error: (message: string, error?: unknown) => log('error', message, error),
};
