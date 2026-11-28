import { createHash } from 'crypto';

export interface AnalysisStateSnapshot {
  itemKey: string;
  headSha: string | null;
  latestCommentIds: readonly string[];
  unresolvedThreadCount: number;
  reviewState: string | null;
  checkConclusions: Readonly<Record<string, string | null>>;
  jiraStatus: string | null;
}

function sortedCommentIds(ids: readonly string[]): string[] {
  return [...ids].map((id) => id.trim()).filter(Boolean).sort();
}

function sortedCheckConclusions(
  conclusions: Readonly<Record<string, string | null>>,
): Array<[string, string | null]> {
  return Object.keys(conclusions)
    .sort()
    .map((name) => [name, conclusions[name] ?? null]);
}

export function computeStateHash(state: AnalysisStateSnapshot): string {
  const payload = {
    itemKey: state.itemKey,
    headSha: state.headSha,
    latestCommentIds: sortedCommentIds(state.latestCommentIds),
    unresolvedThreadCount: state.unresolvedThreadCount,
    reviewState: state.reviewState,
    checkConclusions: sortedCheckConclusions(state.checkConclusions),
    jiraStatus: state.jiraStatus,
  };

  return createHash('sha256')
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
}
