import * as assert from 'assert';
import * as vscode from 'vscode';
import { GitHubAuthService } from './auth';
import { GitHubConfigStore } from './configStore';
import { GithubMcpAdapter } from './githubMcpAdapter';
import { LastSeenStore } from './lastSeenStore';
import { PullRequestCache } from './pullRequestCache';
import { GitHubViewController } from './viewController';
import { githubCommentSourceKey } from './attentionEngine';
import type {
  GitHubExtensionConfig,
  GitHubSession,
  MonitoredRepo,
  PullRequestSummary,
} from './types';
import { CommentReadStateStore } from '../attention/commentReadStateStore';
import type { CommentReadStateStore as CommentReadStateStoreType } from '../attention/commentReadStateStore';
import type { McpConnectionService } from '../mcp/connectionService';

const SESSION: GitHubSession = { username: 'me', accessToken: 'super-secret-token' };
const BEFORE = '2026-01-01T00:00:00.000Z';
const AFTER = '2026-01-09T00:00:00.000Z';

function makePr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    repoKey: 'owner/repo',
    number: 1,
    title: 'PR',
    url: 'https://x',
    author: 'me',
    state: 'OPEN',
    mergedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    labels: [],
    checkStatus: null,
    mergeable: 'MERGEABLE',
    reviews: [],
    comments: [],
    requestedReviewers: [],
    ...overrides,
  };
}

function makeContext(): vscode.ExtensionContext {
  const store: Record<string, unknown> = {};
  return {
    globalState: {
      get: (key: string, def: unknown) => (store[key] ?? def),
      update: (key: string, value: unknown) => {
        store[key] = value;
        return Promise.resolve();
      },
      setKeysForSync: () => {},
    },
  } as unknown as vscode.ExtensionContext;
}

function makeCommentReadStateStore(context: vscode.ExtensionContext = makeContext()): CommentReadStateStore {
  return new CommentReadStateStore(context);
}

function makeRecordingCommentReadStateStore(initial: Map<string, number> = new Map()): {
  store: CommentReadStateStoreType;
  seenAtBySource: Map<string, number>;
  baselines: string[];
  markedSeen: Array<{ sourceKey: string; at: number }>;
  reconciliations: Set<string>[];
  events: string[];
} {
  const seenAtBySource = new Map(initial);
  const baselines: string[] = [];
  const markedSeen: Array<{ sourceKey: string; at: number }> = [];
  const reconciliations: Set<string>[] = [];
  const events: string[] = [];
  const store = {
    getSeenAt: async (sourceKey: string) => seenAtBySource.get(sourceKey),
    ensureBaseline: async (sourceKey: string, at: number) => {
      baselines.push(sourceKey);
      if (!seenAtBySource.has(sourceKey)) seenAtBySource.set(sourceKey, at);
    },
    markSeen: async (sourceKey: string, at: number) => {
      events.push('markSeen');
      markedSeen.push({ sourceKey, at });
      seenAtBySource.set(sourceKey, at);
    },
    reconcileSources: async (sourceKeys: Set<string>, complete: boolean) => {
      if (complete) reconciliations.push(new Set(sourceKeys));
    },
  } as unknown as CommentReadStateStoreType;
  return { store, seenAtBySource, baselines, markedSeen, reconciliations, events };
}

function makeView(): { view: vscode.WebviewView; posted: unknown[] } {
  const posted: unknown[] = [];
  const view = {
    webview: {
      postMessage: (msg: unknown) => {
        posted.push(msg);
        return Promise.resolve(true);
      },
    },
  } as unknown as vscode.WebviewView;
  return { view, posted };
}

function makeAuthService(session: GitHubSession | undefined): GitHubAuthService {
  return { getSession: async () => session } as unknown as GitHubAuthService;
}

function makeConfigStore(config: GitHubExtensionConfig): GitHubConfigStore {
  return {
    getConfig: () => config,
    addRepo: async () => ({ ok: true }),
    addAuthor: async () => ({ ok: true }),
    removeRepo: async () => {},
    removeAuthor: async () => {},
  } as unknown as GitHubConfigStore;
}

