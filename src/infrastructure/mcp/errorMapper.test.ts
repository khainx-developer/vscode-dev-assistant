import * as assert from 'assert';
import { McpErrorMapper } from './errorMapper';

suite('McpErrorMapper', () => {
  test('mapError_status401_authExpired', () => {
    const result = McpErrorMapper.mapError('atlassian', { status: 401, message: 'Unauthorized' });
    assert.deepStrictEqual(result, { serverId: 'atlassian', category: 'auth-expired', detail: 'Unauthorized' });
  });

  test('mapError_status429WithRetryAfter_rateLimitedWithResetAt', () => {
    const now = Date.now();
    const result = McpErrorMapper.mapError('github', { status: 429, message: 'Rate limited', retryAfter: 30 });

    assert.strictEqual(result.serverId, 'github');
    assert.strictEqual(result.category, 'rate-limited');
    assert.strictEqual(result.detail, 'Rate limited');
    assert.ok(result.resetAt);
    const resetAtMs = new Date(result.resetAt!).getTime();
    assert.ok(resetAtMs >= now + 29000 && resetAtMs <= now + 31000);
  });

  test('mapError_status429WithoutRetryAfter_rateLimitedNoResetAt', () => {
    const result = McpErrorMapper.mapError('github', { status: 429, message: 'Rate limited' });
    assert.deepStrictEqual(result, { serverId: 'github', category: 'rate-limited', detail: 'Rate limited' });
  });

  test('mapError_streamableHttpErrorCode429_rateLimited', () => {
    const result = McpErrorMapper.mapError('github', {
      code: 429,
      message: 'Streamable HTTP error: Error POSTing to endpoint: too many requests',
    }, 'https://api.githubcopilot.com/mcp/?token=do-not-display#fragment');
    assert.deepStrictEqual(result, {
      serverId: 'github',
      category: 'rate-limited',
      detail: 'Streamable HTTP error: Error POSTing to endpoint: too many requests (endpoint: https://api.githubcopilot.com/mcp/; HTTP status: 429)',
    });
  });

  test('mapError_unknownShape_includesEndpointAndUnavailableStatus', () => {
    const result = McpErrorMapper.mapError('atlassian', new Error('fetch failed'), 'https://mcp.atlassian.com/v2/mcp');
    assert.deepStrictEqual(result, {
      serverId: 'atlassian',
      category: 'network',
      detail: 'fetch failed (endpoint: https://mcp.atlassian.com/v2/mcp; HTTP status: unavailable)',
    });
  });

  test('mapError_status400_invalidEntry', () => {
    const result = McpErrorMapper.mapError('atlassian', { status: 400, message: 'Bad request' });
    assert.deepStrictEqual(result, { serverId: 'atlassian', category: 'invalid-entry', detail: 'Bad request' });
  });

  test('mapError_status404_invalidEntry', () => {
    const result = McpErrorMapper.mapError('atlassian', { status: 404, message: 'Not found' });
    assert.deepStrictEqual(result, { serverId: 'atlassian', category: 'invalid-entry', detail: 'Not found' });
  });

  test('mapError_status500_network', () => {
    const result = McpErrorMapper.mapError('github', { status: 500, message: 'Server error' });
    assert.deepStrictEqual(result, { serverId: 'github', category: 'network', detail: 'Server error' });
  });

  test('mapError_jsonRpcUnauthorizedCode_authExpired', () => {
    const result = McpErrorMapper.mapError('atlassian', { code: -32001, message: 'Token expired' });
    assert.deepStrictEqual(result, { serverId: 'atlassian', category: 'auth-expired', detail: 'Token expired' });
  });

  test('mapError_jsonRpcOtherCode_invalidEntry', () => {
    const result = McpErrorMapper.mapError('github', { code: -32602, message: 'Invalid params' });
    assert.deepStrictEqual(result, { serverId: 'github', category: 'invalid-entry', detail: 'Invalid params' });
  });

  test('mapError_unknownShape_network', () => {
    const result = McpErrorMapper.mapError('atlassian', new Error('boom'));
    assert.deepStrictEqual(result, { serverId: 'atlassian', category: 'network', detail: 'boom' });
  });

  test('mapError_alwaysSetsServerId', () => {
    const result = McpErrorMapper.mapError('github', 'not an object');
    assert.strictEqual(result.serverId, 'github');
  });
});
