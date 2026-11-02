import { githubCommentSourceKey } from '../github/attentionEngine';
import { prKey } from '../github/lastSeenStore';
import type {
  AttentionReason as GitHubAttentionReason,
  GitHubViewState,
  PullRequestSummary,
} from '../github/types';
import type { JiraTask, JiraViewState } from '../jira/types';
import type { ProviderCommentCandidate } from '../attention/commentAttention';

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
  | 'pr-unread-comment';

export interface AttentionInboxItem {
  key: string;
  jiraTask?: JiraTask;
  pr?: PullRequestSummary;
  reasons: AttentionReason[];
  priority: 1 | 2 | 3 | 4;
  latestRelevantAt: string | null;
  jiraUnreadCount: number;
  jiraLatestUnreadComment: ProviderCommentCandidate | null;
  prUnreadCount: number;
  prLatestUnreadComment: ProviderCommentCandidate | null;
}

interface DueDateInfo {
  reason: 'jira-overdue' | 'jira-due-today' | 'jira-due-tomorrow';
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

function latestRelevantAt(
  task: JiraTask | undefined,
  pr: PullRequestSummary | undefined,
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
  if (pr) {
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
    reason === 'jira-overdue' || reason === 'pr-changes-requested' || reason === 'pr-checks-failing')) {
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
): AttentionInboxItem {
  const jiraSource = jiraTask ? jiraSourceKey(jiraTask) : undefined;
  const githubSource = pr ? githubCommentSourceKey(pr.repoKey, pr.number) : undefined;
  const jiraAttention = jiraTask?.commentAttention;
  const prAttention = githubSource ? githubState.commentAttentionBySource[githubSource] : undefined;
  return {
    key: jiraSource && githubSource
      ? `${jiraSource}|${githubSource}`
      : jiraSource ?? githubSource ?? '',
    jiraTask,
    pr,
    reasons,
    priority: getPriority(reasons),
    latestRelevantAt: latestRelevantAt(jiraTask, pr, githubState),
    jiraUnreadCount: jiraAttention?.unreadCount ?? 0,
    jiraLatestUnreadComment: jiraAttention?.latestUnreadComment ?? null,
    prUnreadCount: prAttention?.unreadCount ?? 0,
    prLatestUnreadComment: prAttention?.latestUnreadComment ?? null,
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
  for (const tasks of Object.values(jiraState.tasksByQuery)) {
    for (const task of tasks) {
      if (!tasksByKey.has(task.key)) tasksByKey.set(task.key, task);
    }
  }

  const githubItemsByKey = new Map(
    githubState.attention.attentionInbox.map((item) => [prKey(item.pr.repoKey, item.pr.number), item]),
  );
  const consumedPRs = new Set<string>();
  const items: AttentionInboxItem[] = [];

  for (const task of tasksByKey.values()) {
    const dueInfo = getDueDateInfo(task.dueDate, now);
    const jiraReasons: AttentionReason[] = [];
    if (task.status === 'Review') jiraReasons.push('jira-review');
    if ((task.commentAttention?.unreadCount ?? 0) > 0) jiraReasons.push('jira-unread-comment');
    if (dueInfo) jiraReasons.push(dueInfo.reason);

    const linkedPR = task.prLink.kind === 'linked' ? task.prLink.pr : undefined;
    const linkedPRKey = linkedPR ? prKey(linkedPR.repoKey, linkedPR.number) : undefined;
    const githubItem = linkedPRKey ? githubItemsByKey.get(linkedPRKey) : undefined;
    if (githubItem && linkedPR && linkedPRKey) {
      const githubSourceKey = githubCommentSourceKey(linkedPR.repoKey, linkedPR.number);
      const reasons = [
        ...jiraReasons,
        ...mapPRReasons(
          githubItem.reasons,
          (githubState.commentAttentionBySource[githubSourceKey]?.unreadCount ?? 0) > 0,
        ),
      ];
      if (reasons.length > 0) {
        items.push(createInboxItem(task, linkedPR, reasons, githubState));
        consumedPRs.add(linkedPRKey);
      }
    } else if (jiraReasons.length > 0) {
      items.push(createInboxItem(task, undefined, jiraReasons, githubState));
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
