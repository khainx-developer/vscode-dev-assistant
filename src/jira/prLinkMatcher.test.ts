import * as assert from 'assert';
import { matchPullRequestForIssue } from './prLinkMatcher';
import type { PullRequestSummary } from '../github/types';

function createPullRequest(title: string, updatedAt: string): PullRequestSummary {
  return {
    repoKey: 'owner/repo',
    number: 1,
    title,
    url: 'https://example.com/pull/1',
    author: 'author',
    state: 'OPEN',
    mergedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt,
    labels: [],
    checkStatus: null,
    mergeable: 'UNKNOWN',
    reviews: [],
    comments: [],
    requestedReviewers: [],
  };
}

suite('matchPullRequestForIssue', () => {
  test('matchPullRequestForIssue_returnsUndefined_whenNoPrMatches', () => {
    assert.strictEqual(
      matchPullRequestForIssue('PROJ-123', [createPullRequest('Fix another issue', '2026-01-02T00:00:00Z')]),
      undefined,
    );
  });

  test('matchPullRequestForIssue_returnsUndefined_whenPrsArrayIsEmpty', () => {
    assert.strictEqual(matchPullRequestForIssue('PROJ-123', []), undefined);
  });

  test('matchPullRequestForIssue_returnsTheMatch_whenExactlyOneMatches', () => {
    const match = createPullRequest('Fix PROJ-123 display issue', '2026-01-02T00:00:00Z');

    assert.strictEqual(matchPullRequestForIssue('PROJ-123', [match]), match);
  });

  test('matchPullRequestForIssue_matchesIssueKeyInBranchName', () => {
    const match = createPullRequest('Implement feature', '2026-01-02T00:00:00Z');
    match.headRef = 'feature/PROJ-123-new-view';

    assert.strictEqual(matchPullRequestForIssue('PROJ-123', [match]), match);
  });

  test('matchPullRequestForIssue_doesNotMatchPartialIssueKey', () => {
    const prs = [
      createPullRequest('Fix APROJ-123 issue', '2026-01-02T00:00:00Z'),
      createPullRequest('Fix PROJ-1234 issue', '2026-01-03T00:00:00Z'),
    ];

    assert.strictEqual(matchPullRequestForIssue('PROJ-123', prs), undefined);
  });

  test('matchPullRequestForIssue_returnsMostRecentlyUpdated_whenMultiplePrsMatch', () => {
    const older = createPullRequest('PROJ-123 fix', '2026-01-02T00:00:00Z');
    const newer = createPullRequest('Follow-up for PROJ-123', '2026-01-03T00:00:00Z');

    assert.strictEqual(matchPullRequestForIssue('PROJ-123', [older, newer]), newer);
  });

  test('matchPullRequestForIssue_doesNotMatch_onPartialKeyWithoutProjectPrefix', () => {
    assert.strictEqual(
      matchPullRequestForIssue('PROJ-123', [createPullRequest('Fix bug 123', '2026-01-02T00:00:00Z')]),
      undefined,
    );
  });
});
