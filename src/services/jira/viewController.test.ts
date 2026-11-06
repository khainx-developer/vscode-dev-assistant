import * as assert from 'assert';
import * as vscode from 'vscode';
import { AtlassianMcpAdapter } from '../../infrastructure/jira/atlassianMcpAdapter';
import { JiraConfigStore } from '../../infrastructure/jira/configStore';
import { JiraConnectionStore } from '../../infrastructure/jira/connectionStore';
import { JiraViewController } from './viewController';
import { PullRequestCache } from '../../infrastructure/github/pullRequestCache';
import type { CommentReadStateStore } from '../../infrastructure/attention/commentReadStateStore';
import type { McpConnectionService } from '../../infrastructure/mcp/connectionService';
import type {
  JiraConnection,
  JiraOutgoingMessage,
  JiraSavedQuery,
  JiraTask,
  OperationResult,
} from '../../shared/jiraTypes';
import type { PullRequestSummary } from '../../shared/githubTypes';

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
  fetchIssueComments?: typeof AtlassianMcpAdapter.fetchIssueComments;
  pullRequestCache?: PullRequestCache;
  seenAtBySource?: Map<string, number>;
  connectionStoreOverrides?: Partial<
    Pick<JiraConnectionStore, 'getConnection' | 'saveConnection' | 'clearConnection'>
  >;
  configStoreOverrides?: Partial<
    Pick<
      JiraConfigStore,
      | 'getSavedQueries'
      | 'addQuery'
      | 'updateQuery'
      | 'removeQuery'
      | 'getCurrentUser'
      | 'setCurrentUser'
      | 'getTeamMembers'
      | 'addTeamMember'
      | 'removeTeamMember'
    >
  >;
  currentUser?: string | null;
  teamMembers?: string[];
  outputLines?: string[];
} = {}): {
  controller: JiraViewController;
  posted: JiraOutgoingMessage[];
  outputLines: string[];
  markerState: {
    seenAtBySource: Map<string, number>;
    baselines: string[];
    markedSeen: string[];
    reconciliations: Set<string>[];
    events: string[];
  };
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
    updateQuery: async () => ({ ok: true }),
    removeQuery: async () => {},
    getCurrentUser: () => options.currentUser ?? null,
    setCurrentUser: async () => ({ ok: true }),
    getTeamMembers: () => options.teamMembers ?? [],
    addTeamMember: async () => ({ ok: true }),
    removeTeamMember: async () => {},
    ...options.configStoreOverrides,
  } as unknown as JiraConfigStore;
  AtlassianMcpAdapter.fetchIssues = options.fetchIssues ?? (async () => []);
  AtlassianMcpAdapter.fetchIssueComments = options.fetchIssueComments ?? (async () => []);
  const connectionService = {} as unknown as McpConnectionService;
  const markerState = {
    seenAtBySource: options.seenAtBySource ?? new Map<string, number>(),
    baselines: [] as string[],
    markedSeen: [] as string[],
    reconciliations: [] as Set<string>[],
    events: [] as string[],
  };
  const commentReadStateStore = {
    getSeenAt: async (sourceKey: string) => markerState.seenAtBySource.get(sourceKey),
    ensureBaseline: async (sourceKey: string, at: number) => {
      markerState.baselines.push(sourceKey);
      if (!markerState.seenAtBySource.has(sourceKey)) {
        markerState.seenAtBySource.set(sourceKey, at);
      }
    },
    markSeen: async (sourceKey: string, at: number) => {
      markerState.events.push('markSeen');
      markerState.markedSeen.push(sourceKey);
      markerState.seenAtBySource.set(sourceKey, at);
    },
    reconcileSources: async (sourceKeys: Set<string>, complete: boolean) => {
      if (complete) markerState.reconciliations.push(new Set(sourceKeys));
    },
  } as unknown as CommentReadStateStore;
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
      commentReadStateStore,
      options.pullRequestCache ?? new PullRequestCache(),
      outputChannel,
    ),
    posted,
    outputLines,
    markerState,
  };
}

