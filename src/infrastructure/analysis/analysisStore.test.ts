import * as assert from 'assert';
import { AnalysisStore } from './analysisStore';
import type { Analysis } from '../../services/analysis/types';
import type { AnalysisView } from '../../shared/messages';

function memento(): {
  get<T>(key: string, fallback?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = {};
  return {
    data,
    get<T>(key: string, fallback?: T): T | undefined {
      return key in data ? (data[key] as T) : fallback;
    },
    async update(key: string, value: unknown): Promise<void> {
      data[key] = value;
    },
  };
}

function analysis(itemKey: string, stateHash: string, situation = 'ok'): Analysis {
  return {
    itemKey,
    stateHash,
    situation,
    confidence: 'high',
    actions: [],
  };
}

function viewFor(itemKey: string, stateHash: string, situation = 'ok'): AnalysisView {
  return {
    itemKey,
    stateHash,
    situation,
    confidence: 'high',
    analyzedAt: '2026-11-28T10:00:00.000Z',
    actions: [{
      kind: 'fix-ci',
      actionKey: 'fix-ci:check:test',
      title: 'Fix the failing test',
      link: 'https://github.com/acme/web/actions/runs/123/job/1',
      openLabel: 'Open check',
      handoffPrompt: 'Failing check: test\nFailed CancelBooking_NotOwner_Throws',
    }],
  };
}

async function setWithView(
  store: AnalysisStore,
  itemKey: string,
  stateHash: string,
  situation = 'ok',
): Promise<AnalysisView> {
  const stored = analysis(itemKey, stateHash, situation);
  const view = viewFor(itemKey, stateHash, situation);
  await store.set(itemKey, stored);
  await store.setView(itemKey, stateHash, view);
  return view;
}

suite('AnalysisStore', () => {
  test('get_returnsEntry_whenItemAndStateHashMatch', async () => {
    let now = 1_000;
    const store = new AnalysisStore(memento(), () => now);
    await setWithView(store, 'WEB-1', 'hash-a', 'ci');
    assert.strictEqual(store.get('WEB-1', 'hash-a')?.situation, 'ci');
    assert.strictEqual(store.get('WEB-1', 'hash-b'), undefined);
    assert.strictEqual(store.get('WEB-2', 'hash-a'), undefined);
    now = 1_000;
  });

  test('set_overwritesSameItem_keepingLatestStateHash', async () => {
    const store = new AnalysisStore(memento(), () => 1_000);
    await setWithView(store, 'WEB-1', 'hash-a', 'old');
    await setWithView(store, 'WEB-1', 'hash-b', 'new');
    assert.strictEqual(store.get('WEB-1', 'hash-a'), undefined);
    assert.strictEqual(store.get('WEB-1', 'hash-b')?.situation, 'new');
  });

  test('view_roundTrips_viaSetView', async () => {
    const store = new AnalysisStore(memento(), () => 1_000);
    const view = await setWithView(store, 'WEB-1', 'hash-a', 'ci');
    assert.deepStrictEqual(store.getView('WEB-1', 'hash-a'), view);
  });

  test('peekView_returnsView_evenWhenStateHashDiffers', async () => {
    const store = new AnalysisStore(memento(), () => 1_000);
    const view = await setWithView(store, 'WEB-1', 'hash-a', 'ci');
    assert.deepStrictEqual(store.peekView('WEB-1'), view);
    assert.strictEqual(store.getView('WEB-1', 'hash-b'), undefined);
    assert.strictEqual(store.peekView('WEB-missing'), undefined);
  });

  test('setView_storesStateSnapshot', async () => {
    const store = new AnalysisStore(memento(), () => 1_000);
    await store.set('WEB-1', analysis('WEB-1', 'hash-a'));
    const view = viewFor('WEB-1', 'hash-a');
    const stateSnapshot = {
      itemKey: 'WEB-1',
      headSha: 'abc',
      latestCommentIds: ['c1'],
      unresolvedThreadCount: 1,
      reviewState: 'changes_requested',
      checkConclusions: { test: 'FAILURE' },
      jiraStatus: null,
    };
    await store.setView('WEB-1', 'hash-a', view, stateSnapshot);
    assert.deepStrictEqual(store.peekStateSnapshot('WEB-1'), stateSnapshot);
  });

  test('manualDoneMarks_surviveAndExpireAfter14Days', async () => {
    let now = 1_000;
    const store = new AnalysisStore(memento(), () => now);
    await store.markDone('WEB-1', 'fix-ci:check:test');
    assert.strictEqual(store.isManuallyDone('WEB-1', 'fix-ci:check:test'), true);
    assert.deepStrictEqual([...store.manualDoneActionKeys('WEB-1')], ['fix-ci:check:test']);

    await store.unmarkDone('WEB-1', 'fix-ci:check:test');
    assert.strictEqual(store.isManuallyDone('WEB-1', 'fix-ci:check:test'), false);

    await store.markDone('WEB-1', 'decide:');
    now = 1_000 + 14 * 24 * 60 * 60 * 1000 + 1;
    assert.strictEqual(store.isManuallyDone('WEB-1', 'decide:'), false);
    assert.deepStrictEqual([...store.manualDoneActionKeys('WEB-1')], []);
  });

  test('entryWithoutView_isMiss', async () => {
    const store = new AnalysisStore(memento(), () => 1_000);
    await store.set('WEB-1', analysis('WEB-1', 'hash-a'));
    assert.strictEqual(store.get('WEB-1', 'hash-a'), undefined);
    assert.strictEqual(store.getView('WEB-1', 'hash-a'), undefined);
  });

  test('expiresAfter14Days', async () => {
    let now = 0;
    const store = new AnalysisStore(memento(), () => now);
    await setWithView(store, 'WEB-1', 'hash-a');
    now = 14 * 24 * 60 * 60 * 1000 + 1;
    assert.strictEqual(store.get('WEB-1', 'hash-a'), undefined);
    assert.strictEqual(store.getView('WEB-1', 'hash-a'), undefined);
  });

  test('evictsOldest_whenOver200', async () => {
    let now = 0;
    const storage = memento();
    const store = new AnalysisStore(storage, () => now);
    for (let i = 0; i < 201; i += 1) {
      now = i + 1;
      await setWithView(store, `ITEM-${i}`, 'h');
    }
    assert.strictEqual(store.get('ITEM-0', 'h'), undefined);
    assert.ok(store.get('ITEM-200', 'h'));
    const record = storage.data['devMateKit.analysis.cache.v4'] as { entries: Record<string, unknown> };
    assert.strictEqual(Object.keys(record.entries).length, 200);
  });

  test('clear_removesAllEntries', async () => {
    const store = new AnalysisStore(memento(), () => 1);
    await setWithView(store, 'WEB-1', 'h');
    await store.clear();
    assert.strictEqual(store.get('WEB-1', 'h'), undefined);
    assert.strictEqual(store.getView('WEB-1', 'h'), undefined);
  });

  test('corruptStorage_isIgnored', () => {
    const storage = memento();
    storage.data['devMateKit.analysis.cache.v3'] = 'oops';
    const store = new AnalysisStore(storage, () => 1);
    assert.strictEqual(store.get('WEB-1', 'h'), undefined);
  });
});
