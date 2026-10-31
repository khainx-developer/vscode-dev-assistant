import * as assert from 'assert';
import { AttentionEngine } from './attentionEngine';
import { prKey } from './lastSeenStore';
import { PullRequestSummary } from './types';

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

suite('AttentionEngine', () => {
  test('AttentionEngine_waitingForReview_whenZeroReviews', () => {
    const pr = makePr({ author: 'me', reviews: [] });
    const lastSeen = new Map([[prKey(pr.repoKey, pr.number), new Date(BEFORE).getTime()]]);

    const result = AttentionEngine.computeAttentionState([pr], lastSeen, 'me', [], NOW);

    assert.deepStrictEqual(result.myPRs[0].reasons, ['waiting_for_review']);
  });

  test('AttentionEngine_newActivity_whenCommentAfterLastSeen', () => {
    const pr = makePr({
      author: 'me',
      reviews: [{ author: 'alice', state: 'APPROVED', submittedAt: BEFORE }],
      comments: [{ id: 'c1', author: 'alice', createdAt: AFTER, url: 'https://x' }],
    });
    const lastSeen = new Map([[prKey(pr.repoKey, pr.number), new Date(BEFORE).getTime()]]);

    const result = AttentionEngine.computeAttentionState([pr], lastSeen, 'me', [], NOW);

    assert.ok(result.myPRs[0].reasons.includes('new_activity'));
  });

  test('AttentionEngine_needsMyReview_whenRequestedAndNotReviewed', () => {
    const pr = makePr({ author: 'teammate', requestedReviewers: ['me'], reviews: [] });
    const lastSeen = new Map<string, number>();

    const result = AttentionEngine.computeAttentionState([pr], lastSeen, 'me', ['teammate'], NOW);

    assert.deepStrictEqual(result.teamPRs[0].reasons, ['needs_my_review']);
  });

  test('AttentionEngine_merged_whenMergedAfterLastSeen', () => {
    const pr = makePr({
      author: 'me',
      state: 'MERGED',
      mergedAt: AFTER,
      reviews: [{ author: 'alice', state: 'APPROVED', submittedAt: BEFORE }],
    });
    const lastSeen = new Map([[prKey(pr.repoKey, pr.number), new Date(BEFORE).getTime()]]);

    const result = AttentionEngine.computeAttentionState([pr], lastSeen, 'me', [], NOW);

    assert.ok(result.myPRs[0].reasons.includes('merged'));
  });

  test('AttentionEngine_noReasonsFlagged_onFirstSightEvenWithExistingActivity', () => {
    const pr = makePr({
      author: 'me',
      state: 'MERGED',
      mergedAt: AFTER,
      reviews: [{ author: 'alice', state: 'APPROVED', submittedAt: AFTER }],
      comments: [{ id: 'c1', author: 'alice', createdAt: AFTER, url: 'https://x' }],
    });
    const lastSeen = new Map<string, number>();

    const result = AttentionEngine.computeAttentionState([pr], lastSeen, 'me', [], NOW);

    assert.deepStrictEqual(result.myPRs[0].reasons, []);
  });

  test('AttentionEngine_multipleReasonsOnSamePr_countedOnceInInbox', () => {
    const pr = makePr({
      author: 'me',
      reviews: [],
      comments: [{ id: 'c1', author: 'alice', createdAt: AFTER, url: 'https://x' }],
    });
    const lastSeen = new Map([[prKey(pr.repoKey, pr.number), new Date(BEFORE).getTime()]]);

    const result = AttentionEngine.computeAttentionState([pr], lastSeen, 'me', [], NOW);

    assert.deepStrictEqual(result.myPRs[0].reasons, ['new_activity', 'waiting_for_review']);
    assert.strictEqual(result.attentionInbox.length, 1);
  });

  test('AttentionEngine_myPRs_excludesPRsNotAuthoredByMe', () => {
    const pr = makePr({ author: 'stranger' });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW);

    assert.strictEqual(result.myPRs.length, 0);
    assert.strictEqual(result.teamPRs.length, 0);
  });

  test('AttentionEngine_teamPRs_excludesPRsNotByMonitoredAuthors', () => {
    const pr = makePr({ author: 'stranger' });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', ['teammate'], NOW);

    assert.strictEqual(result.teamPRs.length, 0);
  });

  test('AttentionEngine_reviewState_changesRequestedWinsOverApproved_whenBothPresentAcrossReviewers', () => {
    const pr = makePr({
      author: 'me',
      reviews: [
        { author: 'alice', state: 'APPROVED', submittedAt: BEFORE },
        { author: 'bob', state: 'CHANGES_REQUESTED', submittedAt: BEFORE },
      ],
    });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW);

    assert.strictEqual(result.myPRs[0].reviewState, 'changes_requested');
  });

  test('AttentionEngine_reviewState_noReviewActivity_whenNoReviews', () => {
    const pr = makePr({ author: 'me', reviews: [] });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW);

    assert.strictEqual(result.myPRs[0].reviewState, 'no_review_activity');
  });

  test('AttentionEngine_needsMyReview_doesNotFire_onMyOwnPRs', () => {
    const pr = makePr({ author: 'me', requestedReviewers: ['me'], reviews: [] });

    const result = AttentionEngine.computeAttentionState([pr], new Map(), 'me', [], NOW);

    assert.strictEqual(result.teamPRs.length, 0);
    assert.ok(!result.myPRs[0].reasons.includes('needs_my_review'));
  });
});
