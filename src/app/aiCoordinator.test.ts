import * as assert from 'assert';
import { AiCoordinator, type AiCoordinatorCiPorts } from './aiCoordinator';
import type { DashboardSession } from './dashboardSession';
import { AnalysisStore } from '../infrastructure/analysis/analysisStore';
import type { AiConfigStore } from '../infrastructure/ai/aiConfigStore';
import type { LanguageModelClient } from '../infrastructure/ai/languageModelClient';
import type { CursorCliClient } from '../infrastructure/ai/cursorCliClient';
import type { AttentionInboxItem } from '../services/attention/attentionInboxBuilder';
import type { PullRequestSummary } from '../shared/githubTypes';
import type { AnalysisView, HostEvent } from '../shared/messages';
import { analysisItemKey, computeInboxItemStateHash } from '../services/analysis/inboxEvidence';
import { AUTO_ANALYSIS_BACKOFF_MS } from '../services/analysis/planner';
import type { Analysis } from '../services/analysis/types';
import type { FailedJobLog, PullRequestCheckRun } from '../shared/githubTypes';

function makePr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    repoKey: 'acme/web',
    number: 42,
    title: 'Add retry',
    url: 'https://github.com/acme/web/pull/42',
    author: 'dev',
    state: 'OPEN',
    mergedAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-28T00:00:00Z',
    labels: [],
    checkStatus: 'FAILURE',
    checkConclusions: { test: 'failure' },
    headSha: 'aaa111',
    mergeable: 'MERGEABLE',
    reviews: [],
    comments: [],
    requestedReviewers: [],
    ...overrides,
  };
}

function makeItem(pr: PullRequestSummary): AttentionInboxItem {
  return {
    key: `${pr.repoKey}#${pr.number}`,
    pr,
    relatedPRs: [],
    reasons: ['pr-checks-failing'],
    priority: 1,
    latestRelevantAt: null,
    jiraUnreadCount: 0,
    jiraLatestUnreadComment: null,
    jiraLatestAwaitingComment: null,
    prUnreadCount: 0,
    prLatestUnreadComment: null,
    prLatestAwaitingComment: null,
  };
}

