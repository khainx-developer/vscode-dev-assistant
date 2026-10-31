import * as assert from 'assert';
import { GitHubClient, setOctokitCtorForTesting } from './client';
import { GitHubSession } from './types';

const session: GitHubSession = { username: 'me', accessToken: 'token-123' };

function makeFakeOctokitCtor(overrides: {
  reposGet?: () => Promise<unknown>;
  usersGetByUsername?: () => Promise<unknown>;
  graphql?: (query: string, variables?: unknown) => Promise<unknown>;
}) {
  return class FakeOctokit {
    rest = {
      repos: { get: overrides.reposGet ?? (async () => ({})) },
      users: { getByUsername: overrides.usersGetByUsername ?? (async () => ({})) },
    };
    graphql = overrides.graphql ?? (async () => ({}));
  } as unknown as Parameters<typeof setOctokitCtorForTesting>[0];
}

suite('GitHubClient', () => {
  teardown(() => {
    setOctokitCtorForTesting(undefined);
  });

  test('GitHubClient_validateRepo_returnsTrue_onSuccess', async () => {
    setOctokitCtorForTesting(makeFakeOctokitCtor({ reposGet: async () => ({ status: 200 }) }));

    const result = await GitHubClient.validateRepo({ owner: 'o', repo: 'r' }, session);

    assert.strictEqual(result, true);
  });

  test('GitHubClient_validateRepo_returnsFalse_on404', async () => {
    setOctokitCtorForTesting(
      makeFakeOctokitCtor({
        reposGet: async () => {
          throw { status: 404 };
        },
      }),
    );

    const result = await GitHubClient.validateRepo({ owner: 'o', repo: 'r' }, session);

    assert.strictEqual(result, false);
  });

  test('GitHubClient_validateRepo_rethrows_onOtherError', async () => {
    setOctokitCtorForTesting(
      makeFakeOctokitCtor({
        reposGet: async () => {
          throw { status: 500 };
        },
      }),
    );

    await assert.rejects(() => GitHubClient.validateRepo({ owner: 'o', repo: 'r' }, session));
  });

  test('GitHubClient_validateAuthor_returnsTrue_onSuccess', async () => {
    setOctokitCtorForTesting(makeFakeOctokitCtor({ usersGetByUsername: async () => ({ status: 200 }) }));

    const result = await GitHubClient.validateAuthor({ username: 'octocat' }, session);

    assert.strictEqual(result, true);
  });

  test('GitHubClient_validateAuthor_returnsFalse_on404', async () => {
    setOctokitCtorForTesting(
      makeFakeOctokitCtor({
        usersGetByUsername: async () => {
          throw { status: 404 };
        },
      }),
    );

    const result = await GitHubClient.validateAuthor({ username: 'octocat' }, session);

    assert.strictEqual(result, false);
  });

  test('GitHubClient_fetchOpenPullRequests_mapsGraphQLResponseToPullRequestSummary', async () => {
    setOctokitCtorForTesting(
      makeFakeOctokitCtor({
        graphql: async () => ({
          repository: {
            pullRequests: {
              nodes: [
                {
                  number: 42,
                  title: 'Fix bug',
                  url: 'https://github.com/o/r/pull/42',
                  author: { login: 'alice' },
                  state: 'OPEN',
                  mergedAt: null,
                  createdAt: '2025-12-30T00:00:00Z',
                  updatedAt: '2026-01-02T00:00:00Z',
                  mergeable: 'CONFLICTING',
                  labels: { nodes: [{ name: 'bug', color: 'd73a4a' }] },
                  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] },
                  reviews: { nodes: [{ author: { login: 'bob' }, state: 'APPROVED', submittedAt: '2026-01-01T00:00:00Z' }] },
                  comments: { nodes: [{ id: 'c1', author: { login: 'bob' }, createdAt: '2026-01-02T00:00:00Z', url: 'https://x' }] },
                  reviewRequests: { nodes: [{ requestedReviewer: { login: 'carol' } }] },
                },
              ],
            },
          },
        }),
      }),
    );

    const result = await GitHubClient.fetchOpenPullRequests({ owner: 'o', repo: 'r' }, session);

    assert.deepStrictEqual(result, [
      {
        repoKey: 'o/r',
        number: 42,
        title: 'Fix bug',
        url: 'https://github.com/o/r/pull/42',
        author: 'alice',
        state: 'OPEN',
        mergedAt: null,
        createdAt: '2025-12-30T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
        mergeable: 'CONFLICTING',
        labels: [{ name: 'bug', color: 'd73a4a' }],
        checkStatus: 'FAILURE',
        reviews: [{ author: 'bob', state: 'APPROVED', submittedAt: '2026-01-01T00:00:00Z' }],
        comments: [{ id: 'c1', author: 'bob', createdAt: '2026-01-02T00:00:00Z', url: 'https://x' }],
        requestedReviewers: ['carol'],
      },
    ]);
  });

  test('GitHubClient_fetchOpenPullRequests_returnsEmptyArray_whenNoOpenPRs', async () => {
    setOctokitCtorForTesting(
      makeFakeOctokitCtor({
        graphql: async () => ({ repository: { pullRequests: { nodes: [] } } }),
      }),
    );

    const result = await GitHubClient.fetchOpenPullRequests({ owner: 'o', repo: 'r' }, session);

    assert.deepStrictEqual(result, []);
  });

  test('GitHubClient_fetchOpenPullRequests_filtersOutDraftPRs', async () => {
    setOctokitCtorForTesting(
      makeFakeOctokitCtor({
        graphql: async () => ({
          repository: {
            pullRequests: {
              nodes: [
                {
                  number: 1,
                  title: 'draft pr',
                  url: 'https://x',
                  author: { login: 'alice' },
                  state: 'OPEN',
                  isDraft: true,
                  mergedAt: null,
                  reviews: { nodes: [] },
                  comments: { nodes: [] },
                  reviewRequests: { nodes: [] },
                },
                {
                  number: 2,
                  title: 'ready pr',
                  url: 'https://y',
                  author: { login: 'alice' },
                  state: 'OPEN',
                  isDraft: false,
                  mergedAt: null,
                  reviews: { nodes: [] },
                  comments: { nodes: [] },
                  reviewRequests: { nodes: [] },
                },
              ],
            },
          },
        }),
      }),
    );

    const result = await GitHubClient.fetchOpenPullRequests({ owner: 'o', repo: 'r' }, session);

    assert.deepStrictEqual(result.map((pr) => pr.number), [2]);
  });

  test('GitHubClient_fetchOpenPullRequests_filtersOutNonUserRequestedReviewers', async () => {
    setOctokitCtorForTesting(
      makeFakeOctokitCtor({
        graphql: async () => ({
          repository: {
            pullRequests: {
              nodes: [
                {
                  number: 1,
                  title: 't',
                  url: 'https://x',
                  author: { login: 'alice' },
                  state: 'OPEN',
                  mergedAt: null,
                  reviews: { nodes: [] },
                  comments: { nodes: [] },
                  reviewRequests: { nodes: [{ requestedReviewer: null }, { requestedReviewer: { login: 'carol' } }] },
                },
              ],
            },
          },
        }),
      }),
    );

    const result = await GitHubClient.fetchOpenPullRequests({ owner: 'o', repo: 'r' }, session);

    assert.deepStrictEqual(result[0].requestedReviewers, ['carol']);
  });

  test('GitHubClient_fetchOpenPullRequests_usesGraphQLVariables_notStringConcatenation', async () => {
    let capturedQuery = '';
    let capturedVariables: unknown;
    setOctokitCtorForTesting(
      makeFakeOctokitCtor({
        graphql: async (query, variables) => {
          capturedQuery = query;
          capturedVariables = variables;
          return { repository: { pullRequests: { nodes: [] } } };
        },
      }),
    );

    await GitHubClient.fetchOpenPullRequests({ owner: 'o', repo: 'r' }, session);

    assert.ok(capturedQuery.includes('$owner'));
    assert.ok(capturedQuery.includes('$repo'));
    assert.ok(!capturedQuery.includes('"o"') && !capturedQuery.includes("'o'"));
    assert.deepStrictEqual(capturedVariables, { owner: 'o', repo: 'r' });
  });

  test('GitHubClient_getRateLimitStatus_returnsRemainingAndResetAt', async () => {
    setOctokitCtorForTesting(
      makeFakeOctokitCtor({
        graphql: async () => ({ rateLimit: { remaining: 4999, resetAt: '2026-01-01T00:00:00Z' } }),
      }),
    );

    const result = await GitHubClient.getRateLimitStatus(session);

    assert.deepStrictEqual(result, { remaining: 4999, resetAt: '2026-01-01T00:00:00Z' });
  });
});
