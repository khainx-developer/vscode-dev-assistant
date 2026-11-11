import type { AttentionReason } from './attentionInboxBuilder';

export type ReasonTone = 'danger' | 'info' | 'warning' | 'success' | 'neutral';

export interface ReasonLabel {
  label: string;
  tone: ReasonTone;
  /** One short sentence an assistant (or a tooltip) can use to explain the flag. */
  explanation: string;
}

/**
 * Human-readable labels for every attention reason. Shared by the webviews (bundled by esbuild)
 * and by the AI prompt builders so the UI and the model describe items with the same words.
 */
export const REASON_LABELS: Record<AttentionReason, ReasonLabel> = {
  'pr-needs-my-review': { label: 'Needs your review', tone: 'warning', explanation: 'You are a requested reviewer on this pull request.' },
  'pr-waiting-review': { label: 'Waiting for review', tone: 'warning', explanation: 'The pull request is ready but has no review yet.' },
  'pr-changes-requested': { label: 'Changes requested', tone: 'danger', explanation: 'A reviewer requested changes.' },
  'pr-checks-failing': { label: 'Checks failing', tone: 'danger', explanation: 'CI checks are failing on the latest commit.' },
  'pr-merge-conflict': { label: 'Merge conflict', tone: 'danger', explanation: 'The branch conflicts with its base branch.' },
  'pr-stale': { label: 'Stale', tone: 'danger', explanation: 'No movement for 3 or more days while waiting.' },
  'pr-unread-comment': { label: 'Unread comment', tone: 'info', explanation: 'There are new comments you have not opened yet.' },
  'pr-linked': { label: 'Linked PR', tone: 'neutral', explanation: 'A monitored pull request references this ticket.' },
  'jira-review': { label: 'In review', tone: 'warning', explanation: 'The ticket is in the Review status.' },
  'jira-overdue': { label: 'Overdue', tone: 'danger', explanation: 'The due date has passed.' },
  'jira-due-today': { label: 'Due today', tone: 'warning', explanation: 'The ticket is due today.' },
  'jira-due-tomorrow': { label: 'Due tomorrow', tone: 'warning', explanation: 'The ticket is due tomorrow.' },
  'jira-unread-comment': { label: 'Unread comment', tone: 'info', explanation: 'There are new Jira comments you have not opened yet.' },
  'jira-stale': { label: 'Stale', tone: 'danger', explanation: 'In review for 3 or more days with no movement.' },
};

export function reasonLabel(reason: string): ReasonLabel {
  return (REASON_LABELS as Record<string, ReasonLabel>)[reason]
    ?? { label: reason.replace(/[-_]/g, ' '), tone: 'neutral', explanation: '' };
}
