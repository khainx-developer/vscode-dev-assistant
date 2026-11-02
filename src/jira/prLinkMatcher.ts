import type { PullRequestSummary } from '../github/types';

export function matchPullRequestForIssue(
  issueKey: string,
  prs: PullRequestSummary[],
): PullRequestSummary | undefined {
  const escapedIssueKey = issueKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const issueKeyPattern = new RegExp(`(^|[^A-Z0-9])${escapedIssueKey}($|[^A-Z0-9])`, 'i');
  const matches = prs.filter((pr) => issueKeyPattern.test(pr.title) || issueKeyPattern.test(pr.headRef ?? ''));
  if (matches.length === 0) {
    return undefined;
  }
  return matches.reduce((latest, candidate) =>
    new Date(candidate.updatedAt) > new Date(latest.updatedAt) ? candidate : latest,
  );
}
