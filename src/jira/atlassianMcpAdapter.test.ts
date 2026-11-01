import * as assert from 'assert';
import { AtlassianMcpAdapter } from './atlassianMcpAdapter';
import type { McpConnectionService } from '../mcp/connectionService';

function makeConnectionService(callTool: (serverId: string, name: string, args: unknown) => Promise<unknown>): McpConnectionService {
  return { callTool } as unknown as McpConnectionService;
}

// The real MCP SDK's callTool resolves a CallToolResult (`{ content: [{ type, text }] }`), where
// `text` is a JSON-encoded string of the tool's actual payload — never the already-parsed value.
function toolResult(payload: unknown): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

suite('AtlassianMcpAdapter', () => {
  test('validateConnection_matchingSite_returnsOkWithSiteId', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve(
        toolResult({ data: { resources: [{ cloudId: 'cloud-1', url: 'https://example.atlassian.net' }] } }),
      ),
    );

    const result = await AtlassianMcpAdapter.validateConnection(service, 'https://example.atlassian.net');

    assert.deepStrictEqual(result, { ok: true, siteId: 'cloud-1' });
  });

  test('validateConnection_noMatchingSite_returnsFailureReason', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve(
        toolResult({ data: { resources: [{ cloudId: 'cloud-1', url: 'https://other.atlassian.net' }] } }),
      ),
    );

    const result = await AtlassianMcpAdapter.validateConnection(service, 'https://example.atlassian.net');

    assert.deepStrictEqual(result, { ok: false, reason: 'Could not find an accessible Jira site at that URL.' });
  });

  test('validateConnection_urlNormalization_ignoresTrailingSlashAndCase', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve(
        toolResult({ data: { resources: [{ cloudId: 'cloud-1', url: 'HTTPS://Example.atlassian.net/' }] } }),
      ),
    );

    const result = await AtlassianMcpAdapter.validateConnection(service, 'https://example.atlassian.net');

    assert.deepStrictEqual(result, { ok: true, siteId: 'cloud-1' });
  });

  test('validateQuery_validJql_returnsOk', async () => {
    const service = makeConnectionService(() => Promise.resolve(toolResult({ issues: [] })));

    const result = await AtlassianMcpAdapter.validateQuery(service, 'cloud-1', 'project = ABC');

    assert.deepStrictEqual(result, { ok: true });
  });

  test('validateQuery_invalidJql_returnsFailureReason', async () => {
    const service = makeConnectionService(() =>
      Promise.reject({ serverId: 'atlassian', category: 'invalid-entry', detail: 'Bad JQL syntax' }),
    );

    const result = await AtlassianMcpAdapter.validateQuery(service, 'cloud-1', 'not valid jql');

    assert.deepStrictEqual(result, { ok: false, reason: 'Bad JQL syntax' });
  });

  test('fetchIssues_mapsMultipleIssues_toJiraTask', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve(
        toolResult({
          data: {
            issues: [
              {
                key: 'ABC-1',
                fields: { summary: 'First', status: { name: 'To Do' }, assignee: { displayName: 'Alice' }, duedate: '2026-11-05' },
              },
              {
                key: 'ABC-2',
                fields: { summary: 'Second', status: { name: 'Done' }, assignee: { displayName: 'Bob' } },
              },
            ],
          },
        }),
      ),
    );

    const result = await AtlassianMcpAdapter.fetchIssues(service, 'cloud-1', 'project = ABC', 'https://example.atlassian.net');

    assert.deepStrictEqual(result, [
      {
        key: 'ABC-1',
        summary: 'First',
        status: 'To Do',
        assignee: 'Alice',
        dueDate: '2026-11-05',
        url: 'https://example.atlassian.net/browse/ABC-1',
        prLink: { kind: 'not-available' },
      },
      {
        key: 'ABC-2',
        summary: 'Second',
        status: 'Done',
        assignee: 'Bob',
        dueDate: null,
        url: 'https://example.atlassian.net/browse/ABC-2',
        prLink: { kind: 'not-available' },
      },
    ]);
  });

  test('fetchIssues_assigneeNull_mapsToNullNotThrow', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve(
        toolResult({
          data: {
            issues: [
              {
                key: 'ABC-3',
                fields: { summary: 'Unassigned', status: { name: 'To Do' }, assignee: null },
              },
            ],
          },
        }),
      ),
    );

    const result = await AtlassianMcpAdapter.fetchIssues(service, 'cloud-1', 'project = ABC', 'https://example.atlassian.net');

    assert.strictEqual(result[0].assignee, null);
  });
});
