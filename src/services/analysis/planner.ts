import type { AttentionInboxItem, AttentionReason } from '../attention/attentionInboxBuilder';

export const AUTO_ANALYSIS_BACKOFF_MS = 30 * 60 * 1000;

/** Reasons that qualify for automatic analysis even when priority is not urgent. */
export const IMPORTANT_AUTO_REASONS: ReadonlySet<AttentionReason> = new Set([
  'pr-unread-comment',
  'jira-unread-comment',
  'pr-mentioned',
  'jira-mentioned',
  'pr-needs-my-review',
  'pr-changes-requested',
  'pr-checks-failing',
]);

export interface PlanAutoAnalysisInput {
  items: readonly AttentionInboxItem[];
  /** True when a card-ready view exists for the item's current state hash. */
  hasCachedView: (item: AttentionInboxItem) => boolean;
  snoozedKeys: ReadonlySet<string>;
  /** Epoch ms of the last failed automatic attempt for this item, if any. */
  lastAutoFailureAt: (item: AttentionInboxItem) => number | undefined;
  maxAutoPerRefresh: number;
  now?: number;
}

export function isImportantForAutoAnalysis(item: AttentionInboxItem): boolean {
  if (item.priority === 1) {
    return true;
  }
  return item.reasons.some((reason) => IMPORTANT_AUTO_REASONS.has(reason));
}

/**
 * Picks inbox items for automatic analysis: important, not snoozed, no cached view
 * for the current hash, outside the failure backoff window. Highest priority first,
 * capped at maxAutoPerRefresh.
 */
export function planAutoAnalysis(input: PlanAutoAnalysisInput): AttentionInboxItem[] {
  const now = input.now ?? Date.now();
  const cap = Math.max(0, Math.floor(input.maxAutoPerRefresh));
  if (cap === 0 || input.items.length === 0) {
    return [];
  }

  const qualified = input.items.filter((item) => {
    if (input.snoozedKeys.has(item.key)) {
      return false;
    }
    if (!isImportantForAutoAnalysis(item)) {
      return false;
    }
    if (input.hasCachedView(item)) {
      return false;
    }
    const failedAt = input.lastAutoFailureAt(item);
    if (failedAt !== undefined && now - failedAt < AUTO_ANALYSIS_BACKOFF_MS) {
      return false;
    }
    return true;
  });

  qualified.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return 0;
  });

  return qualified.slice(0, cap);
}
