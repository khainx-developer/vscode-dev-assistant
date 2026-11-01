import * as assert from 'assert';
import * as vscode from 'vscode';
import { AtlassianMcpAdapter } from './atlassianMcpAdapter';
import { JiraConfigStore } from './configStore';
import { JiraConnectionStore } from './connectionStore';
import { JiraViewController } from './viewController';
import { PullRequestCache } from '../github/pullRequestCache';
import type { McpConnectionService } from '../mcp/connectionService';
import type { JiraConnection, JiraSavedQuery, JiraTask, JiraOutgoingMessage } from './types';
import type { PullRequestSummary } from '../github/types';

const CONNECTION: JiraConnection = {
  siteUrl: 'https://example.atlassian.net',
  siteId: 'cloud-1',
};

function makeTask(key: string): JiraTask {
  return {
    key,
    summary: `Task ${key}`,
    status: 'Open',
    assignee: null,
    dueDate: null,
    url: `https://example.atlassian.net/browse/${key}`,
    prLink: { kind: 'not-available' },
  };
}

function makePr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    repoKey: 'owner/repo',
    number: 1,
    title: 'PR',
    url: 'https://example.com/pull/1',
    author: 'author',
    state: 'OPEN',
    mergedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    labels: [],
    checkStatus: null,
    mergeable: 'UNKNOWN',
    reviews: [],
    comments: [],
    requestedReviewers: [],
    ...overrides,
  };
}

function createController(options: {
  connection?: JiraConnection;
  queries?: JiraSavedQuery[];
  fetchIssues?: (
    connectionService: McpConnectionService,
    siteId: string,
    jql: string,
    siteUrl: string,
  ) => Promise<JiraTask[]>;
  pullRequestCache?: PullRequestCache;
  connectionStoreOverrides?: Partial<
    Pick<JiraConnectionStore, 'getConnection' | 'saveConnection' | 'clearConnection'>
  >;
  configStoreOverrides?: Partial<
    Pick<JiraConfigStore, 'getSavedQueries' | 'addQuery' | 'removeQuery' | 'getCurrentUser' | 'setCurrentUser'>
  >;
  currentUser?: string | null;
  outputLines?: string[];
} = {}): {
  controller: JiraViewController;
  posted: JiraOutgoingMessage[];
  outputLines: string[];
} {
  const connection = Object.prototype.hasOwnProperty.call(options, 'connection')
    ? options.connection
    : CONNECTION;
  const connectionStore = {
    getConnection: async () => connection,
    saveConnection: async () => ({ ok: true }),
    clearConnection: async () => {},
    ...options.connectionStoreOverrides,
  } as unknown as JiraConnectionStore;
  const configStore = {
    getSavedQueries: () => options.queries ?? [],
    addQuery: async () => ({ ok: true }),
    removeQuery: async () => {},
    getCurrentUser: () => options.currentUser ?? null,
    setCurrentUser: async () => {},
    ...options.configStoreOverrides,
  } as unknown as JiraConfigStore;
  AtlassianMcpAdapter.fetchIssues = options.fetchIssues ?? (async () => []);
  const connectionService = {} as unknown as McpConnectionService;
  const posted: JiraOutgoingMessage[] = [];
  const view = {
    webview: {
      postMessage: (message: JiraOutgoingMessage) => {
        posted.push(message);
        return Promise.resolve(true);
      },
    },
  } as unknown as { webview: vscode.Webview };
  const outputLines = options.outputLines ?? [];
  const outputChannel = {
    appendLine: (line: string) => outputLines.push(line),
  } as unknown as vscode.OutputChannel;

  return {
    controller: new JiraViewController(
      view,
      connectionStore,
      configStore,
      connectionService,
      options.pullRequestCache ?? new PullRequestCache(),
      outputChannel,
    ),
    posted,
    outputLines,
  };
}

