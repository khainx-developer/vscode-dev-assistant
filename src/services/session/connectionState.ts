import type { GitHubFailure, GitHubViewState } from '../../shared/githubTypes';
import type { JiraFailure, JiraViewState } from '../../shared/jiraTypes';

/**
 * Typed connection lifecycles for the two providers, derived from the controllers' view state.
 * The controllers (and the protected MCP/OAuth stack under them) stay the source of truth —
 * these projections only give the UI one discriminated union to render from.
 *
 * GitHub: unknown → signedOut ⇄ signingIn → signedIn → refreshing → ready | degraded | rateLimited | error
 * Jira:   unknown → disconnected ⇄ connecting → connected → refreshing → ready | error
 */
export type GitHubConnectionState =
  | { kind: 'unknown' }
  | { kind: 'signedOut' }
  | { kind: 'signingIn' }
  | { kind: 'signedIn'; user: string }
  | { kind: 'refreshing'; user: string | null }
  | { kind: 'ready'; user: string }
  | { kind: 'degraded'; user: string; message: string }
  | { kind: 'rateLimited'; user: string | null; resetAt: string | null }
  | { kind: 'error'; message: string };

export type JiraConnectionState =
  | { kind: 'unknown' }
  | { kind: 'disconnected' }
  | { kind: 'connecting' }
  | { kind: 'connected'; siteUrl: string }
  | { kind: 'refreshing'; siteUrl: string | null }
  | { kind: 'ready'; siteUrl: string }
  | { kind: 'error'; siteUrl: string | null; message: string; hasData: boolean };

export type DashboardStatus =
  | { kind: 'needsSetup' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'partialFailure'; messages: string[] };

const NOT_SIGNED_IN = 'Not signed in.';
const NOT_CONNECTED = 'Not connected.';

function isRealGitHubFailure(failure: GitHubFailure): boolean {
  return failure.detail !== NOT_SIGNED_IN;
}

function isRealJiraFailure(failure: JiraFailure): boolean {
  return failure.detail !== NOT_CONNECTED;
}

export function deriveGitHubConnection(state: GitHubViewState | null): GitHubConnectionState {
  if (!state) return { kind: 'unknown' };
  if (state.pendingOperations['github.signIn']?.pending) return { kind: 'signingIn' };

  const failures = state.failures.filter(isRealGitHubFailure);
  const rateLimit = failures.find((failure) => failure.category === 'rate-limited');

  if (!state.authenticated) {
    if (state.isRefreshing) return { kind: 'refreshing', user: null };
    if (rateLimit) return { kind: 'rateLimited', user: null, resetAt: rateLimit.resetAt ?? null };
    if (failures.length > 0) return { kind: 'error', message: friendlyFailure(failures[0].detail) };
    return { kind: 'signedOut' };
  }

  const user = state.me ?? '';
  if (state.isRefreshing) return { kind: 'refreshing', user };
  if (rateLimit) return { kind: 'rateLimited', user, resetAt: rateLimit.resetAt ?? null };
  if (failures.length > 0) {
    return { kind: 'degraded', user, message: summarizeFailures(failures.map((failure) => failure.detail)) };
  }
  if (!state.lastRefreshAt) return { kind: 'signedIn', user };
  return { kind: 'ready', user };
}

export function deriveJiraConnection(state: JiraViewState | null): JiraConnectionState {
  if (!state) return { kind: 'unknown' };
  if (state.pendingOperations['jira.saveConnection']?.pending) return { kind: 'connecting' };

  const failures = state.failures.filter(isRealJiraFailure);
  if (!state.connected) {
    if (state.isRefreshing) return { kind: 'refreshing', siteUrl: null };
    if (failures.length > 0) {
      return { kind: 'error', siteUrl: null, message: friendlyFailure(failures[0].detail), hasData: false };
    }
    return { kind: 'disconnected' };
  }

  const siteUrl = state.siteUrl ?? '';
  if (state.isRefreshing) return { kind: 'refreshing', siteUrl };
  if (failures.length > 0) {
    return {
      kind: 'error',
      siteUrl,
      message: summarizeFailures(failures.map((failure) =>
        failure.queryLabel && !failure.detail.includes(failure.queryLabel)
          ? `${failure.queryLabel}: ${failure.detail}`
          : failure.detail)),
      hasData: Object.values(state.tasksByQuery).some((tasks) => tasks.length > 0),
    };
  }
  if (!state.lastRefreshAt) return { kind: 'connected', siteUrl };
  return { kind: 'ready', siteUrl };
}

export function isGitHubSignedIn(state: GitHubConnectionState): boolean {
  return state.kind === 'signedIn'
    || state.kind === 'ready'
    || state.kind === 'degraded'
    || (state.kind === 'refreshing' && state.user !== null)
    || (state.kind === 'rateLimited' && state.user !== null);
}

export function isJiraConnected(state: JiraConnectionState): boolean {
  return state.kind === 'connected'
    || state.kind === 'ready'
    || (state.kind === 'refreshing' && state.siteUrl !== null)
    || (state.kind === 'error' && state.siteUrl !== null);
}

/**
 * Aggregate status for the dashboard. Never blanks the whole UI because one provider failed —
 * a single failing provider is `partialFailure`, and the other provider's data still renders.
 */
export function deriveDashboardStatus(
  github: GitHubConnectionState,
  jira: JiraConnectionState,
): DashboardStatus {
  if (github.kind === 'unknown' || jira.kind === 'unknown') return { kind: 'loading' };
  if (github.kind === 'signedOut' && jira.kind === 'disconnected') return { kind: 'needsSetup' };

  const messages: string[] = [];
  if (github.kind === 'degraded' || github.kind === 'error') messages.push(`GitHub: ${github.message}`);
  if (github.kind === 'rateLimited') {
    messages.push(github.resetAt
      ? `GitHub: rate limit reached — paused until ${new Date(github.resetAt).toLocaleTimeString()}.`
      : 'GitHub: rate limit reached — requests are paused for a few minutes.');
  }
  if (jira.kind === 'error') messages.push(`Jira: ${jira.message}`);
  if (messages.length > 0) return { kind: 'partialFailure', messages };

  const githubLoading = github.kind === 'refreshing' && github.user === null;
  const jiraLoading = jira.kind === 'refreshing' && jira.siteUrl === null;
  if (githubLoading && jiraLoading) return { kind: 'loading' };
  return { kind: 'ready' };
}

function summarizeFailures(details: string[]): string {
  const unique = [...new Set(details.map(friendlyFailure))];
  if (unique.length === 1) return unique[0];
  return `${unique[0]} (+${unique.length - 1} more)`;
}

/** Turn the most common technical failures into calm, plain-language copy. */
export function friendlyFailure(detail: string): string {
  const text = detail.trim();
  if (/rate.?limit/i.test(text)) return 'Rate limit reached — DevMate will retry automatically.';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(text)) {
    return 'Could not reach the server. Check your network connection and refresh.';
  }
  if (/401|unauthori[sz]ed|expired|re-?auth/i.test(text)) {
    return 'Your sign-in expired. Reconnect from Setup.';
  }
  return text || 'Something went wrong. Try refreshing.';
}
