import { GitHubFailure } from './types';

export const ErrorClassifier = {
  classify(error: unknown): GitHubFailure {
    const err = error as {
      status?: number;
      message?: string;
      response?: { headers?: Record<string, string> };
    };
    const message = err?.message ?? 'Unknown error';

    if (err?.status === 401) {
      return { category: 'auth-expired', detail: message };
    }
    const remaining = err?.response?.headers?.['x-ratelimit-remaining'];
    if (err?.status === 403 && remaining === '0') {
      const resetHeader = err.response?.headers?.['x-ratelimit-reset'];
      const resetAt = resetHeader ? new Date(Number(resetHeader) * 1000).toISOString() : undefined;
      return { category: 'rate-limited', detail: message, resetAt };
    }
    if (err?.status === 404) {
      return { category: 'invalid-entry', detail: message };
    }
    return { category: 'network', detail: message };
  },
};