suite('JiraViewController', () => {
  let originalFetchIssues: typeof AtlassianMcpAdapter.fetchIssues;

  setup(() => {
    originalFetchIssues = AtlassianMcpAdapter.fetchIssues;
  });

  teardown(() => {
    AtlassianMcpAdapter.fetchIssues = originalFetchIssues;
  });

  test('JiraViewController_refresh_setsAuthExpiredFailure_whenNoConnection', async () => {
    const { controller, posted } = createController({ connection: undefined });

    await controller.refresh();

    const state = controller.getState();
    assert.strictEqual(state.connected, false);
    assert.deepStrictEqual(state.failures, [
      { category: 'auth-expired', detail: 'Not connected.', queryLabel: '' },
    ]);
    assert.deepStrictEqual(state.tasksByQuery, {});
    assert.strictEqual(posted.length, 1);
  });

  test('refresh_setsSiteUrl_whenConnected', async () => {
    const { controller } = createController();

    await controller.refresh();

    assert.strictEqual(controller.getState().siteUrl, CONNECTION.siteUrl);
  });

  test('getState_includesCurrentUser_fromConfigStore', async () => {
    const { controller } = createController({ currentUser: 'Alice Smith' });

    assert.strictEqual(controller.getState().currentUser, 'Alice Smith');
  });

  test('handleMessage_setCurrentUser_callsConfigStoreAndPostsState', async () => {
    let savedName: string | undefined;
    const { controller, posted } = createController({
      configStoreOverrides: {
        setCurrentUser: async (displayName: string) => {
          savedName = displayName;
        },
      },
    });

    await controller.handleMessage({ command: 'jira.setCurrentUser', displayName: 'Bob Jones' });

    assert.strictEqual(savedName, 'Bob Jones');
    assert.strictEqual(posted.some((m) => m.command === 'jira.state'), true);
  });

  test('handleMessage_disconnect_clearsConnectionAndSiteUrl', async () => {
    let cleared = false;
    const { controller } = createController({
      connectionStoreOverrides: {
        clearConnection: async () => {
          cleared = true;
        },
      },
    });
    await controller.refresh();
    assert.strictEqual(controller.getState().connected, true);

    await controller.handleMessage({ command: 'jira.disconnect' });

    assert.strictEqual(cleared, true);
  });

  test('refresh_buildsTasksByQuery_fromAdapter', async () => {
    const { controller } = createController({
      queries: [{ label: 'Tasks', jql: 'project = APP' }],
      fetchIssues: async (_connectionService, siteId, jql, siteUrl) => {
        assert.strictEqual(siteId, CONNECTION.siteId);
        assert.strictEqual(jql, 'project = APP');
        assert.strictEqual(siteUrl, CONNECTION.siteUrl);
        return [makeTask('APP-1')];
      },
    });

    await controller.refresh();

    assert.strictEqual(controller.getState().tasksByQuery.Tasks[0].key, 'APP-1');
  });

  test('JiraViewController_refresh_fetchesAllSavedQueriesInParallel', async () => {
    let active = 0;
    let maxConcurrent = 0;
    const { controller } = createController({
      queries: [
        { label: 'First', jql: 'project = FIRST' },
        { label: 'Second', jql: 'project = SECOND' },
      ],
      fetchIssues: async () => {
        active++;
        maxConcurrent = Math.max(maxConcurrent, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return [];
      },
    });

    await controller.refresh();

    assert.strictEqual(maxConcurrent, 2);
  });

  test('refresh_perQueryFailureIsolation_oneFailureDoesNotBlockOthers', async () => {
    const { controller } = createController({
      queries: [
        { label: 'Broken query', jql: 'invalid' },
        { label: 'Working query', jql: 'project = OK' },
      ],
      fetchIssues: async (_connectionService, _siteId, jql) => {
        if (jql === 'invalid') {
          throw { serverId: 'atlassian', category: 'invalid-entry', detail: 'Invalid JQL' };
        }
        return [makeTask('OK-1')];
      },
    });

    await controller.refresh();

    const state = controller.getState();
    assert.deepStrictEqual(state.failures, [
      { category: 'invalid-entry', detail: 'Invalid JQL', resetAt: undefined, queryLabel: 'Broken query' },
    ]);
    assert.strictEqual(state.tasksByQuery['Working query'][0].key, 'OK-1');
  });

  test('refresh_linkageComputedViaMatchPullRequestForIssue', async () => {
    const pullRequestCache = new PullRequestCache();
    const pr = makePr({ title: 'Fix APP-1 JIRA issue' });
    pullRequestCache.setForRepo('owner/repo', [pr]);
    const { controller } = createController({
      queries: [{ label: 'Tasks', jql: 'project = APP' }],
      fetchIssues: async () => [makeTask('APP-1')],
      pullRequestCache,
    });

    await controller.refresh();

    assert.deepStrictEqual(controller.getState().tasksByQuery.Tasks[0].prLink, {
      kind: 'linked',
      pr,
    });
  });

  test('JiraViewController_refresh_setsPrLinkKindNoMatch_whenCacheHasPrsButNoneMatch', async () => {
    const pullRequestCache = new PullRequestCache();
    pullRequestCache.setForRepo('owner/repo', [makePr({ title: 'Fix unrelated issue' })]);
    const { controller } = createController({
      queries: [{ label: 'Tasks', jql: 'project = APP' }],
      fetchIssues: async () => [makeTask('APP-1')],
      pullRequestCache,
    });

    await controller.refresh();

    assert.deepStrictEqual(controller.getState().tasksByQuery.Tasks[0].prLink, { kind: 'no-match' });
  });

  test('JiraViewController_refresh_setsPrLinkKindNotAvailable_whenCacheIsEmpty', async () => {
    const { controller } = createController({
      queries: [{ label: 'Tasks', jql: 'project = APP' }],
      fetchIssues: async () => [makeTask('APP-1')],
    });

    await controller.refresh();

    assert.deepStrictEqual(controller.getState().tasksByQuery.Tasks[0].prLink, {
      kind: 'not-available',
    });
  });

  test('handleMessage_dispatchesEachCommand', async () => {
    let saved = false;
    let added = false;
    let removed = false;
    const { controller, posted } = createController({
      connectionStoreOverrides: {
        saveConnection: async (siteUrl) => {
          saved = true;
          assert.strictEqual(siteUrl, CONNECTION.siteUrl);
          return { ok: true };
        },
      },
      configStoreOverrides: {
        addQuery: async () => {
          added = true;
          return { ok: true };
        },
        removeQuery: async () => {
          removed = true;
        },
      },
    });

    await controller.handleMessage({
      command: 'jira.saveConnection',
      siteUrl: CONNECTION.siteUrl,
    });
    await controller.handleMessage({ command: 'jira.addQuery', label: 'Tasks', jql: 'project = APP' });
    await controller.handleMessage({ command: 'jira.removeQuery', label: 'Tasks' });

    assert.strictEqual(saved, true);
    assert.strictEqual(added, true);
    assert.strictEqual(removed, true);
    const connectionResult = posted.find((message) => message.command === 'jira.connectionResult');
    const queryResult = posted.find((message) => message.command === 'jira.queryResult');
    assert.deepStrictEqual(connectionResult, { command: 'jira.connectionResult', ok: true });
    assert.deepStrictEqual(queryResult, { command: 'jira.queryResult', ok: true });
  });

  test('JiraViewController_handleMessage_openTask_opensExternalUrl', async () => {
    const { controller } = createController();
    const env = vscode.env as unknown as { openExternal: typeof vscode.env.openExternal };
    const originalOpenExternal = env.openExternal;
    let openedUrl: vscode.Uri | undefined;
    env.openExternal = async (uri: vscode.Uri) => {
      openedUrl = uri;
      return true;
    };

    try {
      await controller.handleMessage({
        command: 'jira.openTask',
        url: 'https://example.atlassian.net/browse/APP-1',
      });
    } finally {
      env.openExternal = originalOpenExternal;
    }

    assert.strictEqual(openedUrl?.toString(), 'https://example.atlassian.net/browse/APP-1');
  });

  test('refresh_failureDetail_neverContainsApiTokenReference', async () => {
    const outputLines: string[] = [];
    const { controller, posted } = createController({
      queries: [{ label: 'Tasks', jql: 'project = APP' }],
      fetchIssues: async () => {
        throw { serverId: 'atlassian', category: 'network', detail: 'Unexpected response' };
      },
      outputLines,
    });

    await controller.refresh();

    const state = controller.getState();
    assert.strictEqual(state.failures[0].detail, 'Unexpected response');
    assert.strictEqual(outputLines[0], '[network] Unexpected response');
    assert.strictEqual(JSON.stringify(posted).includes('REDACTED'), false);
  });
});
