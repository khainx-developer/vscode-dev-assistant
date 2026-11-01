import type { PullRequestSummary } from '../github/types';

export function matchPullRequestForIssue(
  issueKey: string,
  prs: PullRequestSummary[],
): PullRequestSummary | undefined {
  const matches = prs.filter((pr) => pr.title.includes(issueKey));
  if (matches.length === 0) {
    return undefined;
  }
  return matches.reduce((latest, candidate) =>
    new Date(candidate.updatedAt) > new Date(latest.updatedAt) ? candidate : latest,
  );
}
