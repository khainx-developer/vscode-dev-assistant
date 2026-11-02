import * as assert from 'assert';
import * as vscode from 'vscode';
import { GitHubAuthService } from './auth';
import { GitHubConfigStore } from './configStore';
import { GithubMcpAdapter } from './githubMcpAdapter';
import { LastSeenStore } from './lastSeenStore';
import { PullRequestCache } from './pullRequestCache';
import { GitHubViewController } from './viewController';
import { GitHubExtensionConfig, GitHubSession, MonitoredRepo, PullRequestSummary } from './types';
import type { McpConnectionService } from '../mcp/connectionService';

const SESSION: GitHubSession = { username: 'me', accessToken: 'super-secret-token' };

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
      new PullRequestCache(),
    );

    await controller.refresh();

    assert.strictEqual(lastSeenStore.get('o/r#7') !== undefined, true);
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
      new PullRequestCache(),
    );

    await controller.handleMessage({ command: 'github.addRepo', value: 'o/r' });

    assert.strictEqual(addRepoCalled, true);
    assert.strictEqual(fetchCalls >= 0, true);
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
      pullRequestCache,
    );

    await controller.refresh();

    assert.strictEqual(pullRequestCache.writes.length, 1);
    assert.strictEqual(pullRequestCache.writes[0].repoKey, 'o/r');
    assert.strictEqual(pullRequestCache.writes[0].prs, prs);
  });
});
