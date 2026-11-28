import * as assert from 'assert';
import type { AiCancellation } from '../ai/aiAssistant';
import type { PromptMessage } from '../ai/prompts';
import { buildEvidence } from './evidence';
import {
  AnalysisService,
  type AnalysisAiPort,
  type AnalysisCachePort,
  type AnalysisMetricsPort,
} from './analysisService';
import type { Analysis } from './types';

function fakeAi(replies: string[]): AnalysisAiPort & { calls: PromptMessage[][] } {
  const calls: PromptMessage[][] = [];
  let index = 0;
  return {
    calls,
    async complete(messages) {
      calls.push(messages);
      const reply = replies[Math.min(index, replies.length - 1)] ?? '';
      index += 1;
      return reply;
    },
  };
}

function fakeCache(): AnalysisCachePort & { entries: Map<string, Analysis> } {
  const entries = new Map<string, Analysis>();
  return {
    entries,
    get(itemKey, stateHash) {
      const stored = entries.get(itemKey);
      return stored?.stateHash === stateHash ? stored : undefined;
    },
    set(itemKey, analysis) {
      entries.set(itemKey, analysis);
    },
  };
}

function fakeMetrics(): AnalysisMetricsPort & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    log(line) {
      lines.push(line);
    },
  };
}

function validJson(overrides: Partial<Analysis> = {}): string {
  return JSON.stringify({
    itemKey: 'WEB-1',
    stateHash: 'hash-a',
    situation: 'CI failed',
    confidence: 'medium',
    actions: [{
      kind: 'fix-ci',
      title: 'Fix the failing test',
      evidence: ['check:test'],
      findings: [{ label: 'CancelBooking_NotOwner_Throws' }],
    }],
    ...overrides,
  });
}

function sampleEvidence() {
  return buildEvidence({
    checks: [{
      name: 'test',
      conclusion: 'failure',
      logExcerpt: 'Failed CancelBooking_NotOwner_Throws ghp_TESTONLYabcdefghijklmnopqrstuvwxyz12',
    }],
  });
}

function cancellable(requested = false): AiCancellation & { cancel(): void } {
  let isCancellationRequested = requested;
  const listeners: Array<() => unknown> = [];
  return {
    get isCancellationRequested() {
      return isCancellationRequested;
    },
    onCancellationRequested(listener) {
      listeners.push(listener);
      return { dispose() { /* no-op */ } };
    },
    cancel() {
      isCancellationRequested = true;
      for (const listener of listeners) listener();
    },
  };
}

