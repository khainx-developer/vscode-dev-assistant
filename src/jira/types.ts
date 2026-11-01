import type { PullRequestSummary } from '../github/types';

export interface JiraConnection {
  siteUrl: string;
  siteId: string;
}

export interface JiraSavedQuery {
  label: string;
  jql: string;
}

export type JiraFailureCategory = 'auth-expired' | 'rate-limited' | 'invalid-entry' | 'network';

export interface JiraFailure {
  category: JiraFailureCategory;
  detail: string;
  queryLabel: string;
  resetAt?: string;
}

export type JiraPrLinkState =
  | { kind: 'linked'; pr: PullRequestSummary }
  | { kind: 'no-match' }
  | { kind: 'not-available' };

export interface JiraTask {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  dueDate: string | null;
  url: string;
  prLink: JiraPrLinkState;
}

export interface JiraViewState {
  connected: boolean;
  siteUrl: string | null;
  currentUser: string | null;
  savedQueries: JiraSavedQuery[];
  tasksByQuery: Record<string, JiraTask[]>;
  failures: JiraFailure[];
  lastRefreshAt: string | null;
  isRefreshing: boolean;
}

export type JiraIncomingMessage =
  | { command: 'jira.saveConnection'; siteUrl: string }
  | { command: 'jira.disconnect' }
  | { command: 'jira.setCurrentUser'; displayName: string }
  | { command: 'jira.refresh' }
  | { command: 'jira.addQuery'; label: string; jql: string }
  | { command: 'jira.removeQuery'; label: string }
  | { command: 'jira.openTask'; url: string }
  | { command: 'jira.openPr'; url: string };

export type JiraOutgoingMessage =
  | { command: 'jira.state'; state: JiraViewState }
  | { command: 'jira.connectionResult'; ok: boolean; reason?: string }
  | { command: 'jira.queryResult'; ok: boolean; reason?: string };
