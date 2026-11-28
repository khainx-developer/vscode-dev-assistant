import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import type { PullRequestSummary } from '../../shared/githubTypes';
import {
  buildEvidence,
  type BuildEvidenceInput,
  type EvidenceBundle,
  type EvidenceCheckInput,
  type EvidenceThreadInput,
} from './evidence';
import { computeStateHash, type AnalysisStateSnapshot } from './stateHash';

export function analysisItemKey(item: AttentionInboxItem): string {
  if (item.jiraTask?.key) {
    return item.jiraTask.key;
  }
  if (item.pr) {
    return `${item.pr.repoKey}#${item.pr.number}`;
  }
  return item.key;
}

function reviewStateFor(pr: PullRequestSummary): string | null {
  if (pr.reviews.length === 0) {
    return pr.requestedReviewers.length > 0 ? 'pending_review' : 'no_review_activity';
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

function checkConclusionsFor(pr: PullRequestSummary | undefined): Record<string, string | null> {
  if (!pr?.checkStatus) {
    return {};
  }
  return { overall: pr.checkStatus };
}

export function analysisStateFromInboxItem(item: AttentionInboxItem): AnalysisStateSnapshot {
  const pr = item.pr;
  const commentIds = [
    ...(pr?.comments ?? []).map((comment) => comment.id),
    ...(item.jiraTask?.comments ?? []).map((comment) => comment.id),
  ];
  return {
    itemKey: analysisItemKey(item),
    headSha: null,
    latestCommentIds: commentIds,
    unresolvedThreadCount: 0,
    reviewState: pr ? reviewStateFor(pr) : null,
    checkConclusions: checkConclusionsFor(pr),
    jiraStatus: item.jiraTask?.status ?? null,
  };
}

export function computeInboxItemStateHash(item: AttentionInboxItem): string {
  return computeStateHash(analysisStateFromInboxItem(item));
}

function prCommentsAsThreads(pr: PullRequestSummary | undefined): EvidenceThreadInput[] {
  if (!pr?.comments?.length) {
    return [];
  }
  return pr.comments.map((comment) => ({
    id: comment.id,
    url: comment.url,
    comments: [{
      author: comment.author,
      body: comment.body,
      url: comment.url,
      createdAt: comment.createdAt,
    }],
  }));
}

function checksFromPr(pr: PullRequestSummary | undefined): EvidenceCheckInput[] {
  if (!pr?.checkStatus) {
    return [];
  }
  if (pr.checkStatus !== 'FAILURE' && pr.checkStatus !== 'ERROR') {
    return [{
      name: 'checks',
      conclusion: pr.checkStatus.toLowerCase(),
    }];
  }
  return [{
    name: 'checks',
    conclusion: pr.checkStatus.toLowerCase(),
    summary: `Overall check status is ${pr.checkStatus}. Detailed job logs were not loaded for this analysis.`,
  }];
}

/** Build analysis evidence from the inbox snapshot (no extra MCP fetches). */
export function buildEvidenceFromInboxItem(item: AttentionInboxItem): EvidenceBundle {
  const pr = item.pr;
  const ticket = item.jiraTask;
  const input: BuildEvidenceInput = {
    threads: prCommentsAsThreads(pr),
    checks: checksFromPr(pr),
  };

  if (pr) {
    input.pr = {
      repoKey: pr.repoKey,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author: pr.author,
      reviewState: reviewStateFor(pr) ?? undefined,
      requestedReviewers: pr.requestedReviewers,
      checkStatus: pr.checkStatus,
    };
  }

  if (ticket) {
    input.ticket = {
      key: ticket.key,
      summary: ticket.summary,
      url: ticket.url,
      status: ticket.status,
      assignee: ticket.assignee,
      acceptanceCriteria: ticket.acceptanceCriteria,
      comments: (ticket.comments ?? []).map((comment) => ({
        author: comment.author,
        body: comment.body,
        createdAt: comment.createdAt,
        url: ticket.url,
      })),
    };
  }

  return buildEvidence(input);
}
