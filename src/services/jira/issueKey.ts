/**
 * Extract a Jira issue key from a git branch name.
 * Case-insensitive, first match, uppercased; boundary-safe like
 * findPullRequestsForIssue (no partial keys inside longer tokens).
 */
export function extractIssueKey(branchName: string): string | undefined {
  const pattern = /[A-Z][A-Z0-9]+-\d+/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(branchName)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const before = start === 0 ? '' : branchName[start - 1]!;
    const after = end >= branchName.length ? '' : branchName[end]!;
    if ((before === '' || !/[A-Za-z0-9]/.test(before)) && (after === '' || !/[A-Za-z0-9]/.test(after))) {
      return match[0].toUpperCase();
    }
  }
  return undefined;
}
