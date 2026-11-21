import { githubCommentSourceKey } from '../github/attentionEngine';
import { prKey } from '../../infrastructure/github/lastSeenStore';
import type {
  AttentionReason as GitHubAttentionReason,
  GitHubViewState,
  PullRequestSummary,
} from '../../shared/githubTypes';
import type { JiraTask, JiraViewState } from '../../shared/jiraTypes';
import type { CommentAttentionSummary, ProviderCommentCandidate } from './commentAttention';
import { SHORT_REPLY_MAX_CHARS } from './commentAttention';
import { findPullRequestsForIssue } from '../jira/prLinkMatcher';

export type AttentionReason =
  | 'jira-review'
  | 'jira-overdue'
  | 'jira-due-today'
  | 'jira-due-tomorrow'
  | 'jira-unread-comment'
  | 'jira-awaiting-reply'
  | 'jira-blocked'
  | 'jira-no-pr'
  | 'pr-linked'
  | 'pr-changes-requested'
  | 'pr-checks-failing'
  | 'pr-waiting-review'
  | 'pr-needs-my-review'
  | 'pr-unread-comment'
  | 'pr-awaiting-reply'
  | 'pr-merge-conflict'
  | 'pr-stale'
  | 'jira-stale';

export interface AttentionInboxOptions {
  /** Jira statuses that count as in-progress for the no-open-PR rule (case-insensitive). Default: `["In Progress"]`. */
  noPrStatuses?: string[];
  /** Days without `updatedAt` activity before flagging no open PR. Default: 3. */
  noPrDays?: number;
  /** When true, a latest non-bot comment under ~15 characters does not count as awaiting reply. Default: false. */
  ignoreShortReplies?: boolean;
}

const DEFAULT_NO_PR_STATUSES = ['In Progress'];
const DEFAULT_NO_PR_DAYS = 3;

export interface AttentionInboxItem {
  key: string;
  jiraTask?: JiraTask;
  pr?: PullRequestSummary;
  relatedPRs: AttentionInboxPullRequest[];
  reasons: AttentionReason[];
  priority: 1 | 2 | 3 | 4;
  latestRelevantAt: string | null;
  jiraUnreadCount: number;
  jiraLatestUnreadComment: ProviderCommentCandidate | null;
  /** Latest non-bot someone-else comment awaiting reply; independent of unread/seenAt. */
  jiraLatestAwaitingComment: ProviderCommentCandidate | null;
  prUnreadCount: number;
  prLatestUnreadComment: ProviderCommentCandidate | null;
  /** Latest non-bot someone-else PR comment awaiting reply; independent of unread/seenAt. */
  prLatestAwaitingComment: ProviderCommentCandidate | null;
}

export interface AttentionInboxPullRequest {
  pr: PullRequestSummary;
  reasons: AttentionReason[];
  unreadCount: number;
  latestUnreadComment: ProviderCommentCandidate | null;
  latestAwaitingComment: ProviderCommentCandidate | null;
}

