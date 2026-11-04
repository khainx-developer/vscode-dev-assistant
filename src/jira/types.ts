import type { PullRequestSummary } from '../github/types';
import type { CommentAttentionSummary } from '../attention/commentAttention';

export interface JiraConnection {
  siteUrl: string;
  siteId: string;
}

export interface JiraSavedQuery {
  label: string;
  jql: string;
}

export type OperationResult = { ok: true } | { ok: false; reason: string };

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

export type JiraCommentState = 'available' | 'stale' | 'unavailable';

export interface JiraTask {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  dueDate: string | null;
  updatedAt?: string;
  commentSourceKey?: string;
  comments?: JiraCommentSummary[];
  commentAttention?: CommentAttentionSummary;
  commentState?: JiraCommentState;
  commentFailure?: JiraFailure;
  url: string;
  prLink: JiraPrLinkState;
}

export interface JiraCommentVisibility {
  type: string;
  value: string;
}

export interface JiraCommentSummary {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  visibility: JiraCommentVisibility | null;
  url: string;
}

export interface JiraViewState {
  connected: boolean;
  siteUrl: string | null;
  currentUser: string | null;
  teamMembers: string[];
  savedQueries: JiraSavedQuery[];
  tasksByQuery: Record<string, JiraTask[]>;
  failures: JiraFailure[];
  lastRefreshAt: string | null;
  isRefreshing: boolean;
  pendingOperations: Partial<Record<JiraOperationId, PendingOperation>>;
}

export type JiraIncomingMessage =
  | { command: 'jira.saveConnection'; siteUrl: string }
  | { command: 'jira.disconnect' }
  | { command: 'jira.setCurrentUser'; displayName: string }
  | { command: 'jira.addTeamMember'; displayName: string }
  | { command: 'jira.removeTeamMember'; displayName: string }
  | { command: 'jira.refresh' }
  | { command: 'jira.addQuery'; label: string; jql: string }
  | { command: 'jira.updateQuery'; originalLabel: string; label: string; jql: string }
  | { command: 'jira.removeQuery'; label: string }
  | { command: 'jira.openTask'; url: string };

export type JiraOperationId = JiraIncomingMessage['command'];

export interface PendingOperation {
  operationId: JiraOperationId;
  pending: boolean;
  result?: OperationResult;
}

export type JiraOutgoingMessage =
  | { command: 'jira.state'; state: JiraViewState }
  | { command: 'jira.connectionResult'; ok: boolean; reason?: string }
  | ({ command: 'jira.currentUserResult' } & OperationResult)
  | ({ command: 'jira.teamMemberResult' } & OperationResult)
  | { command: 'jira.queryResult'; ok: boolean; reason?: string }
  | { command: 'jira.updateQueryResult'; ok: boolean; reason?: string }
  | { command: 'jira.operationResult'; operationId: JiraOperationId; result: OperationResult };
