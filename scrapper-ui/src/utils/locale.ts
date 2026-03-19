export function resolveAppLocale(language?: string): string {
  const normalized = String(language || '').toLowerCase();
  if (normalized.startsWith('uk')) return 'uk-UA';
  return 'en-US';
}

export function formatDateTime(value: string | Date | undefined, language?: string): string {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return parsed.toLocaleString(resolveAppLocale(language));
}

export function formatNumber(value: number, language?: string): string {
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString(resolveAppLocale(language));
}

export function formatDateTimeCompact(value: string | Date | undefined, language?: string): string {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(resolveAppLocale(language), {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

export function formatChartTime(value: Date, language?: string): string {
  if (!Number.isFinite(value.getTime())) return '';
  return new Intl.DateTimeFormat(resolveAppLocale(language), {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}