interface DueDateInfo {
  reason: 'jira-overdue' | 'jira-due-today' | 'jira-due-tomorrow';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const JIRA_STALE_WAITING_DAYS = 3;

function statusMatchesNoPrList(status: string, statuses: string[]): boolean {
  const normalized = status.trim().toLowerCase();
  return statuses.some((candidate) => candidate.trim().toLowerCase() === normalized);
}

/**
 * Terminal Jira status names used only when statusCategory is missing
 * (case-insensitive, trimmed). Prefer statusCategory.key/name === done.
 */
const JIRA_AWAITING_REPLY_SKIP_STATUSES = [
  'done',
  'closed',
  'resolved',
  'cancelled',
  'canceled',
  "won't do",
  'released',
];

type JiraStatusFields = {
  status: string;
  statusCategory?: JiraTask['statusCategory'];
};

function isDoneStatusCategory(issue: JiraStatusFields): boolean | undefined {
  const key = issue.statusCategory?.key?.trim().toLowerCase();
  const name = issue.statusCategory?.name?.trim().toLowerCase();
  if (!key && !name) {
    return undefined;
  }
  return key === 'done' || name === 'done';
}

/** Done via statusCategory when present; else terminal status-name list (awaiting-reply / blocked). */
function isJiraDoneStatus(issue: JiraStatusFields): boolean {
  const categoryDone = isDoneStatusCategory(issue);
  if (categoryDone !== undefined) {
    return categoryDone;
  }
  return statusMatchesNoPrList(issue.status, JIRA_AWAITING_REPLY_SKIP_STATUSES);
}

function hasOpenBlocker(task: JiraTask): boolean {
  // Flagged / Impediment is treated the same as an open blockedBy link.
  if (task.flagged) return true;
  return (task.blockedBy ?? []).some((blocker) => !isJiraDoneStatus(blocker));
}

function isStale(updatedAt: string | undefined, now: number, days: number = JIRA_STALE_WAITING_DAYS): boolean {
  if (!updatedAt) return false;
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return false;
  return (now - parsed) / DAY_MS >= days;
}

function getDueDateInfo(dueDate: string | null, now: number): DueDateInfo | null {
  if (!dueDate) return null;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  if (!Number.isFinite(due.getTime())) return null;

  const diffDays = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  if (diffDays < 0) return { reason: 'jira-overdue' };
  if (diffDays === 0) return { reason: 'jira-due-today' };
  if (diffDays === 1) return { reason: 'jira-due-tomorrow' };
  return null;
}

function jiraSourceKey(task: JiraTask): string {
  return task.commentSourceKey ?? `jira:${task.url}`;
}

function isMonitoredJiraTask(task: JiraTask, jiraState: JiraViewState): boolean {
  const assignee = task.assignee?.trim().toLowerCase();
  if (!assignee) return false;

  const currentUser = jiraState.currentUser?.trim().toLowerCase();
  if (currentUser && assignee === currentUser) return true;

  return jiraState.teamMembers.some((member) => member.trim().toLowerCase() === assignee);
}

function latestRelevantAt(
  task: JiraTask | undefined,
  prs: PullRequestSummary[],
  githubState: GitHubViewState,
): string | null {
  const timestamps: number[] = [];
  const addTimestamp = (value: string | number | null | undefined): void => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      timestamps.push(value);
    } else if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) timestamps.push(parsed);
    }
  };

  if (task) {
    addTimestamp(task.updatedAt);
    addTimestamp(task.commentAttention?.latestUnreadAt);
  }
  for (const pr of prs) {
    addTimestamp(pr.updatedAt);
    addTimestamp(
      githubState.commentAttentionBySource[githubCommentSourceKey(pr.repoKey, pr.number)]?.latestUnreadAt,
    );
  }
  return timestamps.length === 0 ? null : new Date(Math.max(...timestamps)).toISOString();
}

function mapGitHubReason(reason: GitHubAttentionReason): AttentionReason | null {
  switch (reason) {
    case 'pr-changes-requested':
    case 'pr-checks-failing':
    case 'pr-waiting-review':
    case 'pr-needs-my-review':
    case 'pr-unread-comment':
    case 'pr-merge-conflict':
    case 'pr-stale':
      return reason;
    case 'waiting_for_review':
      return 'pr-waiting-review';
    case 'needs_my_review':
      return 'pr-needs-my-review';
    case 'new_activity':
    case 'merged':
      return null;
  }
}

function isAssignedToCurrentUser(task: JiraTask, jiraState: JiraViewState): boolean {
  const currentUser = jiraState.currentUser?.trim().toLowerCase();
  if (!currentUser) return false;
  return (task.assignee?.trim().toLowerCase() ?? '') === currentUser;
}

