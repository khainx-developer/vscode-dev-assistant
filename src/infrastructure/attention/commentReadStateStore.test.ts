import * as assert from 'assert';
import * as vscode from 'vscode';
import { CommentReadStateStore } from './commentReadStateStore';

interface StoredValue {
  key: string;
  value: unknown;
}

function createFakeContext(initialValue?: unknown): {
  context: vscode.ExtensionContext;
  getStoredValue: () => unknown;
  writes: StoredValue[];
} {
  let storedValue = initialValue;
  const writes: StoredValue[] = [];
  const globalState = {
    get<T>(_key: string, defaultValue?: T): T | undefined {
      return storedValue === undefined ? defaultValue : (storedValue as T);
    },
    async update(key: string, value: unknown): Promise<void> {
      storedValue = value;
      writes.push({ key, value });
    },
    setKeysForSync: (_keys: readonly string[]): void => undefined,
    keys: (): string[] => [],
  };

  return {
    context: { globalState } as unknown as vscode.ExtensionContext,
    getStoredValue: () => storedValue,
    writes,
  };
}

suite('CommentReadStateStore', () => {
  test('ensureBaseline_writesOnlyWhenAbsent', async () => {
    const fake = createFakeContext();
    const store = new CommentReadStateStore(fake.context);

    await store.ensureBaseline('source-a', 100);
    await store.ensureBaseline('source-a', 200);

    assert.strictEqual(await store.getSeenAt('source-a'), 100);
    assert.strictEqual(fake.writes.length, 1);
  });

  test('markSeen_updatesOneNamespacedKey', async () => {
    const { context } = createFakeContext();
    const store = new CommentReadStateStore(context);

    await store.markSeen('jira:cloud-a:ISSUE-1', 100);
    await store.markSeen('github:owner/repo#1', 200);

    assert.strictEqual(await store.getSeenAt('jira:cloud-a:ISSUE-1'), 100);
    assert.strictEqual(await store.getSeenAt('github:owner/repo#1'), 200);
  });

  test('concurrentMarks_preserveBothSources', async () => {
    const { context } = createFakeContext();
    const store = new CommentReadStateStore(context);

    await Promise.all([
      store.markSeen('jira:cloud-a:ISSUE-1', 100),
      store.markSeen('github:owner/repo#1', 200),
    ]);

    assert.strictEqual(await store.getSeenAt('jira:cloud-a:ISSUE-1'), 100);
    assert.strictEqual(await store.getSeenAt('github:owner/repo#1'), 200);
  });

  test('reconcileSources_incompleteDoesNotPrune', async () => {
    const fake = createFakeContext();
    const store = new CommentReadStateStore(fake.context);
    await store.markSeen('source-a', 100);
    await store.markSeen('source-b', 200);
    const writesBeforeReconcile = fake.writes.length;

    await store.reconcileSources(new Set(['source-a']), false);

    assert.strictEqual(await store.getSeenAt('source-a'), 100);
    assert.strictEqual(await store.getSeenAt('source-b'), 200);
    assert.strictEqual(fake.writes.length, writesBeforeReconcile);
  });

  test('reconcileSources_completePrunesMissingSources', async () => {
    const { context } = createFakeContext();
    const store = new CommentReadStateStore(context);
    await store.markSeen('source-a', 100);
    await store.markSeen('source-b', 200);

    await store.reconcileSources(new Set(['source-a']), true);

    assert.strictEqual(await store.getSeenAt('source-a'), 100);
    assert.strictEqual(await store.getSeenAt('source-b'), undefined);
  });
});