function memento(): {
  get<T>(key: string, fallback?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
} {
  const data: Record<string, unknown> = {};
  return {
    get<T>(key: string, fallback?: T): T | undefined {
      return key in data ? (data[key] as T) : fallback;
    },
    async update(key: string, value: unknown): Promise<void> {
      data[key] = value;
    },
  };
}

const FAILING_CHECK: PullRequestCheckRun = {
  name: 'test',
  status: 'completed',
  conclusion: 'failure',
  detailsUrl: 'https://github.com/acme/web/actions/runs/123456/job/7',
  summary: '2 tests failed',
};

function fakeCiPorts(): AiCoordinatorCiPorts & {
  checkRunCalls: number;
  logFetchCalls: string[];
} {
  const logFetchCalls: string[] = [];
  let checkRunCalls = 0;
  return {
    get checkRunCalls() {
      return checkRunCalls;
    },
    logFetchCalls,
    async getCheckRuns() {
      checkRunCalls += 1;
      return [FAILING_CHECK];
    },
    async getFailedJobLogs(_owner, _repo, runId) {
      logFetchCalls.push(runId);
      const logs: FailedJobLog[] = [{
        jobId: 7,
        jobName: 'test',
        content: 'Failed CancelBooking_NotOwner_Throws [4 ms]',
      }];
      return { ok: true as const, logs };
    },
    areCiLogsAvailable: () => true,
  };
}

function makeSession(
  item: AttentionInboxItem,
  options: {
    monitoringEnabled?: boolean;
    items?: AttentionInboxItem[] | null;
    logs?: string[];
  } = {},
): DashboardSession & { messages: HostEvent[]; logs: string[] } {
  const messages: HostEvent[] = [];
  const logs = options.logs ?? [];
  const items = options.items === undefined ? [item] : options.items;
  return {
    messages,
    logs,
    isMonitoringEnabled: () => options.monitoringEnabled !== false,
    notifyPaused: () => undefined,
    findItem: (key: string) => {
      const pool = items ?? [item];
      return pool.find((entry) => entry.key === key || analysisItemKey(entry) === key);
    },
    getInbox: () => ({
      items,
      snoozed: [],
      counts: { attention: items?.length ?? 0, myPrs: 0, teamPrs: 0, myJira: 0, snoozed: 0 },
    }),
    getGitHubState: () => ({ me: 'octocat' }),
    getJiraState: () => ({ currentUser: null }),
    broadcast: (message: HostEvent) => {
      messages.push(message);
    },
    log: (line: string) => {
      logs.push(line);
    },
    refreshSetupStatus: () => undefined,
  } as unknown as DashboardSession & { messages: HostEvent[]; logs: string[] };
}

function makeConfig(overrides: {
  provider?: 'vscodeLm' | 'none';
  analysisAuto?: boolean;
  maxAutoPerRefresh?: number;
  model?: string | undefined;
} = {}): AiConfigStore {
  const provider = overrides.provider ?? 'vscodeLm';
  const model = overrides.model === undefined && !('model' in overrides) ? 'm1' : overrides.model;
  return {
    read: () => ({ provider, model }),
    getProvider: () => provider,
    getModel: () => model,
    getReviewPrompt: () => undefined,
    getAnalysisIncludeCiLogs: () => true,
    getAnalysisAuto: () => overrides.analysisAuto !== false,
    getAnalysisMaxAutoPerRefresh: () => overrides.maxAutoPerRefresh ?? 3,
  } as unknown as AiConfigStore;
}

function analysisJson(itemKey: string, stateHash: string, situation: string): string {
  return JSON.stringify({
    itemKey,
    stateHash,
    situation,
    confidence: 'medium',
    actions: [{
      kind: 'fix-ci',
      title: 'Fix the failing test',
      evidence: ['check:test'],
      findings: [{ label: 'CancelBooking_NotOwner_Throws' }],
    }],
  });
}

function fakeLm(replies: string[]): LanguageModelClient {
  let index = 0;
  return {
    listModels: async () => [{ id: 'm1', name: 'Model', vendor: 'test', family: 'test', maxInputTokens: 1 }],
    sendRequest: async () => {
      const reply = replies[Math.min(index, replies.length - 1)] ?? '';
      index += 1;
      return reply;
    },
  } as unknown as LanguageModelClient;
}

/** LM that holds each sendRequest until release(); cancel rejects so AnalysisService returns cancelled. */
function gatedLm(): {
  client: LanguageModelClient;
  waitForCall(): Promise<void>;
  release(reply: string): void;
  readonly callCount: number;
} {
  let callCount = 0;
  let notifyCall: (() => void) | undefined;
  let pending: {
    resolve: (value: string) => void;
    reject: (error: unknown) => void;
    dispose?: { dispose(): void };
  } | undefined;

  return {
    get callCount() {
      return callCount;
    },
    waitForCall(): Promise<void> {
      if (pending) return Promise.resolve();
      return new Promise<void>((resolve) => {
        notifyCall = resolve;
      });
    },
    release(reply: string) {
      if (!pending) throw new Error('gatedLm: no pending call to release');
      pending.dispose?.dispose();
      const { resolve } = pending;
      pending = undefined;
      resolve(reply);
    },
    client: {
      listModels: async () => [{ id: 'm1', name: 'Model', vendor: 'test', family: 'test', maxInputTokens: 1 }],
      sendRequest: async (
        _modelId: string,
        _messages: unknown,
        _onText: (chunk: string) => void,
        token?: { onCancellationRequested(listener: () => unknown): { dispose(): void } },
      ) => {
        callCount += 1;
        const notify = notifyCall;
        notifyCall = undefined;
        notify?.();
        return new Promise<string>((resolve, reject) => {
          const link = token?.onCancellationRequested(() => {
            if (!pending || pending.resolve !== resolve) return;
            pending.dispose?.dispose();
            pending = undefined;
            reject(new Error('Cancelled'));
          });
          pending = { resolve, reject, dispose: link };
        });
      },
    } as unknown as LanguageModelClient,
  };
}

function lastResult(session: { messages: HostEvent[] }): AnalysisView {
  const result = [...session.messages].reverse().find((message) => message.command === 'analysis.result');
  assert.ok(result);
  assert.strictEqual(result!.command, 'analysis.result');
  if (result!.command !== 'analysis.result') {
    throw new Error('expected analysis.result');
  }
  return result.analysis;
}

suite('AiCoordinator.runAnalysis cache', () => {
  let coordinator: AiCoordinator | undefined;

  teardown(() => {
    coordinator?.dispose();
    coordinator = undefined;
  });

  test('cacheHit_skipsCheckRunsAndJobLogs', async () => {
    const item = makeItem(makePr());
    const itemKey = analysisItemKey(item);
    const stateHash = computeInboxItemStateHash(item);
    const cache = new AnalysisStore(memento());
    const cached: Analysis = {
      itemKey,
      stateHash,
      situation: 'from cache',
      confidence: 'medium',
      actions: [],
    };
    const cachedView: AnalysisView = {
      itemKey,
      stateHash,
      situation: 'from cache',
      confidence: 'medium',
      analyzedAt: '2026-11-01T12:00:00.000Z',
      actions: [],
    };
    await cache.set(itemKey, cached);
    await cache.setView(itemKey, stateHash, cachedView);

    const session = makeSession(item);
    const ci = fakeCiPorts();
    let authCalls = 0;
    coordinator = new AiCoordinator(
      session,
      makeConfig(),
      {} as LanguageModelClient,
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      {
        auth: {
          getSession: async () => {
            authCalls += 1;
            return { username: 'octocat', accessToken: 'secret' };
          },
        } as never,
        mcp: {} as never,
      },
      undefined,
      ci,
    );

    await coordinator.runAnalysis(item.key);

    assert.strictEqual(ci.checkRunCalls, 0);
    assert.deepStrictEqual(ci.logFetchCalls, []);
    assert.strictEqual(authCalls, 0);
    const result = lastResult(session);
    assert.strictEqual(result.situation, 'from cache');
    assert.strictEqual(result.analyzedAt, '2026-11-01T12:00:00.000Z');
  });

  test('force_fetchesCheckRunsAndJobLogs', async () => {
    const item = makeItem(makePr());
    const itemKey = analysisItemKey(item);
    const stateHash = computeInboxItemStateHash(item);
    const cache = new AnalysisStore(memento());
    await cache.set(itemKey, {
      itemKey,
      stateHash,
      situation: 'from cache',
      confidence: 'medium',
      actions: [],
    });
    await cache.setView(itemKey, stateHash, {
      itemKey,
      stateHash,
      situation: 'from cache',
      confidence: 'medium',
      analyzedAt: '2026-11-01T12:00:00.000Z',
      actions: [],
    });

    const session = makeSession(item);
    const ci = fakeCiPorts();
    coordinator = new AiCoordinator(
      session,
      makeConfig(),
      {
        sendRequest: async () => {
          throw new Error('ai not needed for this assertion');
        },
        listModels: async () => [{ id: 'm1', name: 'Model', vendor: 'test', family: 'test', maxInputTokens: 1 }],
      } as unknown as LanguageModelClient,
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      {
        auth: {
          getSession: async () => ({ username: 'octocat', accessToken: 'secret' }),
        } as never,
        mcp: {} as never,
      },
      undefined,
      ci,
    );

    await coordinator.runAnalysis(item.key, true);

    assert.strictEqual(ci.checkRunCalls, 1);
    assert.deepStrictEqual(ci.logFetchCalls, ['123456']);
  });

  test('cacheHit_preservesHandoffLinkAndAnalyzedAt_forceReplacesView', async () => {
    const item = makeItem(makePr());
    const itemKey = analysisItemKey(item);
    const stateHash = computeInboxItemStateHash(item);
    const cache = new AnalysisStore(memento());
    const session = makeSession(item);
    const ci = fakeCiPorts();
    const lm = fakeLm([
      analysisJson(itemKey, stateHash, 'first analysis'),
      analysisJson(itemKey, stateHash, 'forced analysis'),
    ]);

    coordinator = new AiCoordinator(
      session,
      makeConfig(),
      lm,
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      {
        auth: {
          getSession: async () => ({ username: 'octocat', accessToken: 'secret' }),
        } as never,
        mcp: {} as never,
      },
      undefined,
      ci,
    );

    await coordinator.runAnalysis(item.key);
    const first = lastResult(session);
    const firstAction = first.actions[0];
    assert.ok(firstAction);
    assert.ok(firstAction.handoffPrompt?.includes('CancelBooking_NotOwner_Throws'));
    assert.ok(firstAction.handoffPrompt?.includes('Failing check: test'));
    assert.strictEqual(firstAction.link, FAILING_CHECK.detailsUrl);
    assert.ok(first.analyzedAt);

    session.messages.length = 0;
    await coordinator.runAnalysis(item.key);
    const second = lastResult(session);
    assert.strictEqual(ci.checkRunCalls, 1);
    assert.strictEqual(second.analyzedAt, first.analyzedAt);
    assert.strictEqual(second.actions[0]?.handoffPrompt, firstAction.handoffPrompt);
    assert.strictEqual(second.actions[0]?.link, firstAction.link);
    assert.strictEqual(second.situation, 'first analysis');

    session.messages.length = 0;
    await coordinator.runAnalysis(item.key, true);
    const forced = lastResult(session);
    assert.strictEqual(ci.checkRunCalls, 2);
    assert.strictEqual(forced.situation, 'forced analysis');
    assert.ok(forced.actions[0]?.handoffPrompt?.includes('CancelBooking_NotOwner_Throws'));
    assert.strictEqual(forced.actions[0]?.link, FAILING_CHECK.detailsUrl);
    assert.notStrictEqual(forced.actions[0]?.handoffPrompt, undefined);
    assert.strictEqual(cache.getView(itemKey, stateHash)?.situation, 'forced analysis');
  });
});

suite('AiCoordinator.automaticAnalysis', () => {
  let coordinator: AiCoordinator | undefined;

  teardown(() => {
    coordinator?.dispose();
    coordinator = undefined;
  });

  test('onInboxRecomputed_runsPlannedItems_withoutAnalyzingFlicker', async () => {
    const item = makeItem(makePr());
    const itemKey = analysisItemKey(item);
    const stateHash = computeInboxItemStateHash(item);
    const session = makeSession(item);
    const cache = new AnalysisStore(memento());
    const ci = fakeCiPorts();
    coordinator = new AiCoordinator(
      session,
      makeConfig(),
      fakeLm([analysisJson(itemKey, stateHash, 'auto analysis')]),
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      {
        auth: {
          getSession: async () => ({ username: 'octocat', accessToken: 'secret' }),
        } as never,
        mcp: {} as never,
      },
      undefined,
      ci,
    );

    await coordinator.onInboxRecomputed();

    assert.ok(session.logs.some((line) => line === '[analysis] auto: planned 1, ran 1'));
    assert.strictEqual(
      session.messages.some((message) => message.command === 'analysis.analyzing'),
      false,
    );
    const result = lastResult(session);
    assert.strictEqual(result.situation, 'auto analysis');
    assert.strictEqual(cache.getView(itemKey, stateHash)?.situation, 'auto analysis');
  });

  test('skipsWhenAutoDisabledOrAiOffOrMonitoringPausedOrNoModel', async () => {
    const item = makeItem(makePr());
    const cache = new AnalysisStore(memento());

    const offSession = makeSession(item);
    coordinator = new AiCoordinator(
      offSession,
      makeConfig({ analysisAuto: false }),
      fakeLm([]),
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      { auth: { getSession: async () => null } as never, mcp: {} as never },
      undefined,
      fakeCiPorts(),
    );
    await coordinator.onInboxRecomputed();
    assert.deepStrictEqual(offSession.logs, []);
    coordinator.dispose();

    const pausedSession = makeSession(item, { monitoringEnabled: false });
    coordinator = new AiCoordinator(
      pausedSession,
      makeConfig(),
      fakeLm([]),
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      { auth: { getSession: async () => null } as never, mcp: {} as never },
      undefined,
      fakeCiPorts(),
    );
    await coordinator.onInboxRecomputed();
    assert.deepStrictEqual(pausedSession.logs, []);
    coordinator.dispose();

    const aiOffSession = makeSession(item);
    coordinator = new AiCoordinator(
      aiOffSession,
      makeConfig({ provider: 'none' }),
      fakeLm([]),
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      { auth: { getSession: async () => null } as never, mcp: {} as never },
      undefined,
      fakeCiPorts(),
    );
    await coordinator.onInboxRecomputed();
    assert.deepStrictEqual(aiOffSession.logs, []);
    coordinator.dispose();

    const noModelSession = makeSession(item);
    coordinator = new AiCoordinator(
      noModelSession,
      makeConfig({ model: undefined }),
      fakeLm([]),
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      { auth: { getSession: async () => null } as never, mcp: {} as never },
      undefined,
      fakeCiPorts(),
    );
    await coordinator.onInboxRecomputed();
    assert.deepStrictEqual(noModelSession.logs, []);
  });

  test('onInboxRecomputed_publishesReadyAndStaleSnapshot', async () => {
    const readyItem = makeItem(makePr({ number: 1, headSha: 'ready-sha' }));
    readyItem.key = 'acme/web#1';
    readyItem.reasons = ['pr-checks-failing'];
    readyItem.priority = 1;
    const staleItem = makeItem(makePr({ number: 2, headSha: 'new-sha', checkStatus: 'FAILURE' }));
    staleItem.key = 'acme/web#2';
    staleItem.reasons = ['pr-checks-failing'];
    staleItem.priority = 1;

    const cache = new AnalysisStore(memento());
    const readyKey = analysisItemKey(readyItem);
    const readyHash = computeInboxItemStateHash(readyItem);
    await cache.set(readyKey, {
      itemKey: readyKey,
      stateHash: readyHash,
      situation: 'ready view',
      confidence: 'medium',
      actions: [],
    });
    await cache.setView(readyKey, readyHash, {
      itemKey: readyKey,
      stateHash: readyHash,
      situation: 'ready view',
      confidence: 'medium',
      analyzedAt: '2026-11-01T12:00:00.000Z',
      actions: [],
    });

    const staleKey = analysisItemKey(staleItem);
    await cache.set(staleKey, {
      itemKey: staleKey,
      stateHash: 'old-hash',
      situation: 'stale view',
      confidence: 'medium',
      actions: [],
    });
    await cache.setView(staleKey, 'old-hash', {
      itemKey: staleKey,
      stateHash: 'old-hash',
      situation: 'stale view',
      confidence: 'medium',
      analyzedAt: '2026-11-01T12:00:00.000Z',
      actions: [],
    });

    const session = makeSession(readyItem, { items: [readyItem, staleItem] });
    coordinator = new AiCoordinator(
      session,
      makeConfig({ maxAutoPerRefresh: 0 }),
      fakeLm([]),
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      { auth: { getSession: async () => null } as never, mcp: {} as never },
      undefined,
      fakeCiPorts(),
    );

    await coordinator.onInboxRecomputed();
    const snapshot = [...session.messages].reverse().find((message) => message.command === 'analysis.snapshot');
    assert.ok(snapshot);
    assert.strictEqual(snapshot!.command, 'analysis.snapshot');
    if (snapshot!.command !== 'analysis.snapshot') throw new Error('expected snapshot');
    assert.strictEqual(snapshot.entries[readyItem.key]?.status, 'ready');
    assert.strictEqual(snapshot.entries[readyItem.key]?.analysis.situation, 'ready view');
    assert.ok(snapshot.entries[readyItem.key]?.actionStatus);
    assert.strictEqual(snapshot.entries[staleItem.key]?.status, 'stale');
    assert.strictEqual(snapshot.entries[staleItem.key]?.analysis.situation, 'stale view');
    assert.ok(snapshot.entries[staleItem.key]?.actionStatus);
  });

  test('skipsCachedItems_andLogsPlannedZero', async () => {
    const item = makeItem(makePr());
    const itemKey = analysisItemKey(item);
    const stateHash = computeInboxItemStateHash(item);
    const cache = new AnalysisStore(memento());
    await cache.set(itemKey, {
      itemKey,
      stateHash,
      situation: 'cached',
      confidence: 'medium',
      actions: [],
    });
    await cache.setView(itemKey, stateHash, {
      itemKey,
      stateHash,
      situation: 'cached',
      confidence: 'medium',
      analyzedAt: '2026-11-01T12:00:00.000Z',
      actions: [],
    });
    const session = makeSession(item);
    const ci = fakeCiPorts();
    coordinator = new AiCoordinator(
      session,
      makeConfig(),
      fakeLm([]),
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      { auth: { getSession: async () => null } as never, mcp: {} as never },
      undefined,
      ci,
    );

    await coordinator.onInboxRecomputed();

    assert.ok(session.logs.some((line) => line === '[analysis] auto: planned 0, ran 0'));
    assert.strictEqual(ci.checkRunCalls, 0);
  });

  test('queuedRerun_runsOneMorePassWhenRefreshArrivesMidBatch', async () => {
    const item1 = makeItem(makePr({ number: 1, headSha: 'sha1' }));
    item1.key = 'acme/web#1';
    const item2 = makeItem(makePr({ number: 2, headSha: 'sha2' }));
    item2.key = 'acme/web#2';
    const key1 = analysisItemKey(item1);
    const key2 = analysisItemKey(item2);
    const hash1 = computeInboxItemStateHash(item1);
    const hash2 = computeInboxItemStateHash(item2);
    const session = makeSession(item1, { items: [item1, item2] });
    const cache = new AnalysisStore(memento());
    const gated = gatedLm();
    coordinator = new AiCoordinator(
      session,
      makeConfig({ maxAutoPerRefresh: 1 }),
      gated.client,
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      {
        auth: {
          getSession: async () => ({ username: 'octocat', accessToken: 'secret' }),
        } as never,
        mcp: {} as never,
      },
      undefined,
      fakeCiPorts(),
    );

    const batch = coordinator.onInboxRecomputed();
    await gated.waitForCall();
    void coordinator.onInboxRecomputed();
    gated.release(analysisJson(key1, hash1, 'auto-1'));
    await gated.waitForCall();
    gated.release(analysisJson(key2, hash2, 'auto-2'));
    await batch;

    const autoLogs = session.logs.filter((line) => line.startsWith('[analysis] auto:'));
    assert.deepStrictEqual(autoLogs, [
      '[analysis] auto: planned 1, ran 1',
      '[analysis] auto: planned 1, ran 1',
    ]);
    assert.strictEqual(cache.getView(key1, hash1)?.situation, 'auto-1');
    assert.strictEqual(cache.getView(key2, hash2)?.situation, 'auto-2');
  });

  test('userAnalyze_cancelsInFlightAutoBatch', async () => {
    const item = makeItem(makePr());
    const itemKey = analysisItemKey(item);
    const stateHash = computeInboxItemStateHash(item);
    const session = makeSession(item);
    const cache = new AnalysisStore(memento());
    const gated = gatedLm();
    coordinator = new AiCoordinator(
      session,
      makeConfig(),
      gated.client,
      {} as CursorCliClient,
      cache,
      { revealDashboard: () => undefined, revealSetup: () => undefined },
      {
        auth: {
          getSession: async () => ({ username: 'octocat', accessToken: 'secret' }),
        } as never,
        mcp: {} as never,
      },
      undefined,
      fakeCiPorts(),
    );

    const auto = coordinator.onInboxRecomputed();
    await gated.waitForCall();
    const user = coordinator.runAnalysis(item.key);
    await gated.waitForCall();
    gated.release(analysisJson(itemKey, stateHash, 'user analysis'));
    await Promise.all([auto, user]);

    assert.ok(session.logs.some((line) => line === '[analysis] auto: planned 1, ran 0'));
    assert.strictEqual(cache.getView(itemKey, stateHash)?.situation, 'user analysis');
    assert.ok(session.messages.some((message) => message.command === 'analysis.analyzing'));
  });

  test('backoff_skipsFailedItemUntilWindowPasses', async () => {
    const item = makeItem(makePr());
    const itemKey = analysisItemKey(item);
    const stateHash = computeInboxItemStateHash(item);
    const session = makeSession(item);
    const cache = new AnalysisStore(memento());
    const realNow = Date.now;
    let now = 1_700_000_000_000;
    Date.now = () => now;
    try {
      coordinator = new AiCoordinator(
        session,
        makeConfig(),
        fakeLm(['not-json', 'still-bad', analysisJson(itemKey, stateHash, 'after backoff')]),
        {} as CursorCliClient,
        cache,
        { revealDashboard: () => undefined, revealSetup: () => undefined },
        {
          auth: {
            getSession: async () => ({ username: 'octocat', accessToken: 'secret' }),
          } as never,
          mcp: {} as never,
        },
        undefined,
        fakeCiPorts(),
      );

      await coordinator.onInboxRecomputed();
      assert.ok(session.logs.some((line) => line === '[analysis] auto: planned 1, ran 0'));
      assert.strictEqual(cache.getView(itemKey, stateHash), undefined);

      session.logs.length = 0;
      await coordinator.onInboxRecomputed();
      assert.ok(session.logs.some((line) => line === '[analysis] auto: planned 0, ran 0'));

      now += AUTO_ANALYSIS_BACKOFF_MS;
      session.logs.length = 0;
      await coordinator.onInboxRecomputed();
      assert.ok(session.logs.some((line) => line === '[analysis] auto: planned 1, ran 1'));
      assert.strictEqual(cache.getView(itemKey, stateHash)?.situation, 'after backoff');
    } finally {
      Date.now = realNow;
    }
  });
});
