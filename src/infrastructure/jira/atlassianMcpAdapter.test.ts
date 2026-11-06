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

function jiraComment(
  id: string,
  created: string,
  body: unknown = 'A comment',
  visibility?: { type: string; value: string },
): unknown {
  return {
    id,
    author: { displayName: 'Alice' },
    body,
    created,
    visibility,
  };
}

function commentPage(comments: unknown[], total = comments.length, isLast = true): unknown {
  return toolResult({ data: { comments, total, isLast } });
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
                fields: {
                  summary: 'First',
                  status: { name: 'To Do' },
                  assignee: { displayName: 'Alice' },
                  duedate: '2026-11-05',
                  updated: '2026-11-01T10:00:00Z',
                },
              },
              {
                key: 'ABC-2',
                fields: {
                  summary: 'Second',
                  status: { name: 'Done' },
                  assignee: { displayName: 'Bob' },
                  updated: '2026-11-02T10:00:00Z',
                },
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
        updatedAt: '2026-11-01T10:00:00Z',
        subtasks: [],
        url: 'https://example.atlassian.net/browse/ABC-1',
        prLink: { kind: 'not-available' },
      },
      {
        key: 'ABC-2',
        summary: 'Second',
        status: 'Done',
        assignee: 'Bob',
        dueDate: null,
        updatedAt: '2026-11-02T10:00:00Z',
        subtasks: [],
        url: 'https://example.atlassian.net/browse/ABC-2',
        prLink: { kind: 'not-available' },
      },
    ]);
  });

  test('fetchIssues_mapsSubtasks_toJiraSubtask', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve(
        toolResult({
          data: {
            issues: [{
              key: 'ABC-5',
              fields: {
                summary: 'Parent task',
                status: { name: 'In Progress' },
                assignee: null,
                updated: '2026-11-03T10:00:00Z',
                subtasks: [
                  { key: 'ABC-6', fields: { summary: 'Child one', status: { name: 'To Do' } } },
                  { key: 'ABC-7', fields: { summary: 'Child two', status: { name: 'Done' } } },
                ],
              },
            }],
          },
        }),
      ),
    );

    const result = await AtlassianMcpAdapter.fetchIssues(service, 'cloud-1', 'project = ABC', 'https://example.atlassian.net');

    assert.deepStrictEqual(result[0].subtasks, [
      { key: 'ABC-6', summary: 'Child one', status: 'To Do', url: 'https://example.atlassian.net/browse/ABC-6' },
      { key: 'ABC-7', summary: 'Child two', status: 'Done', url: 'https://example.atlassian.net/browse/ABC-7' },
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
                fields: {
                  summary: 'Unassigned',
                  status: { name: 'To Do' },
                  assignee: null,
                  updated: '2026-11-03T10:00:00Z',
                },
              },
            ],
          },
        }),
      ),
    );

    const result = await AtlassianMcpAdapter.fetchIssues(service, 'cloud-1', 'project = ABC', 'https://example.atlassian.net');

    assert.strictEqual(result[0].assignee, null);
  });

  test('fetchIssues_mapsUpdatedTimestamp', async () => {
    let request: { name: string; args: unknown } | undefined;
    const service = makeConnectionService((_serverId, name, args) => {
      request = { name, args };
      return Promise.resolve(
        toolResult({
          data: {
            issues: [{
              key: 'ABC-4',
              fields: {
                summary: 'Recently updated',
                status: { name: 'In Progress' },
                assignee: null,
                updated: '2026-11-03T12:30:00Z',
              },
            }],
          },
        }),
      );
    });

    const result = await AtlassianMcpAdapter.fetchIssues(service, 'cloud-1', 'project = ABC', 'https://example.atlassian.net');

    assert.deepStrictEqual(request, {
      name: 'searchJiraIssuesUsingJql',
      args: {
        cloudId: 'cloud-1',
        jql: 'project = ABC',
        maxResults: 50,
        fields: ['summary', 'status', 'assignee', 'duedate', 'updated', 'subtasks'],
      },
    });
    assert.strictEqual(result[0].updatedAt, '2026-11-03T12:30:00Z');
  });

  test('fetchIssueComments_callsNamedToolWithExactArguments', async () => {
    let call: { serverId: string; name: string; args: unknown } | undefined;
    const service = makeConnectionService((serverId, name, args) => {
      call = { serverId, name, args };
      return Promise.resolve(commentPage([], 0, true));
    });

    await AtlassianMcpAdapter.fetchIssueComments(
      service,
      'cloud-1',
      'ABC-5',
      'https://example.atlassian.net',
      1,
    );

    assert.deepStrictEqual(call, {
      serverId: 'atlassian',
      name: 'listJiraIssueComments',
      args: {
        cloudId: 'cloud-1',
        issueIdOrKey: 'ABC-5',
        startAt: 0,
        maxResults: 100,
        orderBy: '-created',
      },
    });
  });

  test('fetchIssueComments_coalescesIdenticalInFlightRequests', async () => {
    let calls = 0;
    let resolveCall: ((value: unknown) => void) | undefined;
    const service = makeConnectionService(() => {
      calls++;
      return new Promise((resolve) => { resolveCall = resolve; });
    });

    const first = AtlassianMcpAdapter.fetchIssueComments(service, 'cloud-1', 'ABC-6', 'https://example.atlassian.net', 1);
    const second = AtlassianMcpAdapter.fetchIssueComments(service, 'cloud-1', 'ABC-6', 'https://example.atlassian.net', 1);

    assert.strictEqual(calls, 1);
    resolveCall?.(commentPage([], 0, true));
    await Promise.all([first, second]);
  });

  test('fetchIssueComments_limitsConcurrentAtlassianRequests', async () => {
    let calls = 0;
    let active = 0;
    let maximumActive = 0;
    const pending: Array<(value: unknown) => void> = [];
    let resolveThirdStarted: (() => void) | undefined;
    const thirdStarted = new Promise<void>((resolve) => { resolveThirdStarted = resolve; });
    const service = makeConnectionService(() => {
      calls++;
      active++;
      maximumActive = Math.max(maximumActive, active);
      if (calls === 3) resolveThirdStarted?.();
      return new Promise((resolve) => {
        pending.push((value) => {
          active--;
          resolve(value);
        });
      });
    });

    const requests = ['ABC-7', 'ABC-8', 'ABC-9'].map((issueKey) =>
      AtlassianMcpAdapter.fetchIssueComments(service, 'cloud-1', issueKey, 'https://example.atlassian.net', undefined));

    assert.strictEqual(calls, 2);
    pending.shift()?.(commentPage([], 0, true));
    await thirdStarted;
    assert.strictEqual(calls, 3);
    assert.strictEqual(maximumActive, 2);

    pending.splice(0).forEach((resolve) => resolve(commentPage([], 0, true)));
    await Promise.all(requests);
  });

  test('fetchIssueComments_mapsCommentFieldsAndVisibility', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve(
        commentPage([
          jiraComment('comment-1', '2026-11-03T10:00:00Z', 'Status updated', {
            type: 'group',
            value: 'developers',
          }),
        ]),
      ),
    );

    const result = await AtlassianMcpAdapter.fetchIssueComments(
      service,
      'cloud-1',
      'ABC-5',
      'https://example.atlassian.net',
      1,
    );

    assert.deepStrictEqual(result, [{
      id: 'comment-1',
      author: 'Alice',
      body: 'Status updated',
      createdAt: '2026-11-03T10:00:00Z',
      visibility: { type: 'group', value: 'developers' },
      url: 'https://example.atlassian.net/browse/ABC-5',
    }]);
  });

  test('fetchIssueComments_flattensADFParagraphs', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve(
        commentPage([
          jiraComment('comment-1', '2026-11-03T10:00:00Z', {
            type: 'doc',
            version: 1,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
            ],
          }),
        ]),
      ),
    );

    const result = await AtlassianMcpAdapter.fetchIssueComments(
      service,
      'cloud-1',
      'ABC-5',
      'https://example.atlassian.net',
      1,
    );

    assert.strictEqual(result[0].body, 'First paragraph\nSecond paragraph');
  });

  test('fetchIssueComments_pagesUntilMarkerBoundary', async () => {
    const calls: unknown[] = [];
    const pages = [
      commentPage([
        jiraComment('new-1', '2026-11-03T10:00:00Z'),
        jiraComment('new-2', '2026-11-02T10:00:00Z'),
      ], 3, false),
      commentPage([jiraComment('old-1', '2026-10-31T10:00:00Z')], 3, true),
    ];
    const service = makeConnectionService((_serverId, _name, args) => {
      calls.push(args);
      return Promise.resolve(pages[calls.length - 1]);
    });

    const result = await AtlassianMcpAdapter.fetchIssueComments(
      service,
      'cloud-1',
      'ABC-5',
      'https://example.atlassian.net',
      Date.parse('2026-11-01T00:00:00Z'),
    );

    assert.deepStrictEqual(calls.map((args) => (args as { startAt: number }).startAt), [0, 2]);
    assert.deepStrictEqual(result.map((comment) => comment.id), ['new-1', 'new-2', 'old-1']);
  });

  test('fetchIssueComments_firstFetchUsesOnlyBaselinePage', async () => {
    let calls = 0;
    const service = makeConnectionService(() => {
      calls += 1;
      return Promise.resolve(commentPage([jiraComment('baseline', '2026-11-03T10:00:00Z')], 200, false));
    });

    const result = await AtlassianMcpAdapter.fetchIssueComments(
      service,
      'cloud-1',
      'ABC-5',
      'https://example.atlassian.net',
      undefined,
    );

    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(result.map((comment) => comment.id), ['baseline']);
  });

  test('fetchIssueComments_stopsAtIsLast', async () => {
    let calls = 0;
    const service = makeConnectionService(() => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? commentPage([jiraComment('first', '2026-11-03T10:00:00Z')], 2, false)
          : commentPage([jiraComment('second', '2026-11-02T10:00:00Z')], 2, true),
      );
    });

    const result = await AtlassianMcpAdapter.fetchIssueComments(
      service,
      'cloud-1',
      'ABC-5',
      'https://example.atlassian.net',
      Date.parse('2026-10-01T00:00:00Z'),
    );

    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(result.map((comment) => comment.id), ['first', 'second']);
  });

  test('fetchIssueComments_malformedEnvelopeRejects', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve(toolResult({ data: { comments: [], total: '0', isLast: true } })),
    );

    await assert.rejects(
      AtlassianMcpAdapter.fetchIssueComments(
        service,
        'cloud-1',
        'ABC-5',
        'https://example.atlassian.net',
        1,
      ),
      /malformed page metadata/,
    );
  });

  test('fetchIssueComments_toolErrorRejects', async () => {
    const service = makeConnectionService(() =>
      Promise.resolve({ isError: true, content: [{ type: 'text', text: 'unsupported tool' }] }),
    );

    await assert.rejects(
      AtlassianMcpAdapter.fetchIssueComments(
        service,
        'cloud-1',
        'ABC-5',
        'https://example.atlassian.net',
        1,
      ),
      /error result/,
    );
  });

  test('fetchIssueComments_emptyLastPageReturnsEmpty', async () => {
    const service = makeConnectionService(() => Promise.resolve(commentPage([], 0, true)));

    const result = await AtlassianMcpAdapter.fetchIssueComments(
      service,
      'cloud-1',
      'ABC-5',
      'https://example.atlassian.net',
      1,
    );

    assert.deepStrictEqual(result, []);
  });
});
