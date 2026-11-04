import type { CommentAttentionSummary } from '../attention/commentAttention';

export interface GitHubSession {
  username: string;
  accessToken: string;
}

export interface MonitoredRepo {
  owner: string;
  repo: string;
}

export interface MonitoredAuthor {
  username: string;
}

export interface GitHubExtensionConfig {
  monitoredRepos: MonitoredRepo[];
  monitoredAuthors: MonitoredAuthor[];
}

export interface ReviewSummary {
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
  submittedAt: string;
}

export interface CommentSummary {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  url: string;
}

export interface LabelSummary {
  name: string;
  color: string;
}

export type CheckStatus = 'SUCCESS' | 'FAILURE' | 'PENDING' | 'ERROR' | 'EXPECTED' | null;

export type MergeableStatus = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';

export interface PullRequestSummary {
  repoKey: string; // "owner/repo"
  number: number;
  title: string;
  headRef?: string;
  url: string;
  author: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  draft?: boolean;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  labels: LabelSummary[];
  checkStatus: CheckStatus;
  mergeable: MergeableStatus;
  reviews: ReviewSummary[];
  comments: CommentSummary[];
  requestedReviewers: string[];
}

export type ReviewState = 'approved' | 'changes_requested' | 'pending_review' | 'no_review_activity';

export type AttentionReason =
  | 'new_activity'
  | 'waiting_for_review'
  | 'needs_my_review'
  | 'merged'
  | 'pr-changes-requested'
  | 'pr-checks-failing'
  | 'pr-waiting-review'
  | 'pr-needs-my-review'
  | 'pr-unread-comment'
  | 'pr-merge-conflict'
  | 'pr-stale';

export interface AttentionItem {
  pr: PullRequestSummary;
  reviewState: ReviewState;
  reasons: AttentionReason[];
}

export interface GitHubAttentionResult {
  myPRs: AttentionItem[];
  teamPRs: AttentionItem[];
  attentionInbox: AttentionItem[];
}

export type GitHubFailureCategory = 'auth-expired' | 'rate-limited' | 'invalid-entry' | 'network';

export interface GitHubFailure {
  category: GitHubFailureCategory;
  detail: string;
  resetAt?: string;
  entry?: string;
}

export interface RateLimitStatus {
  remaining: number;
  resetAt: string;
}

export type ConfigEntryStatus = 'valid' | 'invalid';

export interface MonitoredRepoView extends MonitoredRepo {
  status: ConfigEntryStatus;
  invalidReason?: string;
}

export interface MonitoredAuthorView extends MonitoredAuthor {
  status: ConfigEntryStatus;
  invalidReason?: string;
}

export interface GitHubViewState {
  authenticated: boolean;
  me: string | null;
  monitoredRepos: MonitoredRepoView[];
  monitoredAuthors: MonitoredAuthorView[];
  attention: GitHubAttentionResult;
  commentAttentionBySource: Record<string, CommentAttentionSummary>;
  commentStatusBySource: Record<string, GitHubCommentState>;
  pendingOperations: Partial<Record<GitHubOperationId, GitHubPendingOperation>>;
  failures: GitHubFailure[];
  lastRefreshAt: string | null;
  isRefreshing: boolean;
}

export type GitHubIncomingMessage =
  | { command: 'github.signIn' }
  | { command: 'github.refresh' }
  | { command: 'github.addRepo'; value: string }
  | { command: 'github.removeRepo'; owner: string; repo: string }
  | { command: 'github.addAuthor'; value: string }
  | { command: 'github.removeAuthor'; username: string }
  | { command: 'github.markRead'; repoKey: string; number: number }
  | { command: 'github.openPr'; repoKey: string; number: number; url: string }
  | { command: 'github.openComment'; repoKey: string; number: number; url: string };

export type GitHubCommentState = 'available' | 'stale' | 'unavailable';
export type GitHubOperationId = GitHubIncomingMessage['command'];

export interface GitHubPendingOperation {
  operationId: GitHubOperationId;
  pending: boolean;
  result?: { ok: boolean; reason?: string };
}

export type GitHubOutgoingMessage =
  | { command: 'github.state'; state: GitHubViewState }
  | { command: 'github.addResult'; kind: 'repo' | 'author'; ok: boolean; reason?: string }
  | {
    command: 'github.operationResult';
    operationId: GitHubOperationId;
    result: { ok: boolean; reason?: string };
  };
