import { githubCommentSourceKey } from '../github/attentionEngine';
import { prKey } from '../../infrastructure/github/lastSeenStore';
import type {
  AttentionReason as GitHubAttentionReason,
  GitHubViewState,
  PullRequestSummary,
} from '../../shared/githubTypes';
import type { JiraTask, JiraViewState } from '../../shared/jiraTypes';
import type { ProviderCommentCandidate } from './commentAttention';
import { findPullRequestsForIssue } from '../jira/prLinkMatcher';

export type AttentionReason =
  | 'jira-review'
  | 'jira-overdue'
  | 'jira-due-today'
  | 'jira-due-tomorrow'
  | 'jira-unread-comment'
  | 'pr-changes-requested'
  | 'pr-checks-failing'
  | 'pr-waiting-review'
  | 'pr-needs-my-review'
  | 'pr-unread-comment'
  | 'pr-merge-conflict'
  | 'pr-stale'
  | 'jira-stale';

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
  prUnreadCount: number;
  prLatestUnreadComment: ProviderCommentCandidate | null;
}

export interface AttentionInboxPullRequest {
  pr: PullRequestSummary;
  reasons: AttentionReason[];
  unreadCount: number;
  latestUnreadComment: ProviderCommentCandidate | null;
}

interface DueDateInfo {
  reason: 'jira-overdue' | 'jira-due-today' | 'jira-due-tomorrow';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const JIRA_STALE_WAITING_DAYS = 3;

function isStale(updatedAt: string | undefined, now: number): boolean {
  if (!updatedAt) return false;
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return false;
  return (now - parsed) / DAY_MS >= JIRA_STALE_WAITING_DAYS;
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

function mapPRReasons(prReasons: GitHubAttentionReason[], hasUnreadComments: boolean): AttentionReason[] {
  const reasons = prReasons.flatMap((reason) => {
    const mapped = mapGitHubReason(reason);
    return mapped ? [mapped] : [];
  });
  if (hasUnreadComments && !reasons.includes('pr-unread-comment')) {
    reasons.push('pr-unread-comment');
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
    reason === 'jira-review' || reason === 'pr-waiting-review' || reason === 'pr-needs-my-review')) {
    return 3;
  }
  return 4;
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
  const latestPRComment = prUnreadComments.reduce<ProviderCommentCandidate | null>(
    (latest, comment) => !latest || Date.parse(comment.createdAt) > Date.parse(latest.createdAt)
      ? comment
      : latest,
    null,
  );
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
    prUnreadCount: prAttentions.reduce((total, attention) => total + (attention?.unreadCount ?? 0), 0),
    prLatestUnreadComment: latestPRComment,
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
): AttentionInboxItem[] {
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
  const monitoredPRsByKey = new Map(
    [
      ...githubState.attention.myPRs,
      ...githubState.attention.teamPRs,
      ...githubState.attention.attentionInbox,
    ].map((item) => [prKey(item.pr.repoKey, item.pr.number), item.pr]),
  );
  const consumedPRs = new Set<string>();
  const items: AttentionInboxItem[] = [];

  for (const task of tasksByKey.values()) {
    if (!isMonitoredJiraTask(task, jiraState)) continue;

    const dueInfo = getDueDateInfo(task.dueDate, now);
    const jiraReasons: AttentionReason[] = [];
    if (task.status === 'Review') jiraReasons.push('jira-review');
    if ((task.commentAttention?.unreadCount ?? 0) > 0) jiraReasons.push('jira-unread-comment');
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
        const unreadCount = githubState.commentAttentionBySource[sourceKey]?.unreadCount ?? 0;
        return {
          pr,
          reasons: mapPRReasons(githubItem?.reasons ?? [], unreadCount > 0),
          unreadCount,
          latestUnreadComment: githubState.commentAttentionBySource[sourceKey]?.latestUnreadComment ?? null,
        };
      });
    const reasons = [...new Set([
      ...jiraReasons,
      ...relatedPRs.flatMap((relatedPR) => relatedPR.reasons),
    ])];
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
    const reasons = mapPRReasons(
      githubItem.reasons,
      (githubState.commentAttentionBySource[sourceKey]?.unreadCount ?? 0) > 0,
    );
    if (reasons.length > 0) {
      items.push(createInboxItem(undefined, githubItem.pr, reasons, githubState));
    }
  }

  return items.sort(compareItems);
}