function countsAsAwaitingReply(
  attention: CommentAttentionSummary | undefined,
  ignoreShortReplies: boolean,
): boolean {
  if (!attention?.awaitingReply || !attention.latestAwaitingComment) return false;
  if (
    ignoreShortReplies
    && attention.latestAwaitingComment.bodyText.trim().length < SHORT_REPLY_MAX_CHARS
  ) {
    return false;
  }
  return true;
}

function mapPRReasons(
  prReasons: GitHubAttentionReason[],
  hasUnreadComments: boolean,
  hasAwaitingReply: boolean,
): AttentionReason[] {
  const reasons = prReasons.flatMap((reason) => {
    const mapped = mapGitHubReason(reason);
    return mapped ? [mapped] : [];
  });
  if (hasUnreadComments && !reasons.includes('pr-unread-comment')) {
    reasons.push('pr-unread-comment');
  }
  if (hasAwaitingReply && !reasons.includes('pr-awaiting-reply')) {
    reasons.push('pr-awaiting-reply');
  }
  return reasons;
}

function getPriority(reasons: AttentionReason[]): AttentionInboxItem['priority'] {
  if (reasons.some((reason) =>
    reason === 'jira-overdue'
    || reason === 'pr-changes-requested'
    || reason === 'pr-checks-failing'
    || reason === 'pr-merge-conflict'
    || reason === 'pr-stale'
    || reason === 'jira-stale')) {
    return 1;
  }
  if (reasons.some((reason) => reason === 'jira-unread-comment' || reason === 'pr-unread-comment')) {
    return 2;
  }
  if (reasons.some((reason) =>
    reason === 'jira-review'
    || reason === 'jira-no-pr'
    || reason === 'jira-awaiting-reply'
    || reason === 'jira-blocked'
    || reason === 'pr-awaiting-reply'
    || reason === 'pr-waiting-review'
    || reason === 'pr-needs-my-review')) {
    return 3;
  }
  return 4;
}

function newestComment(
  comments: ProviderCommentCandidate[],
): ProviderCommentCandidate | null {
  return comments.reduce<ProviderCommentCandidate | null>(
    (latest, comment) => !latest || Date.parse(comment.createdAt) > Date.parse(latest.createdAt)
      ? comment
      : latest,
    null,
  );
}

function createInboxItem(
  jiraTask: JiraTask | undefined,
  pr: PullRequestSummary | undefined,
  reasons: AttentionReason[],
  githubState: GitHubViewState,
  relatedPRs: AttentionInboxPullRequest[] = [],
): AttentionInboxItem {
  const jiraSource = jiraTask ? jiraSourceKey(jiraTask) : undefined;
  const displayedPRs = relatedPRs.length > 0 ? relatedPRs.map((item) => item.pr) : pr ? [pr] : [];
  const githubSources = displayedPRs.map((item) => githubCommentSourceKey(item.repoKey, item.number));
  const jiraAttention = jiraTask?.commentAttention;
  const prAttentions = githubSources.map((source) => githubState.commentAttentionBySource[source]);
  const prUnreadComments = prAttentions.flatMap((attention) =>
    attention?.latestUnreadComment ? [attention.latestUnreadComment] : []);
  const prAwaitingComments = prAttentions.flatMap((attention) =>
    attention?.latestAwaitingComment ? [attention.latestAwaitingComment] : []);
  return {
    key: jiraSource && githubSources.length > 0
      ? `${jiraSource}|${githubSources.join('|')}`
      : jiraSource ?? githubSources[0] ?? '',
    jiraTask,
    pr,
    relatedPRs,
    reasons,
    priority: getPriority(reasons),
    latestRelevantAt: latestRelevantAt(jiraTask, displayedPRs, githubState),
    jiraUnreadCount: jiraAttention?.unreadCount ?? 0,
    jiraLatestUnreadComment: jiraAttention?.latestUnreadComment ?? null,
    jiraLatestAwaitingComment: jiraAttention?.latestAwaitingComment ?? null,
    prUnreadCount: prAttentions.reduce((total, attention) => total + (attention?.unreadCount ?? 0), 0),
    prLatestUnreadComment: newestComment(prUnreadComments),
    prLatestAwaitingComment: newestComment(prAwaitingComments),
  };
}

