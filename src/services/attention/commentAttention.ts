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
  awaitingReply: boolean;
  latestAwaitingComment: ProviderCommentCandidate | null;
}

export interface CommentAttentionOptions {
  /** When true, a latest non-automation comment under {@link SHORT_REPLY_MAX_CHARS} chars does not count as awaiting reply. */
  ignoreShortReplies?: boolean;
  /**
   * When false, awaiting-reply is never set (e.g. Jira `currentUser` unset so every
   * comment has `isCurrentUser === false`). Default true.
   */
  enableAwaitingReply?: boolean;
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

/** Trimmed body length below this is "short" when `ignoreShortReplies` is on. */
export const SHORT_REPLY_MAX_CHARS = 15;

const EMPTY_SUMMARY: CommentAttentionSummary = {
  unreadCount: 0,
  latestUnreadAt: null,
  latestUnreadComment: null,
  awaitingReply: false,
  latestAwaitingComment: null,
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

function commentCreatedAt(comment: ProviderCommentCandidate): number {
  return Date.parse(comment.createdAt);
}

/**
 * Newest non-automation comment is from someone else (and optionally not a short reply).
 * Independent of seenAt / unread.
 */
export function computeAwaitingReply(
  comments: ProviderCommentCandidate[],
  options: CommentAttentionOptions = {},
): Pick<CommentAttentionSummary, 'awaitingReply' | 'latestAwaitingComment'> {
  if (options.enableAwaitingReply === false) {
    return { awaitingReply: false, latestAwaitingComment: null };
  }

  const humanComments = comments
    .filter((comment) => !isAutomationIdentity(comment.authorIdentity))
    .filter((comment) => Number.isFinite(commentCreatedAt(comment)))
    .slice()
    .sort((left, right) => commentCreatedAt(left) - commentCreatedAt(right));

  const latest = humanComments[humanComments.length - 1];
  if (!latest || latest.isCurrentUser) {
    return { awaitingReply: false, latestAwaitingComment: null };
  }

  if (
    options.ignoreShortReplies
    && latest.bodyText.trim().length < SHORT_REPLY_MAX_CHARS
  ) {
    return { awaitingReply: false, latestAwaitingComment: null };
  }

  return { awaitingReply: true, latestAwaitingComment: latest };
}

export function buildCommentAttention(
  comments: ProviderCommentCandidate[],
  seenAt: number | undefined,
  options: CommentAttentionOptions = {},
): CommentAttentionSummary {
  const awaiting = computeAwaitingReply(comments, options);

  if (seenAt === undefined) {
    return { ...EMPTY_SUMMARY, ...awaiting };
  }

  let unreadCount = 0;
  let latestUnreadAt: number | null = null;
  let latestUnreadComment: ProviderCommentCandidate | null = null;

  for (const comment of comments) {
    if (comment.isCurrentUser || isAutomationIdentity(comment.authorIdentity)) {
      continue;
    }

    const createdAt = commentCreatedAt(comment);
    if (!Number.isFinite(createdAt) || createdAt <= seenAt) {
      continue;
    }

    unreadCount += 1;
    if (latestUnreadAt === null || createdAt > latestUnreadAt) {
      latestUnreadAt = createdAt;
      latestUnreadComment = comment;
    }
  }

  return { unreadCount, latestUnreadAt, latestUnreadComment, ...awaiting };
}
