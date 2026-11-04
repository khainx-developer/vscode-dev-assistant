import * as assert from 'assert';
import type { CommentAttentionSummary } from '../attention/commentAttention';
import { AttentionEngine, githubCommentSourceKey } from './attentionEngine';
import type { PullRequestSummary } from './types';

const NOW = new Date('2026-01-10T00:00:00.000Z').getTime();
const BEFORE = new Date('2026-01-01T00:00:00.000Z').toISOString();
const AFTER = new Date('2026-01-09T00:00:00.000Z').toISOString();

function makePr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    repoKey: 'owner/repo',
    number: 1,
    title: 'Some PR',
    url: 'https://github.com/owner/repo/pull/1',
    author: 'me',
    state: 'OPEN',
    mergedAt: null,
    createdAt: BEFORE,
    updatedAt: BEFORE,
    labels: [],
    checkStatus: null,
    mergeable: 'MERGEABLE',
    reviews: [],
    comments: [],
    requestedReviewers: [],
    ...overrides,
  };
}

function makeCommentAttention(
  pr: PullRequestSummary,
  unreadCount: number,
): Map<string, CommentAttentionSummary> {
  return new Map([[githubCommentSourceKey(pr.repoKey, pr.number), {
    unreadCount,
    latestUnreadAt: unreadCount === 0 ? null : new Date(AFTER).getTime(),
    latestUnreadComment: unreadCount === 0 ? null : {
      id: 'comment-1',
      sourceKey: githubCommentSourceKey(pr.repoKey, pr.number),
      authorIdentity: 'alice',
      bodyText: 'A new comment',
      createdAt: AFTER,
      url: `${pr.url}#issuecomment-1`,
      isCurrentUser: false,
    },
  }]]);
}

