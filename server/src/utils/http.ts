export interface ApiErrorPayload {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
  error: string;
}

export function createApiErrorPayload(
  code: string,
  message: string,
  statusCode: number,
  details?: unknown
): ApiErrorPayload {
  return {
    code,
    message,
    statusCode,
    details,
    // Backward-compatible alias for older UI handlers.
    error: message,
  };
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

export function paginate<T>(items: T[], limit?: number, offset?: number): PaginationResult<T> {
  const normalizedOffset = Math.max(0, Number(offset ?? 0));
  const fallbackLimit = items.length > 0 ? items.length : 1;
  const normalizedLimit = Math.max(1, Number(limit ?? fallbackLimit));
  const data = items.slice(normalizedOffset, normalizedOffset + normalizedLimit);
  return {
    data,
    pagination: {
      total: items.length,
      offset: normalizedOffset,
      limit: normalizedLimit,
      hasMore: normalizedOffset + normalizedLimit < items.length,
    },
  };
}
