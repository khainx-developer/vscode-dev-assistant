import * as assert from 'assert';
import { computeStateHash, type AnalysisStateSnapshot } from './stateHash';

function baseState(
  overrides: Partial<AnalysisStateSnapshot> = {},
): AnalysisStateSnapshot {
  return {
    itemKey: 'WEB-123',
    headSha: 'abc123',
    latestCommentIds: ['c1', 'c2'],
    unresolvedThreadCount: 2,
    reviewState: 'CHANGES_REQUESTED',
    checkConclusions: {
      test: 'FAILURE',
      lint: 'SUCCESS',
    },
    jiraStatus: 'In Progress',
    ...overrides,
  };
}

suite('computeStateHash', () => {
  test('sameState_sameHash', () => {
    const left = computeStateHash(baseState());
    const right = computeStateHash(baseState({
      latestCommentIds: ['c2', 'c1'],
    }));

    assert.strictEqual(left, right);
    assert.strictEqual(left.length, 64);
  });

  test('listedFields_changeHash', () => {
    const original = computeStateHash(baseState());

    assert.notStrictEqual(
      computeStateHash(baseState({ itemKey: 'WEB-999' })),
      original,
    );
    assert.notStrictEqual(
      computeStateHash(baseState({ headSha: 'def456' })),
      original,
    );
    assert.notStrictEqual(
      computeStateHash(baseState({ latestCommentIds: ['c1', 'c9'] })),
      original,
    );
    assert.notStrictEqual(
      computeStateHash(baseState({ unresolvedThreadCount: 3 })),
      original,
    );
    assert.notStrictEqual(
      computeStateHash(baseState({ reviewState: 'APPROVED' })),
      original,
    );
    assert.notStrictEqual(
      computeStateHash(baseState({
        checkConclusions: { test: 'SUCCESS', lint: 'SUCCESS' },
      })),
      original,
    );
    assert.notStrictEqual(
      computeStateHash(baseState({ jiraStatus: 'Done' })),
      original,
    );
  });

  test('timestampOnly_doesNotChangeHash', () => {
    const withoutTimestamp = computeStateHash(baseState());
    const withTimestamp = computeStateHash({
      ...baseState(),
      updatedAt: '2026-11-28T12:00:00.000Z',
      latestRelevantAt: '2026-11-28T12:05:00.000Z',
    } as AnalysisStateSnapshot & {
      updatedAt: string;
      latestRelevantAt: string;
    });

    assert.strictEqual(withoutTimestamp, withTimestamp);
  });
});
