import type { McpServerId, McpToolError, McpToolErrorCategory } from '../../shared/mcpTypes';

const KNOWN_CATEGORIES: McpToolErrorCategory[] = ['auth-expired', 'rate-limited', 'invalid-entry', 'network'];

function formatDetail(detail: string, endpoint?: string, httpStatus?: number): string {
  if (!endpoint) {
    return detail;
  }

  let safeEndpoint = 'unavailable';
  try {
    const parsedEndpoint = new URL(endpoint);
    safeEndpoint = `${parsedEndpoint.origin}${parsedEndpoint.pathname}`;
  } catch {
    // Keep malformed endpoint config from obscuring the original transport error.
  }
  return `${detail} (endpoint: ${safeEndpoint}; HTTP status: ${httpStatus ?? 'unavailable'})`;
}

export const McpErrorMapper = {
  mapError(serverId: McpServerId, error: unknown, endpoint?: string): McpToolError {
    const err = error as {
      status?: number;
      message?: string;
      code?: number;
      retryAfter?: number;
      resetAt?: string;
      category?: string;
      detail?: string;
    };

    const httpStatus = typeof err?.status === 'number'
      ? err.status
      : typeof err?.code === 'number' && err.code >= 400 && err.code <= 599
        ? err.code
        : undefined;

    // Already-classified upstream (e.g. LoopbackRedirectServer's {category, detail}, or an
    // McpToolError being re-mapped) — pass it through instead of re-deriving from status/code,
    // which this shape has neither of and would otherwise fall through to a generic message.
    if (typeof err?.category === 'string' && KNOWN_CATEGORIES.includes(err.category as McpToolErrorCategory) && err.detail) {
      return {
        serverId,
        category: err.category as McpToolErrorCategory,
        detail: formatDetail(err.detail, endpoint, httpStatus),
        resetAt: err.resetAt,
      };
    }

    if (httpStatus !== undefined) {
      const message = err.message || 'Unknown error';
      if (httpStatus === 401) {
        return { serverId, category: 'auth-expired', detail: formatDetail(message, endpoint, httpStatus) };
      }
      if (httpStatus === 429) {
        const resetAt = err.resetAt ?? (
          err.retryAfter !== undefined
            ? new Date(Date.now() + err.retryAfter * 1000).toISOString()
            : undefined
        );
        return resetAt
          ? { serverId, category: 'rate-limited', detail: formatDetail(message, endpoint, httpStatus), resetAt }
          : { serverId, category: 'rate-limited', detail: formatDetail(message, endpoint, httpStatus) };
      }
      if (httpStatus === 400 || httpStatus === 404) {
        return { serverId, category: 'invalid-entry', detail: formatDetail(message, endpoint, httpStatus) };
      }
      return { serverId, category: 'network', detail: formatDetail(message, endpoint, httpStatus) };
    }

    if (typeof err?.code === 'number' && typeof err.message === 'string') {
      const isUnauthorized = err.code === -32001 || /unauthoriz|unauthenticat/i.test(err.message);
      return {
        serverId,
        category: isUnauthorized ? 'auth-expired' : 'invalid-entry',
        detail: formatDetail(err.message, endpoint),
      };
    }

    return {
      serverId,
      category: 'network',
      detail: formatDetail((error as Error)?.message || 'Unknown MCP error', endpoint),
    };
  },
};
