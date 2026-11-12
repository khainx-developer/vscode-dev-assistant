import * as assert from 'assert';
import * as vscode from 'vscode';
import { DashboardSession, type SessionSurface } from './dashboardSession';
import type { AppServices } from './container';
import { LastSeenStore } from '../infrastructure/github/lastSeenStore';
import { PullRequestCache } from '../infrastructure/github/pullRequestCache';
import { CommentReadStateStore } from '../infrastructure/attention/commentReadStateStore';
import { AttentionPrefsStore } from '../infrastructure/attention/attentionPrefsStore';
import type { GitHubSession } from '../shared/githubTypes';
import type { HostEvent, SessionStatus } from '../shared/messages';

function makeContext(): vscode.ExtensionContext {
  const store: Record<string, unknown> = {};
  const globalState = {
    get: (key: string, fallback?: unknown) => (key in store ? store[key] : fallback),
    update: async (key: string, value: unknown) => {
      store[key] = value;
    },
    setKeysForSync: () => undefined,
    keys: () => Object.keys(store),
  };
  return { globalState } as unknown as vscode.ExtensionContext;
}

interface Recorder {
  getSessionCalls: boolean[];
  saveConnectionCalls: string[];
  clearConnectionCalls: number;
  signedIn: boolean;
}

function makeServices(recorder: Recorder): AppServices {
  const context = makeContext();
  const session: GitHubSession = { username: 'octocat', accessToken: 'secret-token' };
  return {
    context,
    output: { appendLine: () => undefined } as unknown as vscode.OutputChannel,
    githubAuth: {
      getSession: async (createIfNone: boolean) => {
        recorder.getSessionCalls.push(createIfNone);
        if (createIfNone) recorder.signedIn = true;
        return recorder.signedIn ? session : undefined;
      },
    },
    githubConfig: { getConfig: () => ({ monitoredRepos: [], monitoredAuthors: [] }) },
    lastSeen: new LastSeenStore(context),
    pullRequestCache: new PullRequestCache(),
    mcp: {},
    jiraConnection: {
      getConnection: async () => undefined,
      saveConnection: async (siteUrl: string) => {
        recorder.saveConnectionCalls.push(siteUrl);
        return { ok: false, reason: 'Authorization was cancelled.' };
      },
      clearConnection: async () => {
        recorder.clearConnectionCalls++;
      },
    },
    jiraConfig: {
      getCurrentUser: () => null,
      getTeamMembers: () => [],
      getSavedQueries: () => [],
    },
    commentReadState: new CommentReadStateStore(context),
    attentionPrefs: new AttentionPrefsStore(context.globalState),
    aiConfig: { getProvider: () => 'none' },
    languageModels: {},
  } as unknown as AppServices;
}

function makeSurface(): SessionSurface & { messages: HostEvent[] } {
  const messages: HostEvent[] = [];
  return {
    messages,
    visible: true,
    postMessage: (message: HostEvent) => {
      messages.push(message);
      return Promise.resolve(true);
    },
  };
}

function lastStatus(messages: HostEvent[]): SessionStatus | undefined {
  const statuses = messages.filter((message): message is Extract<HostEvent, { command: 'session.status' }> => message.command === 'session.status');
  return statuses[statuses.length - 1]?.status;
}

