import * as assert from 'assert';
import { PullRequestCache } from './pullRequestCache';
import type { PullRequestSummary } from './types';

function createPullRequest(number: number): PullRequestSummary {
  return {
    repoKey: 'owner/repo',
    number,
    title: `PR ${number}`,
    url: `https://example.com/pull/${number}`,
    author: 'author',
    state: 'OPEN',
    mergedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    labels: [],
    checkStatus: null,
    mergeable: 'UNKNOWN',
    reviews: [],
    comments: [],
    requestedReviewers: [],
  };
}

suite('PullRequestCache', () => {
  test('PullRequestCache_getAll_returnsEmptyArray_whenNothingSet', () => {
    const cache = new PullRequestCache();
    assert.deepStrictEqual(cache.getAll(), []);
  });

  test('PullRequestCache_setForRepo_thenGetAll_returnsExactlyWhatWasSet', () => {
    const cache = new PullRequestCache();
    const prs = [createPullRequest(1), createPullRequest(2)];

    cache.setForRepo('owner/repo', prs);

    assert.deepStrictEqual(cache.getAll(), prs);
  });

  test('PullRequestCache_getAll_flattensAcrossMultipleRepoKeys', () => {
    const cache = new PullRequestCache();
    const first = createPullRequest(1);
    const second = createPullRequest(2);
    second.repoKey = 'another/repo';

    cache.setForRepo('owner/repo', [first]);
    cache.setForRepo('another/repo', [second]);

    assert.deepStrictEqual(
      cache.getAll().sort((left, right) => left.number - right.number),
      [first, second],
    );
  });

  test('PullRequestCache_setForRepo_overwritesPreviousEntryForSameKey_doesNotAppend', () => {
    const cache = new PullRequestCache();
    const previous = createPullRequest(1);
    const replacement = createPullRequest(2);

    cache.setForRepo('owner/repo', [previous]);
    cache.setForRepo('owner/repo', [replacement]);

    assert.deepStrictEqual(cache.getAll(), [replacement]);
  });
});
