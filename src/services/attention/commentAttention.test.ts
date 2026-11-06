import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  buildCommentAttention,
  ProviderCommentCandidate,
} from './commentAttention';
import { CommentReadStateStore } from '../../infrastructure/attention/commentReadStateStore';

const SEEN_AT = Date.parse('2026-10-01T00:00:00.000Z');

function createFakeContext(): { context: vscode.ExtensionContext; getStoredValue: () => unknown } {
  let storedValue: unknown;
  const globalState = {
    get<T>(_key: string, defaultValue?: T): T | undefined {
      return storedValue === undefined ? defaultValue : (storedValue as T);
    },
    async update(_key: string, value: unknown): Promise<void> {
      storedValue = value;
    },
    setKeysForSync: (_keys: readonly string[]): void => undefined,
    keys: (): string[] => [],
  };

  return {
    context: { globalState } as unknown as vscode.ExtensionContext,
    getStoredValue: () => storedValue,
  };
}

function makeComment(
  overrides: Partial<ProviderCommentCandidate> = {},
): ProviderCommentCandidate {
  return {
    id: 'comment-1',
    sourceKey: 'jira:cloud-a:ISSUE-1',
    authorIdentity: 'alice',
    bodyText: 'A comment body',
    createdAt: '2026-10-02T00:00:00.000Z',
    url: 'https://example.test/comment-1',
    isCurrentUser: false,
    ...overrides,
  };
}

suite('buildCommentAttention', () => {
  test('buildCommentAttention_firstBaselineHasZeroUnread', () => {
    const summary = buildCommentAttention([makeComment()], undefined);

    assert.deepStrictEqual(summary, {
      unreadCount: 0,
      latestUnreadAt: null,
      latestUnreadComment: null,
    });
  });

  test('buildCommentAttention_excludesCurrentUser', () => {
    const comment = makeComment({ isCurrentUser: true });

    const summary = buildCommentAttention([comment], SEEN_AT);

    assert.strictEqual(summary.unreadCount, 0);
    assert.strictEqual(summary.latestUnreadComment, null);
  });

  test('buildCommentAttention_excludesExactAutomationNamesCaseInsensitively', () => {
    const comments = [
      makeComment({ authorIdentity: 'Automation for Jira' }),
      makeComment({ authorIdentity: 'aUtOmAtIoN fOr JiRa' }),
      makeComment({ authorIdentity: 'GitHub-Action' }),
      makeComment({ authorIdentity: 'COPILOT' }),
    ];

    const summary = buildCommentAttention(comments, SEEN_AT);

    assert.strictEqual(summary.unreadCount, 0);
  });

  test('buildCommentAttention_keepsLookalikes', () => {
    const comments = [
      makeComment({ authorIdentity: 'Automation for Jira bot' }),
      makeComment({ authorIdentity: 'github-actions' }),
      makeComment({ authorIdentity: 'copilot-user' }),
    ];

    const summary = buildCommentAttention(comments, SEEN_AT);

    assert.strictEqual(summary.unreadCount, 3);
  });

  test('buildCommentAttention_equalTimestampIsNotUnread', () => {
    const comment = makeComment({ createdAt: new Date(SEEN_AT).toISOString() });

    const summary = buildCommentAttention([comment], SEEN_AT);

    assert.strictEqual(summary.unreadCount, 0);
  });

  test('buildCommentAttention_returnsLatestPreviewWithoutPersistingBody', async () => {
    const earlier = makeComment({
      id: 'earlier',
      createdAt: '2026-10-02T00:00:00.000Z',
      bodyText: 'Earlier comment body',
    });
    const latest = makeComment({
      id: 'latest',
      createdAt: '2026-10-03T00:00:00.000Z',
      bodyText: 'Latest comment body',
    });
    const summary = buildCommentAttention([latest, earlier], SEEN_AT);
    const fake = createFakeContext();
    const store = new CommentReadStateStore(fake.context);
    await store.markSeen(latest.sourceKey, Date.parse(latest.createdAt));

    assert.strictEqual(summary.unreadCount, 2);
    assert.strictEqual(summary.latestUnreadAt, Date.parse(latest.createdAt));
    assert.strictEqual(summary.latestUnreadComment, latest);
    assert.ok(!JSON.stringify(fake.getStoredValue()).includes(latest.bodyText));
  });

  test('buildCommentAttention_emptyListReturnsNoUnread', () => {
    const summary = buildCommentAttention([], SEEN_AT);

    assert.deepStrictEqual(summary, {
      unreadCount: 0,
      latestUnreadAt: null,
      latestUnreadComment: null,
    });
  });
});
