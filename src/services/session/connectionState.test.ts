import * as assert from 'assert';
import {
  deriveDashboardStatus,
  deriveGitHubConnection,
  deriveJiraConnection,
  friendlyFailure,
  isGitHubSignedIn,
  isJiraConnected,
} from './connectionState';
import type { GitHubViewState } from '../../shared/githubTypes';
import type { JiraViewState } from '../../shared/jiraTypes';

function github(overrides: Partial<GitHubViewState> = {}): GitHubViewState {
  return {
    authenticated: true,
    me: 'octocat',
    monitoredRepos: [],
    monitoredAuthors: [],
    attention: { myPRs: [], teamPRs: [], attentionInbox: [] },
    commentAttentionBySource: {},
    commentStatusBySource: {},
    pendingOperations: {},
    failures: [],
    lastRefreshAt: '2026-11-01T00:00:00.000Z',
    isRefreshing: false,
    ...overrides,
  };
}

function jira(overrides: Partial<JiraViewState> = {}): JiraViewState {
  return {
    connected: true,
    siteUrl: 'https://acme.atlassian.net',
    currentUser: 'Jane Doe',
    teamMembers: [],
    savedQueries: [],
    tasksByQuery: {},
    failures: [],
    lastRefreshAt: '2026-11-01T00:00:00.000Z',
    isRefreshing: false,
    pendingOperations: {},
    ...overrides,
  };
}

suite('connectionState', () => {
  test('github_unknownBeforeFirstState', () => {
    assert.deepStrictEqual(deriveGitHubConnection(null), { kind: 'unknown' });
  });

  test('github_signedOut_whenNotAuthenticated_andNotSignedInFailureIsIgnored', () => {
    const state = github({ authenticated: false, me: null, failures: [{ category: 'auth-expired', detail: 'Not signed in.' }] });
    assert.deepStrictEqual(deriveGitHubConnection(state), { kind: 'signedOut' });
  });

  test('github_signingIn_whileSignInOperationPending', () => {
    const state = github({ authenticated: false, me: null, pendingOperations: { 'github.signIn': { operationId: 'github.signIn', pending: true } } });
    assert.strictEqual(deriveGitHubConnection(state).kind, 'signingIn');
  });

  test('github_lifecycle_signedIn_refreshing_ready', () => {
    assert.deepStrictEqual(deriveGitHubConnection(github({ lastRefreshAt: null })), { kind: 'signedIn', user: 'octocat' });
    assert.deepStrictEqual(deriveGitHubConnection(github({ isRefreshing: true })), { kind: 'refreshing', user: 'octocat' });
    assert.deepStrictEqual(deriveGitHubConnection(github()), { kind: 'ready', user: 'octocat' });
  });

  test('github_degraded_whenSomeReposFail', () => {
    const state = github({ failures: [{ category: 'invalid-entry', detail: 'Repo not found.', entry: 'a/b' }] });
    const result = deriveGitHubConnection(state);
    assert.strictEqual(result.kind, 'degraded');
    assert.ok(isGitHubSignedIn(result));
  });

  test('github_rateLimited_carriesResetTime', () => {
    const state = github({ failures: [{ category: 'rate-limited', detail: 'Rate limited', resetAt: '2026-11-01T01:00:00.000Z' }] });
    assert.deepStrictEqual(deriveGitHubConnection(state), { kind: 'rateLimited', user: 'octocat', resetAt: '2026-11-01T01:00:00.000Z' });
  });

  test('github_error_whenUnauthenticatedWithRealFailure', () => {
    const state = github({ authenticated: false, me: null, failures: [{ category: 'network', detail: 'fetch failed' }] });
    const result = deriveGitHubConnection(state);
    assert.strictEqual(result.kind, 'error');
    assert.ok(!isGitHubSignedIn(result));
  });

  test('jira_lifecycle', () => {
    assert.deepStrictEqual(deriveJiraConnection(null), { kind: 'unknown' });
    assert.deepStrictEqual(
      deriveJiraConnection(jira({ connected: false, siteUrl: null, failures: [{ category: 'auth-expired', detail: 'Not connected.', queryLabel: '' }] })),
      { kind: 'disconnected' },
    );
    assert.strictEqual(
      deriveJiraConnection(jira({ connected: false, pendingOperations: { 'jira.saveConnection': { operationId: 'jira.saveConnection', pending: true } } })).kind,
      'connecting',
    );
    assert.deepStrictEqual(deriveJiraConnection(jira({ lastRefreshAt: null })), { kind: 'connected', siteUrl: 'https://acme.atlassian.net' });
    assert.deepStrictEqual(deriveJiraConnection(jira()), { kind: 'ready', siteUrl: 'https://acme.atlassian.net' });
  });

  test('jira_error_keepsConnectionAndReportsQueryLabel', () => {
    const result = deriveJiraConnection(jira({ failures: [{ category: 'invalid-entry', detail: 'Bad JQL', queryLabel: 'Mine' }] }));
    assert.strictEqual(result.kind, 'error');
    assert.ok(isJiraConnected(result));
    assert.ok(result.kind === 'error' && result.message.includes('Mine'));
  });

  test('dashboard_needsSetup_whenNothingConnected', () => {
    const status = deriveDashboardStatus({ kind: 'signedOut' }, { kind: 'disconnected' });
    assert.deepStrictEqual(status, { kind: 'needsSetup' });
  });

  test('dashboard_loading_untilBothProvidersReport', () => {
    assert.strictEqual(deriveDashboardStatus({ kind: 'unknown' }, { kind: 'ready', siteUrl: 'x' }).kind, 'loading');
  });

  test('dashboard_partialFailure_whenOneProviderFails_withoutBlankingTheOther', () => {
    const status = deriveDashboardStatus(
      { kind: 'ready', user: 'octocat' },
      { kind: 'error', siteUrl: 'x', message: 'Bad JQL', hasData: false },
    );
    assert.deepStrictEqual(status, { kind: 'partialFailure', messages: ['Jira: Bad JQL'] });
  });

  test('dashboard_ready_whenOnlyOneProviderIsConfigured', () => {
    assert.deepStrictEqual(deriveDashboardStatus({ kind: 'ready', user: 'a' }, { kind: 'disconnected' }), { kind: 'ready' });
  });

  test('friendlyFailure_mapsTechnicalErrorsToPlainLanguage', () => {
    assert.match(friendlyFailure('getaddrinfo ENOTFOUND api.github.com'), /network/);
    assert.match(friendlyFailure('HTTP 401 Unauthorized'), /sign-in expired/);
    assert.strictEqual(friendlyFailure('Repo not found.'), 'Repo not found.');
  });
});
