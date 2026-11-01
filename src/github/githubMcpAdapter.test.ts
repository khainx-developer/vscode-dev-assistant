import * as assert from 'assert';
import { GithubMcpAdapter } from './githubMcpAdapter';
import type { McpConnectionService } from '../mcp/connectionService';
import type { GitHubSession } from './types';

const SESSION: GitHubSession = { username: 'me', accessToken: 'session-token' };
const REPO = { owner: 'acme', repo: 'widgets' };

// The real MCP SDK's callTool resolves a CallToolResult (`{ content: [{ type, text }] }`), where
// `text` is a JSON-encoded string of the tool's actual payload — never the already-parsed value.
function toolResult(payload: unknown): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function makeConnectionService(opts: {
  connect?: (serverId: string, callOpts?: unknown) => Promise<void>;
  callTool: (serverId: string, name: string, args: unknown) => Promise<unknown>;
}): { service: McpConnectionService; connectCalls: Array<{ serverId: string; opts?: unknown }> } {
  const connectCalls: Array<{ serverId: string; opts?: unknown }> = [];
  const service = {
    connect: async (serverId: string, callOpts?: unknown) => {
      connectCalls.push({ serverId, opts: callOpts });
      if (opts.connect) {
        await opts.connect(serverId, callOpts);
      }
    },
    callTool: opts.callTool,
  } as unknown as McpConnectionService;
  return { service, connectCalls };
}

