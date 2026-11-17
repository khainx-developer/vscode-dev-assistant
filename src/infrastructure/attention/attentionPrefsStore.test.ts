import * as assert from 'assert';
import { AttentionPrefsStore } from './attentionPrefsStore';

function memento(): { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): Promise<void>; data: Record<string, unknown> } {
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

suite('AttentionPrefsStore', () => {
  test('snooze_persists_andExpiredEntriesArePruned', async () => {
    const storage = memento();
    const store = new AttentionPrefsStore(storage);
    await store.snooze('a', 2000, 1000);
    await store.snooze('b', 1500, 1000);
    assert.deepStrictEqual(store.getSnoozes(1000), { a: 2000, b: 1500 });
    assert.deepStrictEqual(store.getSnoozes(1600), { a: 2000 });
    // Writing after expiry drops stale entries from storage too.
    await store.snooze('c', 5000, 1600);
    assert.deepStrictEqual(storage.data['devMateKit.attention.snoozes'], { a: 2000, c: 5000 });
  });

  test('unsnooze_removesEntry', async () => {
    const store = new AttentionPrefsStore(memento());
    await store.snooze('a', 2000, 1000);
    await store.unsnooze('a', 1000);
    assert.deepStrictEqual(store.getSnoozes(1000), {});
  });

  test('knownItems_nullUntilBaselined', async () => {
    const store = new AttentionPrefsStore(memento());
    assert.strictEqual(store.getKnownItems(), null);
    await store.setKnownItems({ a: 1 });
    assert.deepStrictEqual(store.getKnownItems(), { a: 1 });
  });

  test('corruptStorage_isIgnored', () => {
    const storage = memento();
    storage.data['devMateKit.attention.snoozes'] = 'oops';
    storage.data['devMateKit.attention.knownItems'] = ['oops'];
    const store = new AttentionPrefsStore(storage);
    assert.deepStrictEqual(store.getSnoozes(0), {});
    assert.strictEqual(store.getKnownItems(), null);
  });
});
