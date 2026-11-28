import * as assert from 'assert';
import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import type { PullRequestSummary } from '../../shared/githubTypes';
import type { AnalysisStateSnapshot } from './stateHash';
import {
  applyManualDoneMarks,
  checkNamesFromActionKey,
  evidenceIdsFromActionKey,
  trackActions,
  type ActionTrackerIdentity,
  type TrackableAction,
} from './actionTracker';

function pr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    repoKey: 'acme/web',
    number: 42,
    title: 'Fix',
    url: 'https://github.com/acme/web/pull/42',
    author: 'dev',
    state: 'OPEN',
    mergedAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-28T00:00:00Z',
    labels: [],
    checkStatus: 'FAILURE',
    checkConclusions: { test: 'FAILURE' },
    headSha: 'aaa',
    unresolvedThreadCount: 2,
    mergeable: 'MERGEABLE',
    reviews: [{ author: 'reviewer', state: 'CHANGES_REQUESTED', submittedAt: '2026-11-20T00:00:00Z' }],
    comments: [],
    requestedReviewers: [],
    ...overrides,
  };
}

function item(overrides: Partial<AttentionInboxItem> = {}, pull?: PullRequestSummary): AttentionInboxItem {
  const pullRequest = pull ?? pr();
  return {
    key: `${pullRequest.repoKey}#${pullRequest.number}`,
    pr: pullRequest,
    relatedPRs: [],
    reasons: ['pr-checks-failing'],
    priority: 1,
    latestRelevantAt: null,
    jiraUnreadCount: 0,
    jiraLatestUnreadComment: null,
    jiraLatestAwaitingComment: null,
    prUnreadCount: 0,
    prLatestUnreadComment: null,
    prLatestAwaitingComment: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<AnalysisStateSnapshot> = {}): AnalysisStateSnapshot {
  return {
    itemKey: 'acme/web#42',
    headSha: 'aaa',
    latestCommentIds: ['c1'],
    unresolvedThreadCount: 2,
    reviewState: 'changes_requested',
    checkConclusions: { test: 'FAILURE' },
    jiraStatus: null,
    ...overrides,
  };
}

const identity: ActionTrackerIdentity = {
  githubLogin: 'octocat',
  jiraName: 'Octo Cat',
};

suite('evidenceIdsFromActionKey', () => {
  test('parsesSortedEvidenceIds', () => {
    assert.deepStrictEqual(evidenceIdsFromActionKey('fix-ci:c1,check:test'), ['c1', 'check:test']);
    assert.deepStrictEqual(evidenceIdsFromActionKey('decide:'), []);
  });
});

suite('checkNamesFromActionKey', () => {
  test('extractsUniqueCheckNames', () => {
    assert.deepStrictEqual(checkNamesFromActionKey('fix-ci:check:test,c1,check:lint'), ['test', 'lint']);
    assert.deepStrictEqual(checkNamesFromActionKey('fix-ci:c1,t2'), []);
    assert.deepStrictEqual(checkNamesFromActionKey('decide:'), []);
  });
});

suite('trackActions', () => {
  test('closedOrMerged_dropsAllActions', () => {
    const actions: TrackableAction[] = [
      { kind: 'fix-ci', actionKey: 'fix-ci:check:test' },
      { kind: 'decide', actionKey: 'decide:' },
    ];
    const closed = trackActions({
      actions,
      snapshot: snapshot(),
      item: item({}, pr({ state: 'CLOSED' })),
      identity,
    });
    assert.deepStrictEqual(closed, {
      'fix-ci:check:test': 'dropped',
      'decide:': 'dropped',
    });
    const merged = trackActions({
      actions,
      snapshot: snapshot(),
      item: item({}, pr({ state: 'MERGED', mergedAt: '2026-11-28T00:00:00Z' })),
      identity,
    });
    assert.strictEqual(merged['fix-ci:check:test'], 'dropped');
  });

  test('reply_doneWhenNewerCommentByYou', () => {
    const action: TrackableAction = { kind: 'reply', actionKey: 'reply:c1' };
    const open = trackActions({
      actions: [action],
      snapshot: snapshot({ latestCommentIds: ['c1'] }),
      item: item({}, pr({
        comments: [{
          id: 'c1',
          author: 'bob',
          body: '?',
          createdAt: '2026-11-20T00:00:00Z',
          url: 'https://example.com/c1',
        }],
      })),
      identity,
    });
    assert.strictEqual(open['reply:c1'], 'open');

    const done = trackActions({
      actions: [action],
      snapshot: snapshot({ latestCommentIds: ['c1'] }),
      item: item({}, pr({
        comments: [
          {
            id: 'c1',
            author: 'bob',
            body: '?',
            createdAt: '2026-11-20T00:00:00Z',
            url: 'https://example.com/c1',
          },
          {
            id: 'c2',
            author: 'octocat',
            body: 'done',
            createdAt: '2026-11-21T00:00:00Z',
            url: 'https://example.com/c2',
          },
        ],
      })),
      identity,
    });
    assert.strictEqual(done['reply:c1'], 'done');
  });

  test('codeChange_progressThenDone', () => {
    const action: TrackableAction = { kind: 'code-change', actionKey: 'code-change:t1' };
    const progress = trackActions({
      actions: [action],
      snapshot: snapshot({ headSha: 'aaa', unresolvedThreadCount: 2, reviewState: 'changes_requested' }),
      item: item({}, pr({ headSha: 'bbb', unresolvedThreadCount: 2 })),
      identity,
    });
    assert.strictEqual(progress['code-change:t1'], 'progress');

    const doneByThreads = trackActions({
      actions: [action],
      snapshot: snapshot({ unresolvedThreadCount: 2, reviewState: 'changes_requested' }),
      item: item({}, pr({ unresolvedThreadCount: 0, reviews: [] })),
      identity,
    });
    assert.strictEqual(doneByThreads['code-change:t1'], 'done');

    const doneByReview = trackActions({
      actions: [action],
      snapshot: snapshot({ unresolvedThreadCount: 2, reviewState: 'changes_requested' }),
      item: item({}, pr({
        unresolvedThreadCount: 1,
        reviews: [{ author: 'reviewer', state: 'APPROVED', submittedAt: '2026-11-22T00:00:00Z' }],
      })),
      identity,
    });
    assert.strictEqual(doneByReview['code-change:t1'], 'done');
  });

  test('fixCi_progressAndDoneByNamedCheck', () => {
    const action: TrackableAction = { kind: 'fix-ci', actionKey: 'fix-ci:check:test' };
    const progress = trackActions({
      actions: [action],
      snapshot: snapshot({ headSha: 'aaa', checkConclusions: { test: 'FAILURE' } }),
      item: item({}, pr({
        headSha: 'bbb',
        checkConclusions: { test: 'FAILURE' },
        checkStatus: 'FAILURE',
      })),
      identity,
    });
    assert.strictEqual(progress['fix-ci:check:test'], 'progress');

    const done = trackActions({
      actions: [action],
      snapshot: snapshot({ checkConclusions: { test: 'FAILURE' } }),
      item: item({}, pr({
        checkConclusions: { test: 'SUCCESS' },
        checkStatus: 'SUCCESS',
      })),
      identity,
    });
    assert.strictEqual(done['fix-ci:check:test'], 'done');
  });

  test('fixCi_withoutCheckEvidence_staysOpenEvenWhenFindingsMatchChecks', () => {
    const action: TrackableAction = {
      kind: 'fix-ci',
      actionKey: 'fix-ci:c1',
      findings: [{ label: 'test' }],
    };
    const statuses = trackActions({
      actions: [action],
      snapshot: snapshot({ headSha: 'aaa', checkConclusions: { test: 'FAILURE' } }),
      item: item({}, pr({
        headSha: 'aaa',
        checkConclusions: { test: 'SUCCESS' },
        checkStatus: 'SUCCESS',
      })),
      identity,
    });
    assert.strictEqual(statuses['fix-ci:c1'], 'open');
  });

  test('reviewContext_doneWhenYouReviewed', () => {
    const action: TrackableAction = { kind: 'review-context', actionKey: 'review-context:pr' };
    const open = trackActions({
      actions: [action],
      snapshot: snapshot(),
      item: item({}, pr({ reviews: [] })),
      identity,
    });
    assert.strictEqual(open['review-context:pr'], 'open');

    const done = trackActions({
      actions: [action],
      snapshot: snapshot(),
      item: item({}, pr({
        reviews: [{ author: 'octocat', state: 'APPROVED', submittedAt: '2026-11-22T00:00:00Z' }],
      })),
      identity,
    });
    assert.strictEqual(done['review-context:pr'], 'done');
  });

  test('decideAndFollowUp_neverAutomatic', () => {
    const statuses = trackActions({
      actions: [
        { kind: 'decide', actionKey: 'decide:' },
        { kind: 'follow-up', actionKey: 'follow-up:ac' },
      ],
      snapshot: snapshot(),
      item: item({}, pr({ headSha: 'zzz', checkConclusions: { test: 'SUCCESS' } })),
      identity,
    });
    assert.strictEqual(statuses['decide:'], 'open');
    assert.strictEqual(statuses['follow-up:ac'], 'open');
  });

  test('applyManualDoneMarks_overridesOpenAndIgnoresUnknown', () => {
    const applied = applyManualDoneMarks(
      { 'decide:': 'open', 'fix-ci:check:test': 'progress', 'reply:c1': 'dropped' },
      new Set(['decide:', 'reply:c1', 'missing:']),
    );
    assert.deepStrictEqual(applied, {
      'decide:': 'done',
      'fix-ci:check:test': 'progress',
      'reply:c1': 'dropped',
    });
  });
});
