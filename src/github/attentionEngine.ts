import type { CommentAttentionSummary } from '../attention/commentAttention';
import { AttentionItem, AttentionReason, GitHubAttentionResult, PullRequestSummary, ReviewState } from './types';
import { prKey } from './lastSeenStore';

export function githubCommentSourceKey(repoKey: string, number: number): string {
  return `github:${prKey(repoKey, number)}`;
}

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
  const states = [...latestByAuthor.values()].map((review) => review.state);
  if (states.includes('CHANGES_REQUESTED')) return 'changes_requested';
  if (states.includes('APPROVED')) return 'approved';
  return 'pending_review';
}

function computeReasonsForPr(
  pr: PullRequestSummary,
  isMine: boolean,
  isTeam: boolean,
  me: string,
  commentAttention: CommentAttentionSummary | undefined,
): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  const hasUnreadComments = (commentAttention?.unreadCount ?? 0) > 0;
  const normalizedMe = me.toLowerCase();
  if (isMine) {
    if (classifyReviewState(pr) === 'changes_requested') reasons.push('pr-changes-requested');
    if (pr.checkStatus === 'FAILURE' || pr.checkStatus === 'ERROR') reasons.push('pr-checks-failing');
    if (hasUnreadComments) reasons.push('pr-unread-comment');
  }
  if (isTeam) {
    if (hasUnreadComments) reasons.push('pr-unread-comment');
    const reviewedByMe = pr.reviews.some((review) => review.author.toLowerCase() === normalizedMe);
    const needsMyReview = pr.requestedReviewers.some(
      (reviewer) => reviewer.toLowerCase() === normalizedMe,
    ) && !reviewedByMe;
    if (needsMyReview) {
      reasons.push('pr-needs-my-review');
    }
  }
  if (isMine && pr.reviews.length === 0) {
    reasons.push('pr-waiting-review');
  }
  return reasons;
}

export const AttentionEngine = {
  computeAttentionState(
    prs: PullRequestSummary[],
    reviewLastSeen: Map<string, number>,
    me: string,
    monitoredAuthors: string[],
    now: number,
    commentAttentionBySource: Map<string, CommentAttentionSummary>,
  ): GitHubAttentionResult {
    void reviewLastSeen;
    void now;
    const myPRs: AttentionItem[] = [];
    const teamPRs: AttentionItem[] = [];
    const attentionInbox: AttentionItem[] = [];

    for (const pr of prs) {
      const author = pr.author.toLowerCase();
      const normalizedMe = me.toLowerCase();
      const isMine = author === normalizedMe;
      const isTeam = !isMine && !pr.draft
        && monitoredAuthors.some((monitoredAuthor) => monitoredAuthor.toLowerCase() === author);
      if ((!isMine && !isTeam) || pr.state !== 'OPEN') continue;

      const commentAttention = commentAttentionBySource.get(githubCommentSourceKey(pr.repoKey, pr.number));
      const reviewState = classifyReviewState(pr);
      const reasons = computeReasonsForPr(pr, isMine, isTeam, me, commentAttention);
      const item: AttentionItem = { pr, reviewState, reasons };
      if (isMine) myPRs.push(item);
      if (isTeam) teamPRs.push(item);
      if (reasons.length > 0) attentionInbox.push(item);
    }

    return { myPRs, teamPRs, attentionInbox };
  },
};