suite('AnalysisService', () => {
  test('returnsCached_withoutCallingAi', async () => {
    const ai = fakeAi([validJson()]);
    const cache = fakeCache();
    const metrics = fakeMetrics();
    const analysis: Analysis = {
      itemKey: 'WEB-1',
      stateHash: 'hash-a',
      situation: 'cached',
      confidence: 'high',
      actions: [],
    };
    cache.set('WEB-1', analysis);
    const service = new AnalysisService({ ai, cache, metrics });

    const result = await service.run({
      itemKey: 'WEB-1',
      stateHash: 'hash-a',
      evidence: sampleEvidence(),
    });

    assert.strictEqual(result.status, 'cached');
    if (result.status === 'cached') {
      assert.strictEqual(result.analysis.situation, 'cached');
    }
    assert.strictEqual(ai.calls.length, 0);
    assert.ok(metrics.lines.some((line) => line.includes('cache hit')));
    assert.ok(metrics.lines.some((line) => line.includes('cacheHits=1')));
  });

  test('validFirstTry_cachesAndLogsPass', async () => {
    const ai = fakeAi([validJson()]);
    const cache = fakeCache();
    const metrics = fakeMetrics();
    const service = new AnalysisService({ ai, cache, metrics });

    const result = await service.run({
      itemKey: 'WEB-1',
      stateHash: 'hash-a',
      evidence: sampleEvidence(),
    });

    assert.strictEqual(result.status, 'ok');
    if (result.status === 'ok') {
      assert.strictEqual(result.firstTryValid, true);
      assert.strictEqual(result.analysis.actions[0]?.kind, 'fix-ci');
    }
    assert.strictEqual(ai.calls.length, 1);
    assert.ok(cache.get('WEB-1', 'hash-a'));
    assert.ok(metrics.lines.some((line) => line.includes('first-try ok')));
    assert.ok(metrics.lines.some((line) => line.includes('firstTryPass=1/1')));
  });

  test('retriesOnce_onInvalidThenSucceeds', async () => {
    const ai = fakeAi(['not json', validJson()]);
    const cache = fakeCache();
    const metrics = fakeMetrics();
    const service = new AnalysisService({ ai, cache, metrics });

    const result = await service.run({
      itemKey: 'WEB-1',
      stateHash: 'hash-a',
      evidence: sampleEvidence(),
    });

    assert.strictEqual(result.status, 'ok');
    if (result.status === 'ok') {
      assert.strictEqual(result.firstTryValid, false);
    }
    assert.strictEqual(ai.calls.length, 2);
    assert.ok(ai.calls[1][0].content.includes('Previous reply failed validation'));
    assert.ok(metrics.lines.some((line) => line.includes('retry ok')));
    assert.ok(metrics.lines.some((line) => line.includes('firstTryPass=0/1')));
  });

  test('unavailable_whenRetryAlsoFails', async () => {
    const ai = fakeAi(['nope', 'still nope']);
    const service = new AnalysisService({
      ai,
      cache: fakeCache(),
      metrics: fakeMetrics(),
    });

    const result = await service.run({
      itemKey: 'WEB-1',
      stateHash: 'hash-a',
      evidence: sampleEvidence(),
    });

    assert.strictEqual(result.status, 'unavailable');
    assert.strictEqual(ai.calls.length, 2);
  });

  test('redactsSecrets_inPromptIncludingLogExcerpts', async () => {
    const ai = fakeAi([validJson()]);
    const service = new AnalysisService({
      ai,
      cache: fakeCache(),
      metrics: fakeMetrics(),
    });

    await service.run({
      itemKey: 'WEB-1',
      stateHash: 'hash-a',
      evidence: sampleEvidence(),
    });

    const content = ai.calls[0][0].content;
    assert.ok(content.includes('[redacted]'));
    assert.ok(!content.includes('ghp_TESTONLYabcdefghijklmnopqrstuvwxyz12'));
  });

  test('runsOneAtATime', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const ai: AnalysisAiPort = {
      async complete(messages) {
        const itemKey = /itemKey: (\S+)/.exec(messages[0].content)?.[1] ?? '?';
        order.push(`start:${itemKey}`);
        if (itemKey === 'A') await firstGate;
        order.push(`end:${itemKey}`);
        return validJson({ itemKey, stateHash: itemKey === 'A' ? 'ha' : 'hb' });
      },
    };
    const service = new AnalysisService({
      ai,
      cache: fakeCache(),
      metrics: fakeMetrics(),
    });
    const evidence = sampleEvidence();

    const first = service.run({ itemKey: 'A', stateHash: 'ha', evidence });
    const second = service.run({ itemKey: 'B', stateHash: 'hb', evidence });
    await Promise.resolve();
    assert.deepStrictEqual(order, ['start:A']);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepStrictEqual(order, ['start:A', 'end:A', 'start:B', 'end:B']);
  });

  test('cancelledToken_skipsAi', async () => {
    const ai = fakeAi([validJson()]);
    const service = new AnalysisService({
      ai,
      cache: fakeCache(),
      metrics: fakeMetrics(),
    });
    const token = cancellable(true);

    const result = await service.run({
      itemKey: 'WEB-1',
      stateHash: 'hash-a',
      evidence: sampleEvidence(),
      token,
    });

    assert.strictEqual(result.status, 'cancelled');
    assert.strictEqual(ai.calls.length, 0);
  });
});