suite('JiraViewController', () => {
  let originalFetchIssues: typeof AtlassianMcpAdapter.fetchIssues;
  let originalFetchIssueComments: typeof AtlassianMcpAdapter.fetchIssueComments;

  setup(() => {
    originalFetchIssues = AtlassianMcpAdapter.fetchIssues;
    originalFetchIssueComments = AtlassianMcpAdapter.fetchIssueComments;
  });

  teardown(() => {
    AtlassianMcpAdapter.fetchIssues = originalFetchIssues;
    AtlassianMcpAdapter.fetchIssueComments = originalFetchIssueComments;
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
    assert.strictEqual(posted.length, 2);
    assert.strictEqual((posted[0] as Extract<JiraOutgoingMessage, { command: 'jira.state' }>).state.isRefreshing, true);
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

  test('getState_includesTeamMembers_fromConfigStore', () => {
    const { controller } = createController({ teamMembers: ['Alex Smith'] });

    assert.deepStrictEqual(controller.getState().teamMembers, ['Alex Smith']);
  });

  test('handleMessage_setCurrentUser_callsConfigStoreAndPostsState', async () => {
    let savedName: string | undefined;
    const { controller, posted } = createController({
      configStoreOverrides: {
        setCurrentUser: async (displayName: string) => {
          savedName = displayName;
          return { ok: true };
        },
      },
    });

    await controller.handleMessage({ command: 'jira.setCurrentUser', displayName: 'Bob Jones' });

    assert.strictEqual(savedName, 'Bob Jones');
    assert.deepStrictEqual(
      posted.find((message) => message.command === 'jira.currentUserResult'),
      { command: 'jira.currentUserResult', ok: true },
    );
    assert.strictEqual(posted.some((m) => m.command === 'jira.state'), true);
  });

  test('handleMessage_currentUserCollision_preservesSettings', async () => {
    let currentUser = 'Manager';
    const teamMembers = ['Alex Smith'];
    const { controller, posted } = createController({
      currentUser,
      teamMembers,
      configStoreOverrides: {
        getCurrentUser: () => currentUser,
        getTeamMembers: () => teamMembers,
        setCurrentUser: async (displayName: string) => {
          if (teamMembers.some((member) => member.toLowerCase() === displayName.trim().toLowerCase())) {
            return { ok: false, reason: 'The current user cannot also be a team member.' };
          }
          currentUser = displayName;
          return { ok: true };
        },
      },
    });

    await controller.handleMessage({ command: 'jira.setCurrentUser', displayName: 'Alex Smith' });

    assert.strictEqual(currentUser, 'Manager');
    assert.deepStrictEqual(teamMembers, ['Alex Smith']);
    assert.deepStrictEqual(
      posted.find((message) => message.command === 'jira.currentUserResult'),
      {
        command: 'jira.currentUserResult',
        ok: false,
        reason: 'The current user cannot also be a team member.',
      },
    );
    assert.strictEqual(posted.some((message) => message.command === 'jira.state'), true);
    assert.deepStrictEqual(controller.getState().pendingOperations['jira.setCurrentUser'], {
      operationId: 'jira.setCurrentUser',
      pending: false,
      result: { ok: false, reason: 'The current user cannot also be a team member.' },
    });
  });

  test('handleMessage_teamMemberCommands_postResultsAndUpdatedState', async () => {
    let members = ['Alex Smith'];
    const { controller, posted } = createController({
      configStoreOverrides: {
        getTeamMembers: () => members,
        addTeamMember: async (displayName: string) => {
          members = [...members, displayName];
          return { ok: true };
        },
        removeTeamMember: async (displayName: string) => {
          members = members.filter((member) => member !== displayName);
        },
      },
    });

    await controller.handleMessage({ command: 'jira.addTeamMember', displayName: 'Taylor Jones' });
    await controller.handleMessage({ command: 'jira.removeTeamMember', displayName: 'Alex Smith' });

    assert.deepStrictEqual(
      posted.filter((message) => message.command === 'jira.teamMemberResult'),
      [
        { command: 'jira.teamMemberResult', ok: true },
        { command: 'jira.teamMemberResult', ok: true },
      ],
    );
    const states = posted.filter((message) => message.command === 'jira.state');
    assert.deepStrictEqual(states.map((message) => message.state.teamMembers), [
      ['Alex Smith'],
      ['Alex Smith', 'Taylor Jones'],
      ['Alex Smith', 'Taylor Jones'],
      ['Taylor Jones'],
    ]);
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

  test('refresh_usesSavedQueryJqlWithoutAddingTeamAssignees', async () => {
    let fetchedJql = '';
    const { controller } = createController({
      queries: [{ label: 'Open tasks', jql: 'resolution = Unresolved ORDER BY updated DESC' }],
      teamMembers: ['Alex Smith', 'Sam Lee'],
      fetchIssues: async (_service, _siteId, jql) => {
        fetchedJql = jql;
        return [];
      },
    });

    await controller.refresh();

    assert.strictEqual(fetchedJql, 'resolution = Unresolved ORDER BY updated DESC');
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

  test('refresh_deduplicatesIssueKeysAcrossQueries', async () => {
    let commentCalls = 0;
    const task = makeTask('APP-9');
    const { controller, markerState } = createController({
      queries: [
        { label: 'First', jql: 'project = FIRST' },
        { label: 'Second', jql: 'project = SECOND' },
      ],
      fetchIssues: async (_service, _siteId, jql) => [makeTask(jql === 'project = FIRST' ? task.key : task.key)],
      fetchIssueComments: async () => {
        commentCalls++;
        return [];
      },
    });

    await controller.refresh();

    assert.strictEqual(commentCalls, 1);
    assert.deepStrictEqual(markerState.baselines, ['jira:cloud-1:APP-9']);
    assert.strictEqual(controller.getState().tasksByQuery.First[0].commentSourceKey, 'jira:cloud-1:APP-9');
    assert.strictEqual(controller.getState().tasksByQuery.Second[0].commentState, 'available');
  });

  test('refreshPullRequestLinks_relinksTasksAfterGitHubCacheUpdates', async () => {
    const pullRequestCache = new PullRequestCache();
    const { controller, posted } = createController({
      queries: [{ label: 'Watched', jql: 'project = APP' }],
      fetchIssues: async () => [makeTask('APP-12')],
      fetchIssueComments: async () => [],
      pullRequestCache,
    });

    await controller.refresh();
    assert.strictEqual(controller.getState().tasksByQuery.Watched[0].prLink.kind, 'not-available');

    const pr = makePr({ number: 12, title: 'Fix APP-12' });
    pullRequestCache.setForRepo('owner/repo', [pr]);
    controller.refreshPullRequestLinks();

    const linkedTask = controller.getState().tasksByQuery.Watched[0];
    assert.strictEqual(linkedTask.prLink.kind, 'linked');
    if (linkedTask.prLink.kind === 'linked') {
      assert.strictEqual(linkedTask.prLink.pr.number, 12);
    }

    const stateMessages = posted.filter((message) => message.command === 'jira.state');
    const publishedState = stateMessages[stateMessages.length - 1];
    assert.strictEqual(publishedState.command, 'jira.state');
    if (publishedState.command === 'jira.state') {
      assert.strictEqual(publishedState.state.tasksByQuery.Watched[0].prLink.kind, 'linked');
    }

    const messageCount = posted.length;
    controller.refreshPullRequestLinks();
    assert.strictEqual(posted.length, messageCount);
  });

  test('refresh_fetchesCommentsForWatchedTasks', async () => {
    const seenAt = Date.parse('2026-10-01T00:00:00Z');
    const sourceKey = 'jira:cloud-1:APP-10';
    const { controller, markerState } = createController({
      queries: [{ label: 'Watched', jql: 'project = APP' }],
      currentUser: 'Alice',
      seenAtBySource: new Map([[sourceKey, seenAt]]),
      fetchIssues: async () => [makeTask('APP-10')],
      fetchIssueComments: async (_service, _siteId, issueKey, _siteUrl, marker) => {
        assert.strictEqual(issueKey, 'APP-10');
        assert.strictEqual(marker, seenAt);
        return [
          { id: 'new', author: 'Bob', body: 'new body', createdAt: '2026-10-02T00:00:00Z', visibility: null, url: 'https://example.test/APP-10' },
          { id: 'self', author: 'Alice', body: 'own body', createdAt: '2026-10-03T00:00:00Z', visibility: null, url: 'https://example.test/APP-10' },
          { id: 'bot', author: 'Automation for Jira', body: 'bot body', createdAt: '2026-10-04T00:00:00Z', visibility: null, url: 'https://example.test/APP-10' },
          { id: 'old', author: 'Carol', body: 'old body', createdAt: '2026-09-30T00:00:00Z', visibility: null, url: 'https://example.test/APP-10' },
        ];
      },
    });

    await controller.refresh();

    const task = controller.getState().tasksByQuery.Watched[0];
    assert.strictEqual(task.commentState, 'available');
    assert.strictEqual(task.commentAttention?.unreadCount, 1);
    assert.strictEqual(task.commentAttention?.latestUnreadComment?.id, 'new');
    assert.deepStrictEqual(markerState.baselines, []);
  });

  test('refresh_partialCommentFailurePreservesLastSuccessfulState', async () => {
    const sourceKey = 'jira:cloud-1:APP-11';
    let failComments = false;
    const { controller, markerState } = createController({
      queries: [{ label: 'Tasks', jql: 'project = APP' }],
      seenAtBySource: new Map([[sourceKey, Date.parse('2026-10-01T00:00:00Z')]]),
      fetchIssues: async () => [makeTask('APP-11')],
      fetchIssueComments: async () => {
        if (failComments) {
          throw { serverId: 'atlassian', category: 'network', detail: 'Comments unavailable' };
        }
        return [{
          id: 'comment-11',
          author: 'Bob',
          body: 'previous body',
          createdAt: '2026-10-02T00:00:00Z',
          visibility: null,
          url: 'https://example.test/APP-11',
        }];
      },
    });

    await controller.refresh();
    const previous = controller.getState().tasksByQuery.Tasks[0];
    failComments = true;
    await controller.refresh();

    const current = controller.getState().tasksByQuery.Tasks[0];
    assert.strictEqual(current.commentState, 'stale');
    assert.deepStrictEqual(current.comments, previous.comments);
    assert.deepStrictEqual(current.commentAttention, previous.commentAttention);
    assert.strictEqual(current.commentFailure?.category, 'network');
    assert.strictEqual(markerState.reconciliations.length, 1);
  });

  test('refresh_reconcilesOnlyAfterCompleteSourceFetch', async () => {
    const { controller, markerState } = createController({
      queries: [
        { label: 'Broken', jql: 'invalid' },
        { label: 'Working', jql: 'project = OK' },
      ],
      fetchIssues: async (_service, _siteId, jql) => {
        if (jql === 'invalid') throw { serverId: 'atlassian', category: 'invalid-entry', detail: 'Bad JQL' };
        return [makeTask('OK-1')];
      },
      fetchIssueComments: async () => [],
    });

    await controller.refresh();

    assert.strictEqual(markerState.reconciliations.length, 0);
    assert.strictEqual(controller.getState().tasksByQuery.Working[0].commentState, 'available');
  });

  test('handleMessage_addTeamMember_postsPendingAndResult', async () => {
    let finishAdd: ((result: OperationResult) => void) | undefined;
    const { controller, posted } = createController({
      configStoreOverrides: {
        addTeamMember: async () => new Promise<OperationResult>((resolve) => {
          finishAdd = resolve;
        }),
      },
    });

    const operation = controller.handleMessage({ command: 'jira.addTeamMember', displayName: 'Taylor Jones' });
    const pendingState = posted.find(
      (message) => message.command === 'jira.state'
        && message.state.pendingOperations['jira.addTeamMember']?.pending,
    );
    assert.ok(pendingState);

    finishAdd?.({ ok: true });
    await operation;

    assert.deepStrictEqual(controller.getState().pendingOperations['jira.addTeamMember'], {
      operationId: 'jira.addTeamMember',
      pending: false,
      result: { ok: true },
    });
    assert.ok(posted.some((message) => message.command === 'jira.operationResult'
      && message.operationId === 'jira.addTeamMember'
      && message.result.ok));
  });

  test('openTask_success_marksOnlyIssueSeen', async () => {
    const { controller, markerState } = createController({
      queries: [{ label: 'Tasks', jql: 'project = APP' }],
      fetchIssues: async () => [makeTask('APP-12'), makeTask('APP-13')],
      fetchIssueComments: async () => [],
    });
    await controller.refresh();

    const env = vscode.env as unknown as { openExternal: typeof vscode.env.openExternal };
    const originalOpenExternal = env.openExternal;
    env.openExternal = async () => {
      markerState.events.push('openExternal');
      return true;
    };
    markerState.markedSeen.length = 0;
    markerState.events.length = 0;

    try {
      await controller.handleMessage({
        command: 'jira.openTask',
        url: 'https://example.atlassian.net/browse/APP-12',
      });
    } finally {
      env.openExternal = originalOpenExternal;
    }

    assert.deepStrictEqual(markerState.events, ['openExternal', 'markSeen']);
    assert.deepStrictEqual(markerState.markedSeen, ['jira:cloud-1:APP-12']);
  });

  test('openTask_failureDoesNotMarkCommentMarker', async () => {
    const { controller, markerState } = createController({
      queries: [{ label: 'Tasks', jql: 'project = APP' }],
      fetchIssues: async () => [makeTask('APP-14')],
      fetchIssueComments: async () => [],
    });
    await controller.refresh();

    const env = vscode.env as unknown as { openExternal: typeof vscode.env.openExternal };
    const originalOpenExternal = env.openExternal;
    env.openExternal = async () => false;
    markerState.markedSeen.length = 0;
    try {
      await controller.handleMessage({
        command: 'jira.openTask',
        url: 'https://example.atlassian.net/browse/APP-14',
      });
    } finally {
      env.openExternal = originalOpenExternal;
    }
    assert.deepStrictEqual(markerState.markedSeen, []);
    assert.strictEqual(controller.getState().pendingOperations['jira.openTask']?.result?.ok, false);
  });

  test('operationFailure_clearsPendingAndReportsRetryableError', async () => {
    const { controller } = createController({
      configStoreOverrides: {
        addTeamMember: async () => {
          throw { serverId: 'atlassian', category: 'network', detail: 'Temporary failure' };
        },
      },
    });

    await controller.handleMessage({ command: 'jira.addTeamMember', displayName: 'Taylor Jones' });

    assert.deepStrictEqual(controller.getState().pendingOperations['jira.addTeamMember'], {
      operationId: 'jira.addTeamMember',
      pending: false,
      result: { ok: false, reason: 'Temporary failure' },
    });
  });

  test('refresh_linkageComputedViaMatchPullRequestForIssue', async () => {
    const pullRequestCache = new PullRequestCache();
    const pr = makePr({ title: 'Implement issue fix', headRef: 'feature/APP-1-jira-linkage' });
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
    let updated = false;
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
        updateQuery: async (originalLabel, label, jql) => {
          updated = true;
          assert.strictEqual(originalLabel, 'Tasks');
          assert.strictEqual(label, 'My tasks');
          assert.strictEqual(jql, 'project = APP2');
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
    await controller.handleMessage({
      command: 'jira.updateQuery',
      originalLabel: 'Tasks',
      label: 'My tasks',
      jql: 'project = APP2',
    });
    await controller.handleMessage({ command: 'jira.removeQuery', label: 'My tasks' });

    assert.strictEqual(saved, true);
    assert.strictEqual(added, true);
    assert.strictEqual(updated, true);
    assert.strictEqual(removed, true);
    const connectionResult = posted.find((message) => message.command === 'jira.connectionResult');
    const queryResult = posted.find((message) => message.command === 'jira.queryResult');
    const updateQueryResult = posted.find((message) => message.command === 'jira.updateQueryResult');
    assert.deepStrictEqual(connectionResult, { command: 'jira.connectionResult', ok: true });
    assert.deepStrictEqual(queryResult, { command: 'jira.queryResult', ok: true });
    assert.deepStrictEqual(updateQueryResult, { command: 'jira.updateQueryResult', ok: true });
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
