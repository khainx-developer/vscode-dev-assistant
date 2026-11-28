import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import type {
  FailedJobLog,
  FailedJobLogsResult,
  PullRequestCheckRun,
  PullRequestSummary,
} from '../../shared/githubTypes';
import { parseActionsRunId } from '../../shared/githubTypes';
import { extractCiFailure } from './ciLog';
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
  if (pr?.checkConclusions && Object.keys(pr.checkConclusions).length > 0) {
    return { ...pr.checkConclusions };
  }
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
    headSha: pr?.headSha ?? null,
    latestCommentIds: commentIds,
    unresolvedThreadCount: pr?.unresolvedThreadCount ?? 0,
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
  return pr.comments.map((comment) => {
    const thread: EvidenceThreadInput = {
      id: comment.id,
      url: comment.url,
      comments: [{
        author: comment.author,
        body: comment.body,
        url: comment.url,
        createdAt: comment.createdAt,
      }],
    };
    if (comment.path) {
      thread.path = comment.path;
    }
    if (comment.line !== undefined) {
      thread.line = comment.line;
    }
    return thread;
  });
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

function buildEvidenceInput(
  item: AttentionInboxItem,
  checks: EvidenceCheckInput[],
): BuildEvidenceInput {
  const pr = item.pr;
  const ticket = item.jiraTask;
  const input: BuildEvidenceInput = {
    threads: prCommentsAsThreads(pr),
    checks,
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

  return input;
}

/** Build analysis evidence from the inbox snapshot (no extra MCP fetches). */
export function buildEvidenceFromInboxItem(item: AttentionInboxItem): EvidenceBundle {
  return buildEvidence(buildEvidenceInput(item, checksFromPr(item.pr)));
}

export interface CiLogEvidencePorts {
  getCheckRuns(owner: string, repo: string, pullNumber: number): Promise<PullRequestCheckRun[]>;
  getFailedJobLogs(owner: string, repo: string, runId: string): Promise<FailedJobLogsResult>;
  includeCiLogs: boolean;
  ciLogsAvailable: boolean;
  log(line: string): void;
}

function isFailedCheck(run: PullRequestCheckRun): boolean {
  return run.conclusion === 'failure'
    || run.conclusion === 'timed_out'
    || run.conclusion === 'cancelled';
}

function degradedCheck(run: PullRequestCheckRun, reason: string): EvidenceCheckInput {
  const summaryParts = [
    run.summary?.trim() || null,
    reason,
  ].filter(Boolean);
  return {
    name: run.name,
    conclusion: run.conclusion,
    summary: summaryParts.join(' '),
    detailsUrl: run.detailsUrl,
  };
}

function failedTestLabels(logs: FailedJobLog[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const job of logs) {
    const extraction = extractCiFailure(job.content);
    for (const group of extraction.failedTests) {
      if (seen.has(group.name)) {
        continue;
      }
      seen.add(group.name);
      labels.push(group.name);
    }
  }
  return labels;
}

function excerptFromLogs(logs: FailedJobLog[]): string {
  return logs
    .map((job) => {
      const extraction = extractCiFailure(job.content);
      if (!extraction.excerpt.trim()) {
        return '';
      }
      return `Job ${job.jobName}\n${extraction.excerpt}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function matchLogsForCheck(check: PullRequestCheckRun, logsByRunId: Map<string, FailedJobLog[]>): FailedJobLog[] {
  const runId = parseActionsRunId(check.detailsUrl);
  if (!runId) {
    return [];
  }
  const logs = logsByRunId.get(runId) ?? [];
  if (logs.length === 0) {
    return [];
  }
  const byName = logs.filter((job) => job.jobName.toLowerCase() === check.name.toLowerCase());
  return byName.length > 0 ? byName : logs;
}

/**
 * Analyze-time evidence: fetch failing check runs and optional job logs.
 * Keeps buildEvidenceFromInboxItem pure (snapshot only).
 */
export async function buildEvidenceForAnalysis(
  item: AttentionInboxItem,
  ports: CiLogEvidencePorts,
): Promise<EvidenceBundle> {
  const pr = item.pr;
  if (!pr) {
    return buildEvidenceFromInboxItem(item);
  }

  const [owner, repo] = pr.repoKey.split('/');
  if (!owner || !repo) {
    return buildEvidenceFromInboxItem(item);
  }

  let checkRuns: PullRequestCheckRun[];
  try {
    checkRuns = await ports.getCheckRuns(owner, repo, pr.number);
  } catch (error) {
    const detail = error instanceof Error && error.message ? error.message : 'unknown error';
    ports.log(`[analysis] getCheckRuns failed for ${owner}/${repo}#${pr.number}: ${detail}`);
    return buildEvidenceFromInboxItem(item);
  }

  const failing = checkRuns.filter(isFailedCheck);
  if (failing.length === 0) {
    if (checkRuns.length === 0) {
      return buildEvidenceFromInboxItem(item);
    }
    return buildEvidence(buildEvidenceInput(item, checkRuns.map((run) => ({
      name: run.name,
      conclusion: run.conclusion,
      summary: run.summary,
      detailsUrl: run.detailsUrl,
    }))));
  }

  const canFetchLogs = ports.includeCiLogs && ports.ciLogsAvailable;
  const logsByRunId = new Map<string, FailedJobLog[]>();
  let logsFetchFailed = false;

  if (canFetchLogs) {
    const runIds = [...new Set(
      failing
        .map((check) => parseActionsRunId(check.detailsUrl))
        .filter((runId): runId is string => !!runId),
    )];
    for (const runId of runIds) {
      try {
        const result = await ports.getFailedJobLogs(owner, repo, runId);
        if (!result.ok) {
          logsFetchFailed = true;
          continue;
        }
        logsByRunId.set(runId, result.logs);
      } catch {
        logsFetchFailed = true;
      }
    }
  }

  const degradeReason = !ports.includeCiLogs
    ? 'Job logs: not loaded (CI log inclusion is off).'
    : !ports.ciLogsAvailable
      ? 'Job logs: not loaded (actions toolset unavailable).'
      : logsFetchFailed || [...logsByRunId.values()].every((logs) => logs.length === 0)
        ? 'Job logs: not loaded.'
        : null;

  const checks: EvidenceCheckInput[] = failing.map((check) => {
    if (degradeReason && (!canFetchLogs || matchLogsForCheck(check, logsByRunId).length === 0)) {
      return degradedCheck(check, degradeReason);
    }
    const matched = matchLogsForCheck(check, logsByRunId);
    if (matched.length === 0) {
      return degradedCheck(
        check,
        'Job logs: not loaded.',
      );
    }
    const excerpt = excerptFromLogs(matched);
    if (!excerpt.trim()) {
      return degradedCheck(
        check,
        'Job logs: loaded but no failure excerpt could be extracted.',
      );
    }
    return {
      name: check.name,
      conclusion: check.conclusion,
      summary: check.summary,
      detailsUrl: check.detailsUrl,
      logExcerpt: excerpt,
      failedTests: failedTestLabels(matched),
    };
  });

  return buildEvidence(buildEvidenceInput(item, checks));
}
