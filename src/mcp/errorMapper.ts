import type { McpServerId, McpToolError, McpToolErrorCategory } from './types';

const KNOWN_CATEGORIES: McpToolErrorCategory[] = ['auth-expired', 'rate-limited', 'invalid-entry', 'network'];

export const McpErrorMapper = {
  mapError(serverId: McpServerId, error: unknown): McpToolError {
    const err = error as {
      status?: number;
      message?: string;
      code?: number;
      retryAfter?: number;
      resetAt?: string;
      category?: string;
      detail?: string;
    };

    // Already-classified upstream (e.g. LoopbackRedirectServer's {category, detail}, or an
    // McpToolError being re-mapped) — pass it through instead of re-deriving from status/code,
    // which this shape has neither of and would otherwise fall through to a generic message.
    if (typeof err?.category === 'string' && KNOWN_CATEGORIES.includes(err.category as McpToolErrorCategory) && err.detail) {
      return { serverId, category: err.category as McpToolErrorCategory, detail: err.detail, resetAt: err.resetAt };
    }

    if (typeof err?.status === 'number') {
      const message = err.message || 'Unknown error';
      if (err.status === 401) {
        return { serverId, category: 'auth-expired', detail: message };
      }
      if (err.status === 429) {
        const resetAt = err.resetAt ?? (
          err.retryAfter !== undefined
            ? new Date(Date.now() + err.retryAfter * 1000).toISOString()
            : undefined
        );
        return resetAt
          ? { serverId, category: 'rate-limited', detail: message, resetAt }
          : { serverId, category: 'rate-limited', detail: message };
      }
      if (err.status === 400 || err.status === 404) {
        return { serverId, category: 'invalid-entry', detail: message };
      }
      return { serverId, category: 'network', detail: message };
    }

    if (typeof err?.code === 'number' && typeof err.message === 'string') {
      const isUnauthorized = err.code === -32001 || /unauthoriz|unauthenticat/i.test(err.message);
      return {
        serverId,
        category: isUnauthorized ? 'auth-expired' : 'invalid-entry',
        detail: err.message,
      };
    }

    return { serverId, category: 'network', detail: (error as Error)?.message || 'Unknown MCP error' };
  },
};
