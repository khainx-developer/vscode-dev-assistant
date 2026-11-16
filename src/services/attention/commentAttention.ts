export interface ProviderCommentCandidate {
  id: string;
  sourceKey: string;
  authorIdentity: string;
  bodyText: string;
  createdAt: string;
  url: string;
  isCurrentUser: boolean;
}

export interface CommentAttentionSummary {
  unreadCount: number;
  latestUnreadAt: number | null;
  latestUnreadComment: ProviderCommentCandidate | null;
}

/** Exact identities (case-insensitive) treated as automation / bots. */
const AUTOMATION_IDENTITIES = new Set([
  'automation for jira',
  'github-action',
  'github-actions',
  'copilot',
  'dependabot',
  'renovate',
  'renovate[bot]',
  'dependabot[bot]',
  'github-actions[bot]',
]);

const EMPTY_SUMMARY: CommentAttentionSummary = {
  unreadCount: 0,
  latestUnreadAt: null,
  latestUnreadComment: null,
};

/** True for known automation accounts and GitHub `…[bot]` authors (e.g. github-actions[bot]). */
export function isAutomationIdentity(author: string | null | undefined): boolean {
  const raw = String(author ?? '').trim().toLowerCase();
  if (!raw) return false;
  if (AUTOMATION_IDENTITIES.has(raw)) return true;
  if (raw.endsWith('[bot]')) return true;
  // github-actions[bot] → also match bare github-actions after stripping the suffix
  const bare = raw.replace(/\[bot\]$/u, '');
  return bare !== raw && AUTOMATION_IDENTITIES.has(bare);
}

export function buildCommentAttention(
  comments: ProviderCommentCandidate[],
  seenAt: number | undefined,
): CommentAttentionSummary {
  if (seenAt === undefined) {
    return { ...EMPTY_SUMMARY };
  }

  let unreadCount = 0;
  let latestUnreadAt: number | null = null;
  let latestUnreadComment: ProviderCommentCandidate | null = null;

  for (const comment of comments) {
    if (comment.isCurrentUser || isAutomationIdentity(comment.authorIdentity)) {
      continue;
    }

    const createdAt = Date.parse(comment.createdAt);
    if (!Number.isFinite(createdAt) || createdAt <= seenAt) {
      continue;
    }

    unreadCount += 1;
    if (latestUnreadAt === null || createdAt > latestUnreadAt) {
      latestUnreadAt = createdAt;
      latestUnreadComment = comment;
    }
  }

  return { unreadCount, latestUnreadAt, latestUnreadComment };
}