suite('AttentionEngine', () => {
  test('computeAttentionState_currentPR_changesRequested_isActionable', () => {
    const pr = makePr({
      reviews: [{ author: 'reviewer', state: 'CHANGES_REQUESTED', submittedAt: AFTER }],
    });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.deepStrictEqual(result.myPRs[0].reasons, ['pr-changes-requested']);
    assert.deepStrictEqual(result.attentionInbox, result.myPRs);
  });

  test('computeAttentionState_currentPR_failingChecks_isActionable', () => {
    const pr = makePr({
      checkStatus: 'FAILURE',
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
    });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.deepStrictEqual(result.myPRs[0].reasons, ['pr-checks-failing']);
  });

  test('computeAttentionState_currentPR_unreadComment_isActionable', () => {
    const pr = makePr({
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
    });

    const result = AttentionEngine.computeAttentionState(
      [pr],
      new Map(),
      'me',
      [],
      NOW,
      makeCommentAttention(pr, 1),
    );

    assert.deepStrictEqual(result.myPRs[0].reasons, ['pr-unread-comment']);
  });

  test('computeAttentionState_currentPR_waitingForReview_isActionable', () => {
    const result = AttentionEngine.computeAttentionState(
      [makePr({ updatedAt: AFTER })],
      new Map(),
      'me',
      [],
      NOW,
      new Map(),
    );

    assert.deepStrictEqual(result.myPRs[0].reasons, ['pr-waiting-review']);
  });

  test('computeAttentionState_teamPR_unreadComment_isActionable', () => {
    const pr = makePr({ author: 'teammate', reviews: [{ author: 'other', state: 'APPROVED', submittedAt: BEFORE }] });

    const result = AttentionEngine.computeAttentionState(
      [pr],
      new Map(),
      'me',
      ['teammate'],
      NOW,
      makeCommentAttention(pr, 1),
    );

    assert.deepStrictEqual(result.teamPRs[0].reasons, ['pr-unread-comment']);
  });

  test('computeAttentionState_teamPR_needsMyReview_isActionable', () => {
    const pr = makePr({ author: 'teammate', requestedReviewers: ['me'], updatedAt: AFTER });

    const result = AttentionEngine.computeAttentionState(
      [pr],
      new Map(),
      'me',
      ['teammate'],
      NOW,
      new Map(),
    );

    assert.deepStrictEqual(result.teamPRs[0].reasons, ['pr-needs-my-review']);
  });

  test('computeAttentionState_matchesMonitoredAuthorsAndReviewersCaseInsensitively', () => {
    const pr = makePr({ author: 'Teammate', requestedReviewers: ['ME'], updatedAt: AFTER });

    const result = AttentionEngine.computeAttentionState(
      [pr],
      new Map(),
      'me',
      ['teammate'],
      NOW,
      new Map(),
    );

    assert.deepStrictEqual(result.teamPRs[0].reasons, ['pr-needs-my-review']);
  });

  test('computeAttentionState_teamPR_withoutReviewRequest_isActionable_waitingForReview', () => {
    const pr = makePr({ author: 'teammate', updatedAt: AFTER });

    const result = AttentionEngine.computeAttentionState(
      [pr],
      new Map(),
      'me',
      ['teammate'],
      NOW,
      new Map(),
    );

    assert.deepStrictEqual(result.teamPRs[0].reasons, ['pr-waiting-review']);
    assert.deepStrictEqual(result.attentionInbox[0].reasons, ['pr-waiting-review']);
  });

  test('computeAttentionState_teamPR_otherReasonIsExcluded', () => {
    const pr = makePr({
      author: 'teammate',
      checkStatus: 'FAILURE',
      reviews: [{ author: 'reviewer', state: 'CHANGES_REQUESTED', submittedAt: AFTER }],
    });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', ['teammate'], NOW, new Map());

    assert.deepStrictEqual(result.teamPRs[0].reasons, []);
    assert.deepStrictEqual(result.attentionInbox, []);
  });

  test('computeAttentionState_myPRsRetainsNoReasonPR', () => {
    const pr = makePr({
      checkStatus: 'SUCCESS',
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
    });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.strictEqual(result.myPRs.length, 1);
    assert.deepStrictEqual(result.myPRs[0].reasons, []);
    assert.deepStrictEqual(result.attentionInbox, []);
  });

  test('computeAttentionState_excludesClosedPRs', () => {
    const pr = makePr({ state: 'MERGED', mergedAt: AFTER });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.deepStrictEqual(result.myPRs, []);
    assert.deepStrictEqual(result.attentionInbox, []);
  });

  test('computeAttentionState_myDraftPRRemainsInMyPRs', () => {
    const pr = makePr({
      draft: true,
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: BEFORE }],
    });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.strictEqual(result.myPRs.length, 1);
    assert.strictEqual(result.myPRs[0].pr.draft, true);
  });

  test('computeAttentionState_myDraftPRWithoutReviews_isNotWaitingForReview', () => {
    const pr = makePr({ draft: true });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.deepStrictEqual(result.myPRs[0].reasons, []);
    assert.deepStrictEqual(result.attentionInbox, []);
  });

  test('computeAttentionState_teamDraftPRIsNotActive', () => {
    const pr = makePr({ author: 'teammate', draft: true, requestedReviewers: ['me'] });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', ['teammate'], NOW, new Map());

    assert.deepStrictEqual(result.teamPRs, []);
    assert.deepStrictEqual(result.attentionInbox, []);
  });

  test('computeAttentionState_reviewState_changesRequestedWinsOverApproved', () => {
    const pr = makePr({
      reviews: [
        { author: 'alice', state: 'APPROVED', submittedAt: BEFORE },
        { author: 'bob', state: 'CHANGES_REQUESTED', submittedAt: BEFORE },
      ],
    });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.strictEqual(result.myPRs[0].reviewState, 'changes_requested');
  });

  test('computeAttentionState_myPRsExcludesUnmonitoredAuthors', () => {
    const pr = makePr({ author: 'stranger' });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', ['teammate'], NOW, new Map());

    assert.strictEqual(result.myPRs.length, 0);
    assert.strictEqual(result.teamPRs.length, 0);
  });

  test('computeAttentionState_myPRWithConflicts_isActionable', () => {
    const pr = makePr({
      mergeable: 'CONFLICTING',
      updatedAt: AFTER,
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: AFTER }],
    });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.deepStrictEqual(result.myPRs[0].reasons, ['pr-merge-conflict']);
  });

  test('computeAttentionState_teamPRWithConflicts_isActionable', () => {
    const pr = makePr({
      author: 'teammate',
      mergeable: 'CONFLICTING',
      updatedAt: AFTER,
      reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: AFTER }],
    });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', ['teammate'], NOW, new Map());

    assert.deepStrictEqual(result.teamPRs[0].reasons, ['pr-merge-conflict']);
  });

  test('computeAttentionState_myDraftPRWithConflicts_isStillFlagged', () => {
    const pr = makePr({ draft: true, mergeable: 'CONFLICTING', updatedAt: AFTER });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.deepStrictEqual(result.myPRs[0].reasons, ['pr-merge-conflict']);
  });

  test('computeAttentionState_waitingReviewPastThreshold_becomesStale', () => {
    const pr = makePr({ updatedAt: BEFORE });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.deepStrictEqual(result.myPRs[0].reasons, ['pr-waiting-review', 'pr-stale']);
  });

  test('computeAttentionState_waitingReviewUnderThreshold_isNotStale', () => {
    const pr = makePr({ updatedAt: AFTER });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW, new Map());

    assert.deepStrictEqual(result.myPRs[0].reasons, ['pr-waiting-review']);
  });

  test('computeAttentionState_needsMyReviewPastThreshold_becomesStale', () => {
    const pr = makePr({ author: 'teammate', requestedReviewers: ['me'], updatedAt: BEFORE });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', ['teammate'], NOW, new Map());

    assert.deepStrictEqual(result.teamPRs[0].reasons, ['pr-needs-my-review', 'pr-stale']);
  });
});
