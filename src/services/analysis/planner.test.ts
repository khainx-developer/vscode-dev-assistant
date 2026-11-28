import * as assert from 'assert';
import type { AttentionInboxItem, AttentionReason } from '../attention/attentionInboxBuilder';
import {
  AUTO_ANALYSIS_BACKOFF_MS,
  isImportantForAutoAnalysis,
  planAutoAnalysis,
} from './planner';

function item(
  key: string,
  priority: AttentionInboxItem['priority'],
  reasons: AttentionReason[] = [],
): AttentionInboxItem {
  return {
    key,
    relatedPRs: [],
    reasons,
    priority,
    latestRelevantAt: null,
    jiraUnreadCount: 0,
    jiraLatestUnreadComment: null,
    jiraLatestAwaitingComment: null,
    prUnreadCount: 0,
    prLatestUnreadComment: null,
    prLatestAwaitingComment: null,
  };
}

suite('isImportantForAutoAnalysis', () => {
  test('urgentPriority_alwaysQualifies', () => {
    assert.strictEqual(isImportantForAutoAnalysis(item('a', 1, ['pr-stale'])), true);
    assert.strictEqual(isImportantForAutoAnalysis(item('b', 1, [])), true);
  });

  test('importantReasons_qualifyWhenNotUrgent', () => {
    assert.strictEqual(
      isImportantForAutoAnalysis(item('a', 2, ['pr-unread-comment'])),
      true,
    );
    assert.strictEqual(
      isImportantForAutoAnalysis(item('b', 3, ['jira-mentioned'])),
      true,
    );
    assert.strictEqual(
      isImportantForAutoAnalysis(item('c', 3, ['pr-needs-my-review'])),
      true,
    );
    assert.strictEqual(
      isImportantForAutoAnalysis(item('d', 4, ['pr-changes-requested'])),
      true,
    );
    assert.strictEqual(
      isImportantForAutoAnalysis(item('e', 4, ['pr-checks-failing'])),
      true,
    );
    assert.strictEqual(
      isImportantForAutoAnalysis(item('f', 2, ['jira-unread-comment'])),
      true,
    );
    assert.strictEqual(
      isImportantForAutoAnalysis(item('g', 3, ['pr-mentioned'])),
      true,
    );
  });

  test('otherReasons_doNotQualify', () => {
    assert.strictEqual(
      isImportantForAutoAnalysis(item('a', 3, ['jira-review'])),
      false,
    );
    assert.strictEqual(
      isImportantForAutoAnalysis(item('b', 3, ['pr-awaiting-reply'])),
      false,
    );
    assert.strictEqual(
      isImportantForAutoAnalysis(item('c', 4, ['pr-linked'])),
      false,
    );
  });
});

suite('planAutoAnalysis', () => {
  test('returnsHighestPriorityFirst_upToCap', () => {
    const items = [
      item('low', 3, ['pr-needs-my-review']),
      item('urgent-b', 1, ['pr-checks-failing']),
      item('mid', 2, ['pr-unread-comment']),
      item('urgent-a', 1, ['pr-changes-requested']),
      item('skip', 4, ['pr-linked']),
    ];
    const planned = planAutoAnalysis({
      items,
      hasCachedView: () => false,
      snoozedKeys: new Set(),
      lastAutoFailureAt: () => undefined,
      maxAutoPerRefresh: 3,
    });
    assert.deepStrictEqual(planned.map((entry) => entry.key), [
      'urgent-b',
      'urgent-a',
      'mid',
    ]);
  });

  test('skipsSnoozed_cached_andUnimportant', () => {
    const items = [
      item('snoozed', 1, ['pr-checks-failing']),
      item('cached', 1, ['pr-changes-requested']),
      item('ok', 1, ['pr-stale']),
      item('normal', 4, ['jira-due-tomorrow']),
    ];
    const planned = planAutoAnalysis({
      items,
      hasCachedView: (entry) => entry.key === 'cached',
      snoozedKeys: new Set(['snoozed']),
      lastAutoFailureAt: () => undefined,
      maxAutoPerRefresh: 10,
    });
    assert.deepStrictEqual(planned.map((entry) => entry.key), ['ok']);
  });

  test('skipsBackoff_whenFailedLessThan30MinutesAgo', () => {
    const now = 1_000_000;
    const items = [
      item('recent-fail', 1, ['pr-checks-failing']),
      item('old-fail', 1, ['pr-changes-requested']),
      item('never-failed', 1, ['pr-stale']),
    ];
    const planned = planAutoAnalysis({
      items,
      hasCachedView: () => false,
      snoozedKeys: new Set(),
      lastAutoFailureAt: (entry) => {
        if (entry.key === 'recent-fail') return now - AUTO_ANALYSIS_BACKOFF_MS + 1;
        if (entry.key === 'old-fail') return now - AUTO_ANALYSIS_BACKOFF_MS;
        return undefined;
      },
      maxAutoPerRefresh: 10,
      now,
    });
    assert.deepStrictEqual(planned.map((entry) => entry.key), [
      'old-fail',
      'never-failed',
    ]);
  });

  test('emptyWhenCapZeroOrNoItems', () => {
    assert.deepStrictEqual(
      planAutoAnalysis({
        items: [item('a', 1, ['pr-stale'])],
        hasCachedView: () => false,
        snoozedKeys: new Set(),
        lastAutoFailureAt: () => undefined,
        maxAutoPerRefresh: 0,
      }),
      [],
    );
    assert.deepStrictEqual(
      planAutoAnalysis({
        items: [],
        hasCachedView: () => false,
        snoozedKeys: new Set(),
        lastAutoFailureAt: () => undefined,
        maxAutoPerRefresh: 3,
      }),
      [],
    );
  });
});
