import * as assert from 'assert';
import { KNOWN_ITEM_RETENTION_MS, notificationMessage, planNotifications } from './notificationPlanner';
import type { AttentionInboxItem } from './attentionInboxBuilder';

function item(key: string, overrides: Partial<AttentionInboxItem> = {}): AttentionInboxItem {
  return {
    key,
    relatedPRs: [],
    reasons: ['pr-checks-failing'],
    priority: 1,
    latestRelevantAt: null,
    jiraUnreadCount: 0,
    jiraLatestUnreadComment: null,
    prUnreadCount: 0,
    prLatestUnreadComment: null,
    ...overrides,
  };
}

suite('notificationPlanner', () => {
  test('firstRun_baselinesSilently', () => {
    const plan = planNotifications(null, [item('a'), item('b')], 1000);
    assert.deepStrictEqual(plan.newItems, []);
    assert.deepStrictEqual(Object.keys(plan.nextKnown).sort(), ['a', 'b']);
  });

  test('onlyUnseenItemsAreNew', () => {
    const plan = planNotifications({ a: 1000 }, [item('a'), item('b')], 2000);
    assert.deepStrictEqual(plan.newItems.map((entry) => entry.key), ['b']);
  });

  test('itemsAreDeduplicatedByPrimarySource', () => {
    const plan = planNotifications({ 'jira:s:A-1': 1000 }, [item('jira:s:A-1|github:o/r#9')], 2000);
    assert.deepStrictEqual(plan.newItems, []);
  });

  test('flappingProvider_doesNotRenotify_withinRetention', () => {
    const first = planNotifications({}, [item('a')], 1000);
    const failedRefresh = planNotifications(first.nextKnown, [], 2000);
    const recovered = planNotifications(failedRefresh.nextKnown, [item('a')], 3000);
    assert.deepStrictEqual(recovered.newItems, []);
  });

  test('itemsForgottenAfterRetention_canNotifyAgain', () => {
    const later = 1000 + KNOWN_ITEM_RETENTION_MS + 1;
    const plan = planNotifications({ a: 1000 }, [item('a')], later);
    assert.deepStrictEqual(plan.newItems.map((entry) => entry.key), ['a']);
  });

  test('message_namesASingleItem_andBatchesMany', () => {
    const single = item('github:o/r#7', {
      pr: { repoKey: 'o/r', number: 7, title: 'Fix login' } as AttentionInboxItem['pr'],
    });
    assert.strictEqual(notificationMessage([single]), 'DevMate: Checks failing — #7 Fix login');
    assert.strictEqual(notificationMessage([item('a'), item('b'), item('c')]), 'DevMate: 3 items need your attention.');
    assert.strictEqual(notificationMessage([]), null);
  });
});
