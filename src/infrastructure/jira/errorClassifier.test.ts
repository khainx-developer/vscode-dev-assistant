import * as assert from 'assert';
import { JiraErrorClassifier } from './errorClassifier';
import type { McpToolError } from '../../shared/mcpTypes';

suite('JiraErrorClassifier', () => {
  test('classify_authExpired_mapsThrough', () => {
    const error: McpToolError = { serverId: 'atlassian', category: 'auth-expired', detail: 'Unauthorized' };
    assert.deepStrictEqual(JiraErrorClassifier.classify(error), {
      category: 'auth-expired',
      detail: 'Unauthorized',
      resetAt: undefined,
    });
  });

  test('classify_rateLimitedWithResetAt_mapsThrough', () => {
    const error: McpToolError = {
      serverId: 'atlassian',
      category: 'rate-limited',
      detail: 'Too many requests',
      resetAt: '2026-01-01T00:00:00.000Z',
    };
    assert.deepStrictEqual(JiraErrorClassifier.classify(error), {
      category: 'rate-limited',
      detail: 'Too many requests',
      resetAt: '2026-01-01T00:00:00.000Z',
    });
  });

  test('classify_rateLimitedWithoutResetAt_mapsThrough', () => {
    const error: McpToolError = { serverId: 'atlassian', category: 'rate-limited', detail: 'Too many requests' };
    assert.deepStrictEqual(JiraErrorClassifier.classify(error), {
      category: 'rate-limited',
      detail: 'Too many requests',
      resetAt: undefined,
    });
  });

  test('classify_invalidEntry_mapsThrough', () => {
    const error: McpToolError = { serverId: 'atlassian', category: 'invalid-entry', detail: 'Bad JQL' };
    assert.deepStrictEqual(JiraErrorClassifier.classify(error), {
      category: 'invalid-entry',
      detail: 'Bad JQL',
      resetAt: undefined,
    });
  });

  test('classify_network_mapsThrough', () => {
    const error: McpToolError = { serverId: 'atlassian', category: 'network', detail: 'Connection reset' };
    assert.deepStrictEqual(JiraErrorClassifier.classify(error), {
      category: 'network',
      detail: 'Connection reset',
      resetAt: undefined,
    });
  });

  test('classify_unclassifiedError_fallsBackToNetworkWithMessage_insteadOfUndefinedDetail', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'map')");
    assert.deepStrictEqual(JiraErrorClassifier.classify(error as unknown as McpToolError), {
      category: 'network',
      detail: "Cannot read properties of undefined (reading 'map')",
      resetAt: undefined,
    });
  });

  test('classify_unclassifiedErrorWithoutMessage_fallsBackToUnknownError', () => {
    const error = {};
    assert.deepStrictEqual(JiraErrorClassifier.classify(error as unknown as McpToolError), {
      category: 'network',
      detail: 'Unknown error',
      resetAt: undefined,
    });
  });
});