suite('DashboardSession', () => {
  let session: DashboardSession | undefined;

  teardown(() => {
    session?.dispose();
    session = undefined;
  });

  test('githubSignIn_goesThroughTheSameInteractiveAuthCall_once', async () => {
    const recorder: Recorder = { getSessionCalls: [], saveConnectionCalls: [], clearConnectionCalls: 0, signedIn: false };
    session = new DashboardSession(makeServices(recorder));
    await session.refreshAll({ notify: false });
    recorder.getSessionCalls.length = 0;

    await session.handleCommand({ command: 'github.signIn' });

    assert.deepStrictEqual(recorder.getSessionCalls.filter((createIfNone) => createIfNone), [true]);
    assert.strictEqual(session.getGitHubState()?.authenticated, true);
    assert.strictEqual(session.getStatus().github.kind, 'ready');
  });

  test('jiraConnectAndDisconnect_delegateToConnectionStoreUnchanged', async () => {
    const recorder: Recorder = { getSessionCalls: [], saveConnectionCalls: [], clearConnectionCalls: 0, signedIn: false };
    session = new DashboardSession(makeServices(recorder));

    await session.handleCommand({ command: 'jira.saveConnection', siteUrl: 'https://acme.atlassian.net' });
    await session.handleCommand({ command: 'jira.disconnect' });

    assert.deepStrictEqual(recorder.saveConnectionCalls, ['https://acme.atlassian.net']);
    assert.strictEqual(recorder.clearConnectionCalls, 1);
    assert.strictEqual(session.getStatus().jira.kind, 'disconnected');
  });

  test('concurrentRefreshes_shareOneInFlightRefresh', async () => {
    const recorder: Recorder = { getSessionCalls: [], saveConnectionCalls: [], clearConnectionCalls: 0, signedIn: true };
    session = new DashboardSession(makeServices(recorder));
    await session.refreshAll({ notify: false });
    recorder.getSessionCalls.length = 0;

    const first = session.refreshAll({ notify: false });
    const second = session.refreshAll({ notify: false });
    assert.strictEqual(first, second);
    await first;
    assert.deepStrictEqual(recorder.getSessionCalls, [false]);
  });

  test('surfaceReady_replaysStateToLateSurfaces_andAllSurfacesShareUpdates', async () => {
    const recorder: Recorder = { getSessionCalls: [], saveConnectionCalls: [], clearConnectionCalls: 0, signedIn: true };
    session = new DashboardSession(makeServices(recorder));
    const sidebar = makeSurface();
    session.attach(sidebar);
    await session.refreshAll({ notify: false });

    const panel = makeSurface();
    session.attach(panel);
    session.surfaceReady(panel);

    const replayed = panel.messages.map((message) => message.command);
    assert.ok(replayed.includes('github.state'));
    assert.ok(replayed.includes('jira.state'));
    assert.ok(replayed.includes('dashboard.inboxState'));
    assert.strictEqual(lastStatus(panel.messages)?.dashboard.kind, 'ready');
    assert.strictEqual(lastStatus(sidebar.messages)?.github.kind, 'ready');
  });

  test('stateMessagesNeverCarryTheAccessToken', async () => {
    const recorder: Recorder = { getSessionCalls: [], saveConnectionCalls: [], clearConnectionCalls: 0, signedIn: true };
    session = new DashboardSession(makeServices(recorder));
    const surface = makeSurface();
    session.attach(surface);
    await session.refreshAll({ notify: false });
    assert.doesNotMatch(JSON.stringify(surface.messages), /secret-token/);
  });

  test('pausedMonitoring_skipsRefreshAndBlocksNetworkCommands', async () => {
    const recorder: Recorder = { getSessionCalls: [], saveConnectionCalls: [], clearConnectionCalls: 0, signedIn: true };
    const values: Record<string, unknown> = {
      'devMateKit.monitoring.enabled': true,
      'devMateKit.refresh.background': true,
      'devMateKit.notifications.enabled': true,
    };
    const changeEmitter = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
    const originalGetConfiguration = vscode.workspace.getConfiguration;
    const originalOnDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration;
    (vscode.workspace as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = ((section?: string) => ({
      get: (key: string, fallback?: unknown) => {
        const full = section ? `${section}.${key}` : key;
        return full in values ? values[full] : fallback;
      },
      update: async (key: string, value: unknown) => {
        const full = section ? `${section}.${key}` : key;
        values[full] = value;
        changeEmitter.fire({
          affectsConfiguration: (name: string) => full === name || full.startsWith(`${name}.`),
        });
      },
      has: () => false,
      inspect: () => undefined,
    })) as unknown as typeof vscode.workspace.getConfiguration;
    (vscode.workspace as { onDidChangeConfiguration: typeof vscode.workspace.onDidChangeConfiguration }).onDidChangeConfiguration =
      changeEmitter.event;

    try {
      session = new DashboardSession(makeServices(recorder));
      const surface = makeSurface();
      session.attach(surface);
      await session.refreshAll({ notify: false });
      recorder.getSessionCalls.length = 0;
      recorder.saveConnectionCalls.length = 0;

      await session.setMonitoringEnabled(false);
      assert.strictEqual(session.isMonitoringEnabled(), false);
      assert.strictEqual(session.getStatus().monitoringEnabled, false);

      await session.refreshAll({ notify: false });
      await session.handleCommand({ command: 'session.refreshAll' });
      await session.handleCommand({ command: 'github.signIn' });
      await session.handleCommand({ command: 'jira.saveConnection', siteUrl: 'https://acme.atlassian.net' });

      assert.deepStrictEqual(recorder.getSessionCalls, []);
      assert.deepStrictEqual(recorder.saveConnectionCalls, []);

      await session.setMonitoringEnabled(true);
      assert.strictEqual(session.isMonitoringEnabled(), true);
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(recorder.getSessionCalls.length >= 1);
    } finally {
      (vscode.workspace as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = originalGetConfiguration;
      (vscode.workspace as { onDidChangeConfiguration: typeof vscode.workspace.onDidChangeConfiguration }).onDidChangeConfiguration =
        originalOnDidChangeConfiguration;
      changeEmitter.dispose();
    }
  });
});
