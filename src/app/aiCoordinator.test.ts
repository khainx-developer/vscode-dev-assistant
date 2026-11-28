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

function makeSession(item: AttentionInboxItem): DashboardSession & { messages: HostEvent[] } {
  const messages: HostEvent[] = [];
  return {
    messages,
    isMonitoringEnabled: () => true,
    notifyPaused: () => undefined,
    findItem: (key: string) => (key === item.key || key === analysisItemKey(item) ? item : undefined),
    broadcast: (message: HostEvent) => {
      messages.push(message);
    },
    log: () => undefined,
    refreshSetupStatus: () => undefined,
  } as unknown as DashboardSession & { messages: HostEvent[] };
}

function makeConfig(): AiConfigStore {
  return {
    read: () => ({ provider: 'vscodeLm', model: undefined }),
    getProvider: () => 'vscodeLm',
    getModel: () => undefined,
    getReviewPrompt: () => undefined,
    getAnalysisIncludeCiLogs: () => true,
    getAnalysisAuto: () => true,
    getAnalysisMaxAutoPerRefresh: () => 3,
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