function compareItems(left: AttentionInboxItem, right: AttentionInboxItem): number {
  if (left.priority !== right.priority) return left.priority - right.priority;
  if (left.priority === 4) {
    const leftDueDate = left.jiraTask?.dueDate ?? '\uffff';
    const rightDueDate = right.jiraTask?.dueDate ?? '\uffff';
    if (leftDueDate !== rightDueDate) return leftDueDate < rightDueDate ? -1 : 1;
  }
  const leftActivity = left.latestRelevantAt ?? '';
  const rightActivity = right.latestRelevantAt ?? '';
  if (leftActivity !== rightActivity) return leftActivity > rightActivity ? -1 : 1;
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

export function buildAttentionInbox(
  jiraState: JiraViewState,
  githubState: GitHubViewState,
  now: number,
  options: AttentionInboxOptions = {},
): AttentionInboxItem[] {
  const noPrStatuses = options.noPrStatuses ?? DEFAULT_NO_PR_STATUSES;
  const noPrDays = options.noPrDays ?? DEFAULT_NO_PR_DAYS;
  const ignoreShortReplies = options.ignoreShortReplies ?? false;
  const tasksByKey = new Map<string, JiraTask>();
  if (jiraState.connected) {
    for (const tasks of Object.values(jiraState.tasksByQuery)) {
      for (const task of tasks) {
        if (!tasksByKey.has(task.key)) tasksByKey.set(task.key, task);
      }
    }
  }

  const githubItemsByKey = new Map(
    githubState.attention.attentionInbox.map((item) => [prKey(item.pr.repoKey, item.pr.number), item]),
  );
  const myPRs = githubState.attention.myPRs
    .map((item) => item.pr)
    .filter((pr) => pr.state === 'OPEN');
  const myPRKeys = new Set(myPRs.map((pr) => prKey(pr.repoKey, pr.number)));
  const readyTeamPRs = githubState.attention.teamPRs
    .map((item) => item.pr)
    .filter((pr) => pr.state === 'OPEN' && !pr.draft);
  const monitoredPRsByKey = new Map(
    [...myPRs, ...readyTeamPRs].map((pr) => [prKey(pr.repoKey, pr.number), pr]),
  );
  const consumedPRs = new Set<string>();
  const items: AttentionInboxItem[] = [];

  for (const task of tasksByKey.values()) {
    if (!isMonitoredJiraTask(task, jiraState)) continue;

    const dueInfo = getDueDateInfo(task.dueDate, now);
    const jiraReasons: AttentionReason[] = [];
    if (task.status === 'Review') jiraReasons.push('jira-review');
    if ((task.commentAttention?.unreadCount ?? 0) > 0) jiraReasons.push('jira-unread-comment');
    if (
      isAssignedToCurrentUser(task, jiraState)
      && !isJiraDoneStatus(task)
      && countsAsAwaitingReply(task.commentAttention, ignoreShortReplies)
    ) {
      jiraReasons.push('jira-awaiting-reply');
    }
    if (
      isAssignedToCurrentUser(task, jiraState)
      && !isJiraDoneStatus(task)
      && hasOpenBlocker(task)
    ) {
      jiraReasons.push('jira-blocked');
    }
    if (dueInfo) jiraReasons.push(dueInfo.reason);
    if (jiraReasons.includes('jira-review') && isStale(task.updatedAt, now)) {
      jiraReasons.push('jira-stale');
    }

    const relatedPullRequests = findPullRequestsForIssue(task.key, [...monitoredPRsByKey.values()]);
    const cachedLinkedPR = task.prLink.kind === 'linked'
      ? monitoredPRsByKey.get(prKey(task.prLink.pr.repoKey, task.prLink.pr.number))
      : undefined;
    const cachedLinkedPRKey = cachedLinkedPR ? prKey(cachedLinkedPR.repoKey, cachedLinkedPR.number) : undefined;
    if (cachedLinkedPR && !relatedPullRequests.some((pr) => prKey(pr.repoKey, pr.number) === cachedLinkedPRKey)) {
      relatedPullRequests.push(cachedLinkedPR);
    }
    const relatedPRs = relatedPullRequests
      .map((pr): AttentionInboxPullRequest => {
        const key = prKey(pr.repoKey, pr.number);
        const sourceKey = githubCommentSourceKey(pr.repoKey, pr.number);
        const githubItem = githubItemsByKey.get(key);
        const attention = githubState.commentAttentionBySource[sourceKey];
        const unreadCount = attention?.unreadCount ?? 0;
        const awaitingReply = myPRKeys.has(key)
          && countsAsAwaitingReply(attention, ignoreShortReplies);
        return {
          pr,
          reasons: mapPRReasons(githubItem?.reasons ?? [], unreadCount > 0, awaitingReply),
          unreadCount,
          latestUnreadComment: attention?.latestUnreadComment ?? null,
          latestAwaitingComment: awaitingReply ? (attention?.latestAwaitingComment ?? null) : null,
        };
      });
    const reasons = [...new Set([
      ...jiraReasons,
      ...relatedPRs.flatMap((relatedPR) => relatedPR.reasons),
    ])];
    if (
      task.prLink.kind === 'no-match'
      && relatedPRs.length === 0
      && statusMatchesNoPrList(task.status, noPrStatuses)
      && isStale(task.updatedAt, now, noPrDays)
    ) {
      reasons.push('jira-no-pr');
    }
    if (reasons.length === 0 && relatedPRs.length > 0) reasons.push('pr-linked');
    if (reasons.length > 0) {
      items.push(createInboxItem(task, undefined, reasons, githubState, relatedPRs));
      for (const relatedPR of relatedPRs) {
        consumedPRs.add(prKey(relatedPR.pr.repoKey, relatedPR.pr.number));
      }
    }
  }

  for (const githubItem of githubState.attention.attentionInbox) {
    const key = prKey(githubItem.pr.repoKey, githubItem.pr.number);
    if (consumedPRs.has(key)) continue;
    const sourceKey = githubCommentSourceKey(githubItem.pr.repoKey, githubItem.pr.number);
    const attention = githubState.commentAttentionBySource[sourceKey];
    const reasons = mapPRReasons(
      githubItem.reasons,
      (attention?.unreadCount ?? 0) > 0,
      myPRKeys.has(key) && countsAsAwaitingReply(attention, ignoreShortReplies),
    );
    if (reasons.length > 0) {
      items.push(createInboxItem(undefined, githubItem.pr, reasons, githubState));
      consumedPRs.add(key);
    }
  }

  // My PRs that only need a reply are absent from GitHub attentionInbox (engine has no
  // awaiting-reply reason); still surface them from myPRs + comment attention.
  for (const pr of myPRs) {
    const key = prKey(pr.repoKey, pr.number);
    if (consumedPRs.has(key)) continue;
    const sourceKey = githubCommentSourceKey(pr.repoKey, pr.number);
    const attention = githubState.commentAttentionBySource[sourceKey];
    if (!countsAsAwaitingReply(attention, ignoreShortReplies)) continue;
    const githubItem = githubItemsByKey.get(key);
    const reasons = mapPRReasons(
      githubItem?.reasons ?? [],
      (attention?.unreadCount ?? 0) > 0,
      true,
    );
    if (reasons.length > 0) {
      items.push(createInboxItem(undefined, pr, reasons, githubState));
    }
  }

  return items.sort(compareItems);
}