suite('GithubMcpAdapter', () => {
  test('fetchOpenPullRequests_sessionBearerPath_succeedsWithoutCallingConnect', async () => {
    let connectCount = 0;
    const { service } = makeConnectionService({
      connect: async () => {
        connectCount++;
      },
      callTool: async (_serverId, name) => {
        if (name === 'list_pull_requests') {
          return toolResult([]);
        }
        return toolResult([]);
      },
    });

    await GithubMcpAdapter.fetchOpenPullRequests(service, REPO, SESSION);

    assert.strictEqual(connectCount, 1);
  });

  test('fetchOpenPullRequests_authExpired_triggersExactlyOneConnectAndRetry', async () => {
    let callToolCount = 0;
    const connectCalls: unknown[] = [];
    const service = {
      connect: async (_serverId: string, opts?: unknown) => {
        connectCalls.push(opts);
      },
      callTool: async (_serverId: string, name: string) => {
        callToolCount++;
        if (callToolCount === 1) {
          throw { serverId: 'github', category: 'auth-expired', detail: 'expired' };
        }
        if (name === 'list_pull_requests') {
          return toolResult([]);
        }
        return toolResult([]);
      },
    } as unknown as McpConnectionService;

    await GithubMcpAdapter.fetchOpenPullRequests(service, REPO, SESSION);

    assert.strictEqual(connectCalls.length, 2);
    assert.deepStrictEqual(connectCalls[0], { extraHeaders: { Authorization: 'Bearer session-token' } });
    assert.deepStrictEqual(connectCalls[1], undefined);
  });

  test('fetchOpenPullRequests_mapsMultiplePrs_filtersDrafts_attachesLabelColors', async () => {
    const { service } = makeConnectionService({
      callTool: async (_serverId, name, args) => {
        const typedArgs = args as Record<string, unknown>;
        if (name === 'list_pull_requests') {
          return toolResult([
            {
              number: 1,
              title: 'Add feature',
              html_url: 'https://github.com/acme/widgets/pull/1',
              user: { login: 'alice' },
              state: 'open',
              draft: false,
              merged_at: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-02T00:00:00Z',
              labels: [{ name: 'bug' }],
              requested_reviewers: [{ login: 'bob' }],
            },
            {
              number: 2,
              title: 'Draft PR',
              html_url: 'https://github.com/acme/widgets/pull/2',
              user: { login: 'carol' },
              state: 'open',
              draft: true,
              merged_at: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
              labels: [],
              requested_reviewers: [],
            },
          ]);
        }
        if (name === 'pull_request_read') {
          if (typedArgs.method === 'get') {
            return toolResult({ mergeable: true });
          }
          if (typedArgs.method === 'get_reviews') {
            return toolResult([{ user: { login: 'dave' }, state: 'APPROVED', submitted_at: '2026-01-02T01:00:00Z' }]);
          }
          if (typedArgs.method === 'get_comments') {
            return toolResult([{ id: 10, user: { login: 'erin' }, body: 'Looks good to me', created_at: '2026-01-02T02:00:00Z', html_url: 'https://github.com/acme/widgets/pull/1#issuecomment-10' }]);
          }
          if (typedArgs.method === 'get_check_runs') {
            // Real shape is `{total_count, check_runs: [...]}`, not a bare array.
            return toolResult({ total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] });
          }
        }
        if (name === 'get_label') {
          return toolResult({ color: 'ff0000' });
        }
        throw new Error(`unexpected tool call: ${name}`);
      },
    });

    const result = await GithubMcpAdapter.fetchOpenPullRequests(service, REPO, SESSION);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].number, 1);
    assert.strictEqual(result[0].mergeable, 'MERGEABLE');
    assert.deepStrictEqual(result[0].labels, [{ name: 'bug', color: 'ff0000' }]);
    assert.strictEqual(result[0].checkStatus, 'SUCCESS');
    assert.deepStrictEqual(result[0].reviews, [{ author: 'dave', state: 'APPROVED', submittedAt: '2026-01-02T01:00:00Z' }]);
    assert.strictEqual(result[0].comments[0].author, 'erin');
    assert.deepStrictEqual(result[0].requestedReviewers, ['bob']);
  });

  test('validateRepo_found_returnsTrue', async () => {
    const { service } = makeConnectionService({ callTool: async () => toolResult([]) });
    assert.strictEqual(await GithubMcpAdapter.validateRepo(service, REPO, SESSION), true);
  });

  test('validateRepo_notFound_returnsFalse', async () => {
    const { service } = makeConnectionService({
      callTool: async () => {
        throw { serverId: 'github', category: 'invalid-entry', detail: 'Not found' };
      },
    });
    assert.strictEqual(await GithubMcpAdapter.validateRepo(service, REPO, SESSION), false);
  });

  test('validateAuthor_found_returnsTrue', async () => {
    const { service } = makeConnectionService({
      callTool: async () => toolResult({ items: [{ login: 'octocat' }] }),
    });
    assert.strictEqual(await GithubMcpAdapter.validateAuthor(service, { username: 'octocat' }, SESSION), true);
  });

  test('validateAuthor_notFound_returnsFalse', async () => {
    const { service } = makeConnectionService({
      callTool: async () => toolResult({ items: [] }),
    });
    assert.strictEqual(await GithubMcpAdapter.validateAuthor(service, { username: 'ghost' }, SESSION), false);
  });

  test('fetchOpenPullRequests_checkRunsWrappedInObject_doesNotThrow_derivesStatus', async () => {
    const { service } = makeConnectionService({
      callTool: async (_serverId, name, args) => {
        const typedArgs = args as Record<string, unknown>;
        if (name === 'list_pull_requests') {
          return toolResult([
            {
              number: 7,
              title: 'Has failing checks',
              html_url: 'https://github.com/acme/widgets/pull/7',
              user: { login: 'alice' },
              state: 'open',
              draft: false,
              merged_at: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-02T00:00:00Z',
            },
          ]);
        }
        if (name === 'pull_request_read') {
          if (typedArgs.method === 'get') return toolResult({ mergeable: true });
          if (typedArgs.method === 'get_check_runs') {
            return toolResult({ total_count: 1, check_runs: [{ status: 'completed', conclusion: 'failure' }] });
          }
          return toolResult([]);
        }
        throw new Error(`unexpected tool call: ${name}`);
      },
    });

    const result = await GithubMcpAdapter.fetchOpenPullRequests(service, REPO, SESSION);

    assert.strictEqual(result[0].checkStatus, 'FAILURE');
  });

  test('fetchOpenPullRequests_entryMissingLabelsAndReviewers_doesNotThrow_mapsToEmptyArrays', async () => {
    // The real GitHub MCP server appears to omit `labels`/`requested_reviewers` entirely for a PR
    // that has neither, rather than sending `[]` — caused a live "Cannot read properties of
    // undefined (reading 'map')" crash (see DecisionLog.md).
    const { service } = makeConnectionService({
      callTool: async (_serverId, name, args) => {
        const typedArgs = args as Record<string, unknown>;
        if (name === 'list_pull_requests') {
          return toolResult([
            {
              number: 5,
              title: 'No labels or reviewers',
              html_url: 'https://github.com/acme/widgets/pull/5',
              user: { login: 'alice' },
              state: 'open',
              draft: false,
              merged_at: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-02T00:00:00Z',
            },
          ]);
        }
        if (name === 'pull_request_read') {
          if (typedArgs.method === 'get') return toolResult({ mergeable: null });
          return toolResult([]);
        }
        throw new Error(`unexpected tool call: ${name}`);
      },
    });

    const result = await GithubMcpAdapter.fetchOpenPullRequests(service, REPO, SESSION);

    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].labels, []);
    assert.deepStrictEqual(result[0].requestedReviewers, []);
  });

  test('fetchOpenPullRequests_unparsableToolResult_throwsRealMessageNotUnknownError', async () => {
    const { service } = makeConnectionService({
      callTool: async () => ({ unexpected: 'shape, no content array' }),
    });

    await assert.rejects(
      GithubMcpAdapter.fetchOpenPullRequests(service, REPO, SESSION),
      (error: { message?: string }) => {
        assert.strictEqual(error.message, 'Unexpected GitHub MCP tool result: no text content.');
        return true;
      },
    );
  });

  test('getRateLimitStatus_noToolAvailable_returnsPlaceholderAndLogs', async () => {
    const { service } = makeConnectionService({ callTool: async () => toolResult({}) });
    const result = await GithubMcpAdapter.getRateLimitStatus(service, SESSION);
    assert.strictEqual(result.remaining, Infinity);
    assert.strictEqual(result.resetAt, new Date(0).toISOString());
  });
});
