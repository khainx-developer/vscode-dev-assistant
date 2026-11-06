import * as assert from 'assert';
import * as vscode from 'vscode';
import { LastSeenStore, prKey } from './lastSeenStore';

function createFakeContext(): { context: vscode.ExtensionContext; setKeysForSyncCalls: unknown[][] } {
  let store: Record<string, number> = {};
  const setKeysForSyncCalls: unknown[][] = [];

  const globalState = {
    get: <T>(_key: string, defaultValue?: T) => (store as unknown as T) ?? defaultValue,
    update: (_key: string, value: Record<string, number>) => {
      store = value;
      return Promise.resolve();
    },
    setKeysForSync: (keys: readonly string[]) => {
      setKeysForSyncCalls.push([keys]);
    },
    keys: () => Object.keys(store),
  };

  const context = { globalState } as unknown as vscode.ExtensionContext;
  return { context, setKeysForSyncCalls };
}

suite('LastSeenStore', () => {
  test('LastSeenStore_get_returnsUndefined_whenNeverSeen', () => {
    const { context } = createFakeContext();
    const store = new LastSeenStore(context);

    assert.strictEqual(store.get(prKey('owner/repo', 1)), undefined);
  });

  test('LastSeenStore_markSeen_storesProvidedTimestamp', () => {
    const { context } = createFakeContext();
    const store = new LastSeenStore(context);
    const key = prKey('owner/repo', 1);

    store.markSeen(key, 12345);

    assert.strictEqual(store.get(key), 12345);
  });

  test('LastSeenStore_markSeen_defaultsToNow_whenNoTimestampGiven', () => {
    const { context } = createFakeContext();
    const store = new LastSeenStore(context);
    const key = prKey('owner/repo', 1);

    const before = Date.now();
    store.markSeen(key);
    const after = Date.now();

    const seen = store.get(key);
    assert.ok(seen !== undefined && seen >= before && seen <= after);
  });

  test('LastSeenStore_ensureBaseline_setsNow_whenNeverSeen', () => {
    const { context } = createFakeContext();
    const store = new LastSeenStore(context);
    const key = prKey('owner/repo', 1);

    const before = Date.now();
    store.ensureBaseline(key);
    const after = Date.now();

    const seen = store.get(key);
    assert.ok(seen !== undefined && seen >= before && seen <= after);
  });

  test('LastSeenStore_ensureBaseline_doesNotOverwrite_whenAlreadySeen', () => {
    const { context } = createFakeContext();
    const store = new LastSeenStore(context);
    const key = prKey('owner/repo', 1);

    store.markSeen(key, 111);
    store.ensureBaseline(key);

    assert.strictEqual(store.get(key), 111);
  });

  test('LastSeenStore_getAll_returnsAllStoredEntries', () => {
    const { context } = createFakeContext();
    const store = new LastSeenStore(context);
    const keyA = prKey('owner/repo', 1);
    const keyB = prKey('owner/repo', 2);

    store.markSeen(keyA, 111);
    store.markSeen(keyB, 222);

    assert.deepStrictEqual(store.getAll(), new Map([[keyA, 111], [keyB, 222]]));
  });

  test('LastSeenStore_neverCallsSetKeysForSync', () => {
    const { context, setKeysForSyncCalls } = createFakeContext();
    const store = new LastSeenStore(context);
    const key = prKey('owner/repo', 1);

    store.markSeen(key, 111);
    store.ensureBaseline(key);
    store.get(key);
    store.getAll();

    assert.strictEqual(setKeysForSyncCalls.length, 0);
  });
});
