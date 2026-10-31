import { AttentionItem, AttentionReason, GitHubAttentionResult, PullRequestSummary, ReviewState } from './types';
import { prKey } from './lastSeenStore';

function classifyReviewState(pr: PullRequestSummary): ReviewState {
  if (pr.reviews.length === 0) {
    return 'no_review_activity';
  }
  const latestByAuthor = new Map<string, (typeof pr.reviews)[number]>();
  for (const review of pr.reviews) {
    const existing = latestByAuthor.get(review.author);
    if (!existing || new Date(review.submittedAt) > new Date(existing.submittedAt)) {
      latestByAuthor.set(review.author, review);
    }
  }
  const states = [...latestByAuthor.values()].map((r) => r.state);
  if (states.includes('CHANGES_REQUESTED')) return 'changes_requested';
  if (states.includes('APPROVED')) return 'approved';
  return 'pending_review';
}

function computeReasonsForPr(
  pr: PullRequestSummary,
  isMine: boolean,
  isTeam: boolean,
  seenAt: number | undefined,
  me: string,
  now: number,
): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  const effectiveSeenAt = seenAt ?? now; // first-sight: never earlier than "now" -> nothing after it qualifies
  if (isMine) {
    const hasNewActivity =
      pr.comments.some((c) => new Date(c.createdAt).getTime() > effectiveSeenAt) ||
      pr.reviews.some((r) => new Date(r.submittedAt).getTime() > effectiveSeenAt);
    if (hasNewActivity) reasons.push('new_activity');
    if (pr.reviews.length === 0) reasons.push('waiting_for_review');
    if (pr.state === 'MERGED' && pr.mergedAt && new Date(pr.mergedAt).getTime() > effectiveSeenAt) {
      reasons.push('merged');
    }
  }
  if (isTeam) {
    const reviewedByMe = pr.reviews.some((r) => r.author === me);
    if (pr.requestedReviewers.includes(me) && !reviewedByMe) {
      reasons.push('needs_my_review');
    }
  }
  return reasons;
}

export const AttentionEngine = {
  computeAttentionState(
    prs: PullRequestSummary[],
    lastSeen: Map<string, number>,
    me: string,
    monitoredAuthors: string[],
    now: number,
  ): GitHubAttentionResult {
    const myPRs: AttentionItem[] = [];
    const teamPRs: AttentionItem[] = [];
    const attentionInbox: AttentionItem[] = [];

    for (const pr of prs) {
      const isMine = pr.author === me;
      const isTeam = !isMine && monitoredAuthors.includes(pr.author);
      if (!isMine && !isTeam) continue;

      const key = prKey(pr.repoKey, pr.number);
      const seenAt = lastSeen.get(key);
      const reviewState = classifyReviewState(pr);
      const reasons = computeReasonsForPr(pr, isMine, isTeam, seenAt, me, now);
      const item: AttentionItem = { pr, reviewState, reasons };

      if (isMine) myPRs.push(item);
      if (isTeam) teamPRs.push(item);
      if (reasons.length > 0) attentionInbox.push(item);
    }

    return { myPRs, teamPRs, attentionInbox };
  },
};
