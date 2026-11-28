import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import type { ActionKind, Finding } from './types';
import type { AnalysisStateSnapshot } from './stateHash';

export type ActionTrackStatus = 'open' | 'progress' | 'done' | 'dropped';

export interface ActionTrackerIdentity {
  githubLogin: string | null;
  jiraName: string | null;
}

export interface TrackableAction {
  kind: ActionKind;
  actionKey: string;
  findings?: Finding[];
}

export interface TrackActionsInput {
  actions: readonly TrackableAction[];
  snapshot: AnalysisStateSnapshot;
  item: AttentionInboxItem;
  identity: ActionTrackerIdentity;
}

/** Evidence ids encoded in an actionKey (`kind:id1,id2`). */
export function evidenceIdsFromActionKey(actionKey: string): string[] {
  const idx = actionKey.indexOf(':');
  if (idx < 0) return [];
  const rest = actionKey.slice(idx + 1);
  return rest ? rest.split(',').filter(Boolean) : [];
}

/** Check run names from `check:<name>` evidence ids in an actionKey. */
export function checkNamesFromActionKey(actionKey: string): string[] {
  return [...new Set(
    evidenceIdsFromActionKey(actionKey)
      .filter((id) => id.startsWith('check:'))
      .map((id) => id.slice('check:'.length))
      .filter(Boolean),
  )];
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function isSuccessConclusion(value: string | null | undefined): boolean {
  return norm(value) === 'success';
}

function itemIsClosedOrMerged(item: AttentionInboxItem): boolean {
  const pr = item.pr;
  if (pr && (pr.state === 'CLOSED' || pr.state === 'MERGED' || pr.mergedAt)) {
    return true;
  }
  const category = item.jiraTask?.statusCategory;
  if (category?.key?.trim().toLowerCase() === 'done' || category?.name?.trim().toLowerCase() === 'done') {
    return true;
  }
  return false;
}

function hasNewerCommentByYou(
  item: AttentionInboxItem,
  snapshot: AnalysisStateSnapshot,
  identity: ActionTrackerIdentity,
): boolean {
  const known = new Set(snapshot.latestCommentIds);
  const github = norm(identity.githubLogin);
  const jira = norm(identity.jiraName);

  if (github) {
    for (const comment of item.pr?.comments ?? []) {
      if (norm(comment.author) === github && !known.has(comment.id)) {
        return true;
      }
    }
  }
  if (jira) {
    for (const comment of item.jiraTask?.comments ?? []) {
      if (norm(comment.author) === jira && !known.has(comment.id)) {
        return true;
      }
    }
  }
  return false;
}

function headShaChanged(item: AttentionInboxItem, snapshot: AnalysisStateSnapshot): boolean {
  const current = item.pr?.headSha ?? null;
  return current !== null && snapshot.headSha !== null && current !== snapshot.headSha;
}

function allNamedChecksSucceeded(
  action: TrackableAction,
  item: AttentionInboxItem,
): boolean {
  const names = checkNamesFromActionKey(action.actionKey);
  // No check:<name> evidence → cannot auto-complete; stays open (manual done only).
  if (names.length === 0) {
    return false;
  }
  const conclusions = item.pr?.checkConclusions ?? {};
  return names.every((name) => isSuccessConclusion(conclusions[name]));
}

function youHaveReview(item: AttentionInboxItem, identity: ActionTrackerIdentity): boolean {
  const github = norm(identity.githubLogin);
  if (!github || !item.pr) return false;
  return item.pr.reviews.some((review) => norm(review.author) === github && review.state !== 'PENDING');
}

function currentReviewState(item: AttentionInboxItem): string | null {
  if (!item.pr) return null;
  if (item.pr.reviews.length === 0) {
    return item.pr.requestedReviewers.length > 0 ? 'pending_review' : 'no_review_activity';
  }
  const latestByAuthor = new Map<string, (typeof item.pr.reviews)[number]>();
  for (const review of item.pr.reviews) {
    const existing = latestByAuthor.get(review.author);
    if (!existing || new Date(review.submittedAt) > new Date(existing.submittedAt)) {
      latestByAuthor.set(review.author, review);
    }
  }
  const states = [...latestByAuthor.values()].map((review) => review.state);
  if (states.includes('CHANGES_REQUESTED')) return 'changes_requested';
  if (states.includes('APPROVED')) return 'approved';
  return 'pending_review';
}

function codeChangeDone(item: AttentionInboxItem, snapshot: AnalysisStateSnapshot): boolean {
  const unresolved = item.pr?.unresolvedThreadCount ?? 0;
  if (unresolved === 0 && snapshot.unresolvedThreadCount > 0) {
    return true;
  }
  const reviewState = currentReviewState(item);
  return snapshot.reviewState === 'changes_requested' && reviewState !== 'changes_requested';
}

/**
 * Overlay manual done marks onto engine statuses. Marks for unknown actionKeys are ignored.
 * Dropped actions stay dropped.
 */
export function applyManualDoneMarks(
  statuses: Record<string, ActionTrackStatus>,
  manualDoneActionKeys: ReadonlySet<string>,
): Record<string, ActionTrackStatus> {
  if (manualDoneActionKeys.size === 0) return statuses;
  const next: Record<string, ActionTrackStatus> = { ...statuses };
  for (const actionKey of manualDoneActionKeys) {
    if (!(actionKey in next)) continue;
    if (next[actionKey] === 'dropped') continue;
    next[actionKey] = 'done';
  }
  return next;
}

/**
 * Per-action progress from the analysed snapshot vs the current inbox item.
 * Manual marks are applied separately via applyManualDoneMarks.
 */
export function trackActions(input: TrackActionsInput): Record<string, ActionTrackStatus> {
  const result: Record<string, ActionTrackStatus> = {};
  if (itemIsClosedOrMerged(input.item)) {
    for (const action of input.actions) {
      result[action.actionKey] = 'dropped';
    }
    return result;
  }

  for (const action of input.actions) {
    result[action.actionKey] = trackOne(action, input);
  }
  return result;
}

function trackOne(action: TrackableAction, input: TrackActionsInput): ActionTrackStatus {
  switch (action.kind) {
    case 'answer-question':
    case 'reply':
      return hasNewerCommentByYou(input.item, input.snapshot, input.identity) ? 'done' : 'open';
    case 'code-change': {
      if (codeChangeDone(input.item, input.snapshot)) return 'done';
      if (headShaChanged(input.item, input.snapshot)) return 'progress';
      return 'open';
    }
    case 'fix-ci': {
      if (allNamedChecksSucceeded(action, input.item)) return 'done';
      if (headShaChanged(input.item, input.snapshot)) return 'progress';
      return 'open';
    }
    case 'review-context':
      return youHaveReview(input.item, input.identity) ? 'done' : 'open';
    case 'decide':
    case 'follow-up':
    case 'none':
      return 'open';
    default:
      return 'open';
  }
}
