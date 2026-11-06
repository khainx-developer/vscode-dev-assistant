import type { McpToolError } from '../../shared/mcpTypes';
import type { JiraFailure } from '../../shared/jiraTypes';

const KNOWN_CATEGORIES: JiraFailure['category'][] = ['auth-expired', 'rate-limited', 'invalid-entry', 'network'];

export const JiraErrorClassifier = {
  classify(error: McpToolError): Omit<JiraFailure, 'queryLabel'> {
    // `error` is usually an already-classified McpToolError, but a bug in our own adapter code
    // (e.g. parsing an unexpected MCP response shape) throws a plain Error/TypeError instead —
    // which has no `.category`, and used to silently become `detail: undefined` in the UI
    // ("My tasks: undefined"), the same class of blank-reason bug already fixed for the connect
    // flow (see DecisionLog.md). Fall back to the error's own message rather than swallowing it.
    if (typeof error?.category === 'string' && KNOWN_CATEGORIES.includes(error.category)) {
      return { category: error.category, detail: error.detail, resetAt: error.resetAt };
    }
    return { category: 'network', detail: (error as unknown as Error)?.message || 'Unknown error', resetAt: undefined };
  },
};
