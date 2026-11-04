import type { PullRequestSummary } from '../github/types';

export function findPullRequestsForIssue(
  issueKey: string,
  prs: PullRequestSummary[],
): PullRequestSummary[] {
  const escapedIssueKey = issueKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const issueKeyPattern = new RegExp(`(^|[^A-Z0-9])${escapedIssueKey}($|[^A-Z0-9])`, 'i');
  return prs
    .filter((pr) => issueKeyPattern.test(pr.title) || issueKeyPattern.test(pr.headRef ?? ''))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function matchPullRequestForIssue(
  issueKey: string,
  prs: PullRequestSummary[],
): PullRequestSummary | undefined {
  const matches = findPullRequestsForIssue(issueKey, prs);
  if (matches.length === 0) {
    return undefined;
  }
  return matches[0];
}
