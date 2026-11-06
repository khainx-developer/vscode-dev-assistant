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

const AUTOMATION_IDENTITIES = new Set([
  'automation for jira',
  'github-action',
  'copilot',
]);

const EMPTY_SUMMARY: CommentAttentionSummary = {
  unreadCount: 0,
  latestUnreadAt: null,
  latestUnreadComment: null,
};

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
    if (comment.isCurrentUser || AUTOMATION_IDENTITIES.has(comment.authorIdentity.toLowerCase())) {
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
