import * as assert from 'assert';
import { AnalysisStore } from './analysisStore';
import type { Analysis } from '../../services/analysis/types';

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

suite('AnalysisStore', () => {
  test('get_returnsEntry_whenItemAndStateHashMatch', async () => {
    let now = 1_000;
    const store = new AnalysisStore(memento(), () => now);
    await store.set('WEB-1', analysis('WEB-1', 'hash-a', 'ci'));
    assert.strictEqual(store.get('WEB-1', 'hash-a')?.situation, 'ci');
    assert.strictEqual(store.get('WEB-1', 'hash-b'), undefined);
    assert.strictEqual(store.get('WEB-2', 'hash-a'), undefined);
    now = 1_000;
  });

  test('set_overwritesSameItem_keepingLatestStateHash', async () => {
    const store = new AnalysisStore(memento(), () => 1_000);
    await store.set('WEB-1', analysis('WEB-1', 'hash-a', 'old'));
    await store.set('WEB-1', analysis('WEB-1', 'hash-b', 'new'));
    assert.strictEqual(store.get('WEB-1', 'hash-a'), undefined);
    assert.strictEqual(store.get('WEB-1', 'hash-b')?.situation, 'new');
  });

  test('expiresAfter14Days', async () => {
    let now = 0;
    const store = new AnalysisStore(memento(), () => now);
    await store.set('WEB-1', analysis('WEB-1', 'hash-a'));
    now = 14 * 24 * 60 * 60 * 1000 + 1;
    assert.strictEqual(store.get('WEB-1', 'hash-a'), undefined);
  });

  test('evictsOldest_whenOver200', async () => {
    let now = 0;
    const storage = memento();
    const store = new AnalysisStore(storage, () => now);
    for (let i = 0; i < 201; i += 1) {
      now = i + 1;
      await store.set(`ITEM-${i}`, analysis(`ITEM-${i}`, 'h'));
    }
    assert.strictEqual(store.get('ITEM-0', 'h'), undefined);
    assert.ok(store.get('ITEM-200', 'h'));
    const record = storage.data['devMateKit.analysis.cache.v1'] as { entries: Record<string, unknown> };
    assert.strictEqual(Object.keys(record.entries).length, 200);
  });

  test('clear_removesAllEntries', async () => {
    const store = new AnalysisStore(memento(), () => 1);
    await store.set('WEB-1', analysis('WEB-1', 'h'));
    await store.clear();
    assert.strictEqual(store.get('WEB-1', 'h'), undefined);
  });

  test('corruptStorage_isIgnored', () => {
    const storage = memento();
    storage.data['devMateKit.analysis.cache.v1'] = 'oops';
    const store = new AnalysisStore(storage, () => 1);
    assert.strictEqual(store.get('WEB-1', 'h'), undefined);
  });
});
