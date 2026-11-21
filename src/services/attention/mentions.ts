export interface MentionIdentities {
  githubLogin?: string | null;
  jiraAccountId?: string | null;
  jiraDisplayName?: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `@login` on a word boundary; case-insensitive. Rejects `@loginx` and `a@login.com`. */
function mentionsGithubLogin(text: string, githubLogin: string): boolean {
  const login = githubLogin.trim();
  if (!login) return false;
  const pattern = new RegExp(`(?<![A-Za-z0-9_])@${escapeRegExp(login)}(?![A-Za-z0-9_])`, 'i');
  return pattern.test(text);
}

/**
 * Prefer accountId when it appears in the text (e.g. `[~accountid:…]`).
 * Otherwise match `@Display Name` by display name only.
 */
function mentionsJiraUser(
  text: string,
  jiraAccountId: string | null | undefined,
  jiraDisplayName: string | null | undefined,
): boolean {
  const accountId = jiraAccountId?.trim() ?? '';
  if (accountId && text.includes(accountId)) {
    return true;
  }

  const displayName = jiraDisplayName?.trim() ?? '';
  if (!displayName) return false;
  const pattern = new RegExp(
    `(?<![A-Za-z0-9_])@${escapeRegExp(displayName)}(?![A-Za-z0-9_])`,
    'i',
  );
  return pattern.test(text);
}

/** True when `text` mentions the user via GitHub login and/or Jira account id / display name. */
export function mentionsUser(text: string, identities: MentionIdentities): boolean {
  if (typeof text !== 'string' || !text) {
    return false;
  }
  if (identities.githubLogin && mentionsGithubLogin(text, identities.githubLogin)) {
    return true;
  }
  return mentionsJiraUser(text, identities.jiraAccountId, identities.jiraDisplayName);
}
