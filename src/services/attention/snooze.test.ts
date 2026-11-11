import * as assert from 'assert';
import { computeSnoozeUntil, isSnoozeOption, partitionSnoozed, pruneExpiredSnoozes, snoozeKeyFor } from './snooze';
import type { AttentionInboxItem } from './attentionInboxBuilder';

const HOUR = 60 * 60 * 1000;

function at(hours: number, minutes = 0): number {
  const date = new Date(2026, 10, 11, hours, minutes, 0, 0);
  return date.getTime();
}

function item(key: string): AttentionInboxItem {
  return {
    key,
    relatedPRs: [],
    reasons: ['pr-waiting-review'],
    priority: 3,
    latestRelevantAt: null,
    jiraUnreadCount: 0,
    jiraLatestUnreadComment: null,
    prUnreadCount: 0,
    prLatestUnreadComment: null,
  };
}

suite('snooze', () => {
  test('oneHour_isExactlySixtyMinutes', () => {
    assert.strictEqual(computeSnoozeUntil('1h', at(10)), at(11));
  });

  test('laterToday_isFivePm_whenThereIsTime', () => {
    assert.strictEqual(computeSnoozeUntil('laterToday', at(9, 30)), at(17));
  });

  test('laterToday_isThreeHoursLater_inTheAfternoonOrEvening', () => {
    assert.strictEqual(computeSnoozeUntil('laterToday', at(15)), at(18));
    assert.strictEqual(computeSnoozeUntil('laterToday', at(21)), at(21) + 3 * HOUR);
  });

  test('tomorrow_isNineAmNextDay', () => {
    const expected = new Date(2026, 10, 12, 9, 0, 0, 0).getTime();
    assert.strictEqual(computeSnoozeUntil('tomorrow', at(23, 30)), expected);
  });

  test('isSnoozeOption_rejectsUnknownValues', () => {
    assert.ok(isSnoozeOption('1h'));
    assert.ok(!isSnoozeOption('forever'));
  });

  test('snoozeKey_usesPrimarySource_soLinkedPrChangesDoNotUnsnooze', () => {
    assert.strictEqual(snoozeKeyFor({ key: 'jira:site:ABC-1|github:o/r#1|github:o/r#2' }), 'jira:site:ABC-1');
    assert.strictEqual(snoozeKeyFor({ key: 'github:o/r#3' }), 'github:o/r#3');
  });

  test('partition_hidesSnoozedItems_untilExpiry', () => {
    const now = at(10);
    const items = [item('jira:s:A-1|github:o/r#1'), item('github:o/r#2')];
    const snoozes = { 'jira:s:A-1': now + HOUR };

    const before = partitionSnoozed(items, snoozes, now);
    assert.deepStrictEqual(before.active.map((entry) => entry.key), ['github:o/r#2']);
    assert.deepStrictEqual(before.snoozed.map((entry) => entry.snoozeKey), ['jira:s:A-1']);

    const after = partitionSnoozed(items, snoozes, now + HOUR + 1);
    assert.strictEqual(after.active.length, 2);
    assert.strictEqual(after.snoozed.length, 0);
  });

  test('prune_dropsExpiredEntries', () => {
    assert.deepStrictEqual(pruneExpiredSnoozes({ a: 5, b: 15 }, 10), { b: 15 });
  });
});