const fakeConnectionService = {} as unknown as McpConnectionService;

function makeClient(
  fetchImpl: (repo: MonitoredRepo) => Promise<PullRequestSummary[]>,
): McpConnectionService {
  GithubMcpAdapter.fetchOpenPullRequests = async (_connectionService, repo) => fetchImpl(repo);
  return fakeConnectionService;
}

class RecordingPullRequestCache extends PullRequestCache {
  readonly writes: Array<{ repoKey: string; prs: PullRequestSummary[] }> = [];

  override setForRepo(repoKey: string, prs: PullRequestSummary[]): void {
    this.writes.push({ repoKey, prs });
    super.setForRepo(repoKey, prs);
  }
}

suite('GitHubViewController', () => {
  let originalFetchOpenPullRequests: typeof GithubMcpAdapter.fetchOpenPullRequests;

  setup(() => {
    originalFetchOpenPullRequests = GithubMcpAdapter.fetchOpenPullRequests;
  });

  teardown(() => {
    GithubMcpAdapter.fetchOpenPullRequests = originalFetchOpenPullRequests;
  });

  test('GitHubViewController_refresh_isNoOp_whenAlreadyRefreshing', async () => {
    const { view } = makeView();
    let fetchCalls = 0;
    let resolveFirst!: () => void;
    const client = makeClient(async () => {
      fetchCalls++;
      await new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      return [];
    });
    const config: GitHubExtensionConfig = { monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    const first = controller.refresh();
    const second = controller.refresh();
    await new Promise((resolve) => setTimeout(resolve, 10));
    resolveFirst();
    await Promise.all([first, second]);

    assert.strictEqual(fetchCalls, 1);
  });

  test('GitHubViewController_refresh_setsAuthExpiredFailure_whenNoSession', async () => {
    const { view } = makeView();
    const config: GitHubExtensionConfig = { monitoredRepos: [], monitoredAuthors: [] };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(undefined),
      makeConfigStore(config),
      makeClient(async () => []),
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    await controller.refresh();
    const state = controller.getState();

    assert.strictEqual(state.authenticated, false);
    assert.deepStrictEqual(state.failures, [{ category: 'auth-expired', detail: 'Not signed in.' }]);
  });

  test('GitHubViewController_refresh_fetchesAllReposInParallel', async () => {
    const { view } = makeView();
    const active: number[] = [];
    let maxConcurrent = 0;
    const client = makeClient(async () => {
      active.push(1);
      maxConcurrent = Math.max(maxConcurrent, active.length);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active.pop();
      return [];
    });
    const config: GitHubExtensionConfig = {
      monitoredRepos: [
        { owner: 'o', repo: 'r1' },
        { owner: 'o', repo: 'r2' },
      ],
      monitoredAuthors: [],
    };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    await controller.refresh();

    assert.strictEqual(maxConcurrent, 2);
  });

  test('GitHubViewController_refresh_oneRepoFailure_doesNotBlockOtherRepos', async () => {
    const { view } = makeView();
    const client = makeClient(async (repo) => {
      if (repo.repo === 'bad') {
        throw { status: 500, message: 'boom' };
      }
      return [makePr({ repoKey: `${repo.owner}/${repo.repo}` })];
    });
    const config: GitHubExtensionConfig = {
      monitoredRepos: [
        { owner: 'o', repo: 'good' },
        { owner: 'o', repo: 'bad' },
      ],
      monitoredAuthors: [],
    };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    await controller.refresh();
    const state = controller.getState();

    assert.strictEqual(state.failures.length, 1);
    assert.strictEqual(state.failures[0].category, 'network');
    assert.strictEqual(state.attention.myPRs.length, 1);
  });

  test('GitHubViewController_refresh_setsRateLimitedUntil_andSkipsFurtherCalls_whenRateLimited', async () => {
    const { view } = makeView();
    const resetAt = new Date('2026-02-01T00:00:00Z').toISOString();
    const client = makeClient(async () => {
      throw {
        status: 403,
        message: 'rate limited',
        response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(new Date(resetAt).getTime() / 1000)) } },
      };
    });
    const config: GitHubExtensionConfig = {
      monitoredRepos: [
        { owner: 'o', repo: 'r1' },
        { owner: 'o', repo: 'r2' },
      ],
      monitoredAuthors: [],
    };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    await controller.refresh();
    const state = controller.getState();

    assert.strictEqual(state.failures.some((f) => f.category === 'rate-limited'), true);
  });

  test('GitHubViewController_refresh_skipsFetch_whenStillWithinRateLimitWindow', async () => {
    const { view } = makeView();
    let fetchCalls = 0;
    const client = makeClient(async () => {
      fetchCalls++;
      throw {
        status: 403,
        message: 'rate limited',
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor((Date.now() + 60 * 60 * 1000) / 1000)),
          },
        },
      };
    });
    const config: GitHubExtensionConfig = { monitoredRepos: [{ owner: 'o', repo: 'r1' }], monitoredAuthors: [] };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    await controller.refresh();
    const callsAfterFirst = fetchCalls;
    await controller.refresh();

    assert.strictEqual(fetchCalls, callsAfterFirst);
  });

  test('GitHubViewController_refresh_callsEnsureBaseline_forEveryFetchedPr', async () => {
    const { view } = makeView();
    const context = makeContext();
    const lastSeenStore = new LastSeenStore(context);
    const client = makeClient(async () => [makePr({ repoKey: 'o/r', number: 7 })]);
    const config: GitHubExtensionConfig = { monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] };
    const controller = new GitHubViewController(
      context,
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      lastSeenStore,
      makeCommentReadStateStore(context),
      new PullRequestCache(),
    );

    await controller.refresh();

    assert.strictEqual(lastSeenStore.get('o/r#7') !== undefined, true);
  });

  test('refresh_buildsPerSourceCommentAttention', async () => {
    const pr = makePr({
      repoKey: 'o/r',
      number: 7,
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
      comments: [{
        id: 'comment-7',
        author: 'reviewer',
        body: 'Please update this section.',
        createdAt: AFTER,
        url: 'https://github.com/o/r/pull/7#issuecomment-7',
      }],
    });
    const sourceKey = githubCommentSourceKey(pr.repoKey, pr.number);
    const store = makeRecordingCommentReadStateStore(
      new Map([[sourceKey, new Date(BEFORE).getTime()]]),
    );
    const { view } = makeView();
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore({ monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] }),
      makeClient(async () => [pr]),
      new LastSeenStore(makeContext()),
      store.store,
      new PullRequestCache(),
    );

    await controller.refresh();

    const state = controller.getState();
    assert.strictEqual(state.commentAttentionBySource[sourceKey].unreadCount, 1);
    assert.strictEqual(state.commentStatusBySource[sourceKey], 'available');
    assert.ok(state.attention.myPRs[0].reasons.includes('pr-unread-comment'));
  });

  test('refresh_firstSuccessfulCommentFetchBaselinesWithoutUnread', async () => {
    const pr = makePr({
      repoKey: 'o/r',
      number: 8,
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
      comments: [{
        id: 'old-comment',
        author: 'reviewer',
        body: 'Existing comment.',
        createdAt: AFTER,
        url: 'https://github.com/o/r/pull/8#issuecomment-8',
      }],
    });
    const sourceKey = githubCommentSourceKey(pr.repoKey, pr.number);
    const store = makeRecordingCommentReadStateStore();
    const { view } = makeView();
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore({ monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] }),
      makeClient(async () => [pr]),
      new LastSeenStore(makeContext()),
      store.store,
      new PullRequestCache(),
    );

    await controller.refresh();

    assert.deepStrictEqual(store.baselines, [sourceKey]);
    assert.strictEqual(controller.getState().commentAttentionBySource[sourceKey].unreadCount, 0);
    assert.strictEqual(controller.getState().commentStatusBySource[sourceKey], 'available');
  });

  test('refresh_partialRepoFailurePreservesCommentState', async () => {
    let failBadRepo = false;
    const goodPr = makePr({
      repoKey: 'o/good',
      number: 1,
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
    });
    const badPr = makePr({
      repoKey: 'o/bad',
      number: 2,
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
      comments: [{
        id: 'comment-2',
        author: 'reviewer',
        body: 'Keep this preview.',
        createdAt: AFTER,
        url: 'https://github.com/o/bad/pull/2#issuecomment-2',
      }],
    });
    const badSourceKey = githubCommentSourceKey(badPr.repoKey, badPr.number);
    const store = makeRecordingCommentReadStateStore(
      new Map([[badSourceKey, new Date(BEFORE).getTime()]]),
    );
    const { view } = makeView();
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore({
        monitoredRepos: [{ owner: 'o', repo: 'good' }, { owner: 'o', repo: 'bad' }],
        monitoredAuthors: [],
      }),
      makeClient(async (repo) => {
        if (repo.repo === 'bad' && failBadRepo) {
          throw { status: 500, message: 'temporary failure' };
        }
        return [repo.repo === 'bad' ? badPr : goodPr];
      }),
      new LastSeenStore(makeContext()),
      store.store,
      new PullRequestCache(),
    );

    await controller.refresh();
    const initialAttention = controller.getState().commentAttentionBySource[badSourceKey];
    failBadRepo = true;
    await controller.refresh();

    const state = controller.getState();
    assert.strictEqual(state.commentAttentionBySource[badSourceKey], initialAttention);
    assert.strictEqual(state.commentStatusBySource[badSourceKey], 'stale');
    assert.strictEqual(store.reconciliations.length, 1);
  });

  test('GitHubViewController_refresh_dropsStalePRs_whenRepoNoLongerMonitored', async () => {
    const { view } = makeView();
    const client = makeClient(async (repo) => [makePr({ repoKey: `${repo.owner}/${repo.repo}`, number: 1 })]);
    const config: GitHubExtensionConfig = { monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    await controller.refresh();
    assert.strictEqual(controller.getState().attention.myPRs.length, 1);

    config.monitoredRepos = [];
    await controller.refresh();

    assert.strictEqual(controller.getState().attention.myPRs.length, 0);
  });

  test('GitHubViewController_handleMessage_markRead_updatesLastSeenWithoutNetworkCall', async () => {
    const { view } = makeView();
    const context = makeContext();
    const lastSeenStore = new LastSeenStore(context);
    let fetchCalls = 0;
    const client = makeClient(async () => {
      fetchCalls++;
      return [];
    });
    const config: GitHubExtensionConfig = { monitoredRepos: [], monitoredAuthors: [] };
    const controller = new GitHubViewController(
      context,
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      lastSeenStore,
      makeCommentReadStateStore(context),
      new PullRequestCache(),
    );

    await controller.handleMessage({ command: 'github.markRead', repoKey: 'o/r', number: 1 });

    assert.strictEqual(fetchCalls, 0);
    assert.strictEqual(lastSeenStore.get('o/r#1') !== undefined, true);
  });

  test('GitHubViewController_handleMessage_openPr_opensExternalUrl_andMarksRead', async () => {
    const { view } = makeView();
    const context = makeContext();
    const lastSeenStore = new LastSeenStore(context);
    const config: GitHubExtensionConfig = { monitoredRepos: [], monitoredAuthors: [] };
    const controller = new GitHubViewController(
      context,
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      makeClient(async () => []),
      lastSeenStore,
      makeCommentReadStateStore(context),
      new PullRequestCache(),
    );
    const originalOpenExternal = vscode.env.openExternal;
    let openedUrl: vscode.Uri | undefined;
    (vscode.env as any).openExternal = async (uri: vscode.Uri) => {
      openedUrl = uri;
      return true;
    };

    try {
      await controller.handleMessage({
        command: 'github.openPr',
        repoKey: 'o/r',
        number: 1,
        url: 'https://github.com/o/r/pull/1',
      });
    } finally {
      (vscode.env as any).openExternal = originalOpenExternal;
    }

    assert.strictEqual(openedUrl?.toString(), 'https://github.com/o/r/pull/1');
    assert.strictEqual(lastSeenStore.get('o/r#1') !== undefined, true);
  });

  test('openPr_success_marksCommentSourceAfterOpen', async () => {
    const { view } = makeView();
    const pr = makePr({
      repoKey: 'o/r',
      number: 9,
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
      comments: [{
        id: 'comment-9',
        author: 'reviewer',
        body: 'New comment',
        createdAt: AFTER,
        url: 'https://github.com/o/r/pull/9#issuecomment-9',
      }],
    });
    const sourceKey = githubCommentSourceKey(pr.repoKey, pr.number);
    const store = makeRecordingCommentReadStateStore(
      new Map([[sourceKey, new Date(BEFORE).getTime()]]),
    );
    const context = makeContext();
    const controller = new GitHubViewController(
      context,
      view,
      makeAuthService(SESSION),
      makeConfigStore({ monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] }),
      makeClient(async () => [pr]),
      new LastSeenStore(context),
      store.store,
      new PullRequestCache(),
    );
    await controller.refresh();

    const events = store.events;
    const originalOpenExternal = vscode.env.openExternal;
    (vscode.env as any).openExternal = async () => {
      events.push('open');
      return true;
    };
    events.length = 0;
    try {
      await controller.handleMessage({
        command: 'github.openPr',
        repoKey: 'o/r',
        number: 9,
        url: pr.url,
      });
    } finally {
      (vscode.env as any).openExternal = originalOpenExternal;
    }

    assert.deepStrictEqual(events, ['open', 'markSeen']);
    assert.deepStrictEqual(store.markedSeen.map((mark) => mark.sourceKey), [sourceKey]);
    assert.strictEqual(controller.getState().commentAttentionBySource[sourceKey].unreadCount, 0);
    assert.strictEqual(controller.getState().pendingOperations['github.openPr']?.result?.ok, true);
  });

  test('openComment_failureLeavesCommentMarker', async () => {
    const { view } = makeView();
    const pr = makePr({
      repoKey: 'o/r',
      number: 10,
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
      comments: [{
        id: 'comment-10',
        author: 'reviewer',
        body: 'Unread comment',
        createdAt: AFTER,
        url: 'https://github.com/o/r/pull/10#issuecomment-10',
      }],
    });
    const sourceKey = githubCommentSourceKey(pr.repoKey, pr.number);
    const store = makeRecordingCommentReadStateStore(
      new Map([[sourceKey, new Date(BEFORE).getTime()]]),
    );
    const context = makeContext();
    const lastSeenStore = new LastSeenStore(context);
    const controller = new GitHubViewController(
      context,
      view,
      makeAuthService(SESSION),
      makeConfigStore({ monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] }),
      makeClient(async () => [pr]),
      lastSeenStore,
      store.store,
      new PullRequestCache(),
    );
    await controller.refresh();

    const originalOpenExternal = vscode.env.openExternal;
    (vscode.env as any).openExternal = async () => false;
    try {
      await controller.handleMessage({
        command: 'github.openComment',
        repoKey: 'o/r',
        number: 10,
        url: pr.comments[0].url,
      });
    } finally {
      (vscode.env as any).openExternal = originalOpenExternal;
    }

    assert.deepStrictEqual(store.markedSeen, []);
    assert.strictEqual(lastSeenStore.get('o/r#10') !== undefined, true);
    assert.strictEqual(controller.getState().commentAttentionBySource[sourceKey].unreadCount, 1);
    assert.strictEqual(controller.getState().pendingOperations['github.openComment']?.result?.ok, false);
  });

  test('GitHubViewController_handleMessage_addRepo_triggersRefreshAfterConfigUpdate', async () => {
    const { view } = makeView();
    let fetchCalls = 0;
    const config: GitHubExtensionConfig = { monitoredRepos: [], monitoredAuthors: [] };
    const configStore = makeConfigStore(config);
    let addRepoCalled = false;
    (configStore as any).addRepo = async () => {
      addRepoCalled = true;
      return { ok: true };
    };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      configStore,
      makeClient(async () => {
        fetchCalls++;
        return [];
      }),
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    await controller.handleMessage({ command: 'github.addRepo', value: 'o/r' });

    assert.strictEqual(addRepoCalled, true);
    assert.strictEqual(fetchCalls >= 0, true);
  });

  test('handleMessage_addRepo_publishesPendingAndResult', async () => {
    const { view, posted } = makeView();
    const config: GitHubExtensionConfig = { monitoredRepos: [], monitoredAuthors: [] };
    const configStore = makeConfigStore(config);
    let finishAdd: ((result: { ok: true } | { ok: false; reason: string }) => void) | undefined;
    (configStore as any).addRepo = async () => new Promise((resolve) => {
      finishAdd = resolve;
    });
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      configStore,
      makeClient(async () => []),
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    const operation = controller.handleMessage({ command: 'github.addRepo', value: 'o/r' });
    assert.ok(posted.some((message) => {
      const stateMessage = message as { command?: string; state?: { pendingOperations?: Record<string, { pending: boolean }> } };
      return stateMessage.command === 'github.state'
        && stateMessage.state?.pendingOperations?.['github.addRepo']?.pending === true;
    }));

    finishAdd?.({ ok: true });
    await operation;

    assert.strictEqual(controller.getState().pendingOperations['github.addRepo']?.pending, false);
    assert.ok(posted.some((message) => {
      const operationMessage = message as {
        command?: string;
        operationId?: string;
        result?: { ok?: boolean };
      };
      return operationMessage.command === 'github.operationResult'
        && operationMessage.operationId === 'github.addRepo'
        && operationMessage.result?.ok === true;
    }));
  });

  test('GitHubViewController_buildViewModel_neverIncludesAccessToken', async () => {
    const { view } = makeView();
    const client = makeClient(async () => [makePr()]);
    const config: GitHubExtensionConfig = { monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
    );

    await controller.refresh();
    const state = controller.getState();

    assert.strictEqual(JSON.stringify(state).includes(SESSION.accessToken), false);
  });

  test('GitHubViewController_neverCallsOutputChannel_withAccessToken', async () => {
    const { view } = makeView();
    const appended: string[] = [];
    const client = makeClient(async () => {
      throw { status: 500, message: 'Internal Server Error' };
    });
    const config: GitHubExtensionConfig = { monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] };
    const outputChannel = { appendLine: (value: string) => appended.push(value) };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      client,
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      new PullRequestCache(),
      outputChannel,
    );

    await controller.refresh();

    assert.strictEqual(appended.some((line) => line.includes(SESSION.accessToken)), false);
  });

  test('GitHubViewController_refresh_writesFetchedPrsIntoSharedCache', async () => {
    const { view } = makeView();
    const prs = [makePr({ repoKey: 'o/r', number: 7 })];
    const pullRequestCache = new RecordingPullRequestCache();
    const config: GitHubExtensionConfig = { monitoredRepos: [{ owner: 'o', repo: 'r' }], monitoredAuthors: [] };
    const controller = new GitHubViewController(
      makeContext(),
      view,
      makeAuthService(SESSION),
      makeConfigStore(config),
      makeClient(async () => prs),
      new LastSeenStore(makeContext()),
      makeCommentReadStateStore(),
      pullRequestCache,
    );

    await controller.refresh();

    assert.strictEqual(pullRequestCache.writes.length, 1);
    assert.strictEqual(pullRequestCache.writes[0].repoKey, 'o/r');
    assert.strictEqual(pullRequestCache.writes[0].prs, prs);
  });
});
