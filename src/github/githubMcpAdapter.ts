import type { McpConnectionService } from '../mcp/connectionService';
import type { McpToolError } from '../mcp/types';
import type {
  GitHubSession,
  MonitoredAuthor,
  MonitoredRepo,
  PullRequestSummary,
  RateLimitStatus,
} from './types';

type RestUser = { login: string } | null;

type ListedPullRequest = {
  number: number;
  title: string;
  html_url: string;
  user: RestUser;
  state: 'open' | 'closed';
  draft: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  labels?: Array<{ name: string }>;
  requested_reviewers?: RestUser[];
};

type PullRequestDetail = { mergeable: boolean | null };
type PullRequestReview = { user: RestUser; state: string; submitted_at: string };
type PullRequestComment = { id: number | string; user: RestUser; body: string; created_at: string; html_url: string };
type CheckRun = { status: string; conclusion: string | null };
// GitHub's real "list check runs for a ref" REST endpoint returns `{total_count, check_runs:
// [...]}`, not a bare array — confirmed live ("checkRuns.some is not a function"), unlike
// list_pull_requests/get_reviews/get_comments, which the MCP server does return as bare arrays.
type CheckRunsResponse = CheckRun[] | { check_runs?: CheckRun[] };

function extractCheckRuns(response: CheckRunsResponse): CheckRun[] {
  return Array.isArray(response) ? response : (response.check_runs ?? []);
}

const KNOWN_ERROR_CATEGORIES: McpToolError['category'][] = ['auth-expired', 'rate-limited', 'invalid-entry', 'network'];

// src/github/errorClassifier.ts (untouched by this story) inspects a legacy {status, message,
// response.headers} shape, not a raw McpToolError — translate at this module's boundary so that
// classifier never has to change. NOTE: rate-limited maps to HTTP 403 + an
// x-ratelimit-remaining: '0' header (what ErrorClassifier.classify actually checks for), not 429
// — confirmed by reading errorClassifier.ts directly; 429 would silently misclassify as
// 'network' there (see DecisionLog.md's TASK-017 entry).
function toLegacyThrownShape(error: McpToolError): { status: number; message: string; response?: { headers: Record<string, string> } } {
  // `error` is usually an already-classified McpToolError, but a bug in our own adapter code
  // (e.g. parsing an unexpected MCP response shape) throws a plain Error/TypeError instead,
  // which has no `.category`/`.detail` — used to silently become `message: undefined` here and
  // "Unknown error" in the UI, the same blank-reason failure class already fixed for Jira (see
  // DecisionLog.md in stories/jira-configuration-sync). Fall back to the error's own message.
  if (typeof error?.category !== 'string' || !KNOWN_ERROR_CATEGORIES.includes(error.category)) {
    return { status: 0, message: (error as unknown as Error)?.message || 'Unknown error' };
  }
  if (error.category === 'rate-limited') {
    const headers: Record<string, string> = { 'x-ratelimit-remaining': '0' };
    if (error.resetAt) {
      headers['x-ratelimit-reset'] = String(Math.floor(new Date(error.resetAt).getTime() / 1000));
    }
    return { status: 403, message: error.detail, response: { headers } };
  }
  const status = error.category === 'auth-expired' ? 401 : error.category === 'invalid-entry' ? 400 : 0;
  return { status, message: error.detail };
}

// Every GitHub MCP tool result is the SDK's raw CallToolResult shape
// (`{ content: [{ type: 'text', text: '<json>' }] }`), not the already-parsed payload — same
// issue found and fixed for the Atlassian adapter (DecisionLog.md). Unlike Atlassian's tools,
// GitHub's `text` is the bare JSON payload (no extra `data` wrapper) — confirmed live via the
// diagnostic fetch logging (`"text":"[{\"number\":1201,...`).
function parseToolResultText<T>(result: unknown): T {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
  const text = content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Unexpected GitHub MCP tool result: no text content.');
  }
  return JSON.parse(text) as T;
}

async function callWithSessionFallback(
  connectionService: McpConnectionService,
  session: GitHubSession,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    await connectionService.connect('github', {
      extraHeaders: { Authorization: `Bearer ${session.accessToken}` },
    });
    return await connectionService.callTool('github', name, args);
  } catch (error) {
    if ((error as McpToolError)?.category !== 'auth-expired') {
      throw error;
    }
    await connectionService.connect('github');
    return await connectionService.callTool('github', name, args);
  }
}

function deriveCheckStatus(checkRuns: CheckRun[] | undefined): PullRequestSummary['checkStatus'] {
  if (!checkRuns || checkRuns.length === 0) {
    return null;
  }
  if (checkRuns.some((run) => run.status !== 'completed')) {
    return 'PENDING';
  }
  if (checkRuns.some((run) => run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'cancelled')) {
    return 'FAILURE';
  }
  return 'SUCCESS';
}

function mapReviewState(state: string): PullRequestSummary['reviews'][number]['state'] {
  const upper = state.toUpperCase();
  if (upper === 'APPROVED' || upper === 'CHANGES_REQUESTED' || upper === 'COMMENTED' || upper === 'PENDING') {
    return upper;
  }
  return 'PENDING';
}

function mapPullRequest(
  entry: ListedPullRequest,
  repoKey: string,
  detail: PullRequestDetail,
  reviews: PullRequestReview[] | undefined,
  comments: PullRequestComment[] | undefined,
  checkRuns: CheckRun[] | undefined,
  labelColors: Map<string, string>,
): PullRequestSummary {
  return {
    repoKey,
    number: entry.number,
    title: entry.title,
    url: entry.html_url,
    author: entry.user?.login ?? '',
    state: entry.state === 'open' ? 'OPEN' : entry.merged_at ? 'MERGED' : 'CLOSED',
    mergedAt: entry.merged_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    mergeable: detail.mergeable === true ? 'MERGEABLE' : detail.mergeable === false ? 'CONFLICTING' : 'UNKNOWN',
    labels: (entry.labels ?? []).map((label) => ({ name: label.name, color: labelColors.get(label.name) ?? '' })),
    checkStatus: deriveCheckStatus(checkRuns),
    reviews: (reviews ?? []).map((review) => ({
      author: review.user?.login ?? '',
      state: mapReviewState(review.state),
      submittedAt: review.submitted_at,
    })),
    comments: (comments ?? []).map((comment) => ({
      id: String(comment.id),
      author: comment.user?.login ?? '',
      body: comment.body ?? '',
      createdAt: comment.created_at,
      url: comment.html_url,
    })),
    requestedReviewers: (entry.requested_reviewers ?? [])
      .map((reviewer) => reviewer?.login)
      .filter((login): login is string => login !== undefined && login !== null),
  };
}

export const GithubMcpAdapter = {
  async validateRepo(
    connectionService: McpConnectionService,
    repo: MonitoredRepo,
    session: GitHubSession,
  ): Promise<boolean> {
    try {
      await callWithSessionFallback(connectionService, session, 'list_pull_requests', {
        owner: repo.owner,
        repo: repo.repo,
      });
      return true;
    } catch (error) {
      if ((error as McpToolError)?.category === 'invalid-entry') {
        return false;
      }
      throw error;
    }
  },

  async validateAuthor(
    connectionService: McpConnectionService,
    author: MonitoredAuthor,
    session: GitHubSession,
  ): Promise<boolean> {
    const result = parseToolResultText<{ items?: Array<{ login: string }> }>(
      await callWithSessionFallback(connectionService, session, 'search_users', {
        query: `${author.username} in:login`,
      }),
    );
    const users = result.items ?? [];
    return users.some((user) => user.login.toLowerCase() === author.username.toLowerCase());
  },

  async fetchOpenPullRequests(
    connectionService: McpConnectionService,
    repo: MonitoredRepo,
    session: GitHubSession,
  ): Promise<PullRequestSummary[]> {
    try {
      return await fetchOpenPullRequestsImpl(connectionService, repo, session);
    } catch (error) {
      throw toLegacyThrownShape(error as McpToolError);
    }
  },

  async getRateLimitStatus(connectionService: McpConnectionService, session: GitHubSession): Promise<RateLimitStatus> {
    // No read-only rate-limit/quota tool is documented for the official GitHub MCP server
    // (confirmed best-effort via its public README, not a live `tools/list` call — see
    // DecisionLog.md). Matches GitHubViewController's existing behavior of inferring rate
    // limits from a fetch failure's `resetAt`, never from this method (TASK-017 must not add a
    // new caller).
    void connectionService;
    void session;
    return { remaining: Infinity, resetAt: new Date(0).toISOString() };
  },
};

async function fetchOpenPullRequestsImpl(
  connectionService: McpConnectionService,
  repo: MonitoredRepo,
  session: GitHubSession,
): Promise<PullRequestSummary[]> {
  const repoKey = `${repo.owner}/${repo.repo}`;
  const listed = parseToolResultText<ListedPullRequest[]>(
    await callWithSessionFallback(connectionService, session, 'list_pull_requests', {
      owner: repo.owner,
      repo: repo.repo,
      state: 'open',
    }),
  );
  const nonDraft = listed.filter((entry) => !entry.draft);

  const details = await Promise.all(
    nonDraft.map(async (entry) => {
      const [detail, reviews, comments, checkRuns] = await Promise.all([
        callWithSessionFallback(connectionService, session, 'pull_request_read', {
          owner: repo.owner,
          repo: repo.repo,
          pullNumber: entry.number,
          method: 'get',
        }).then((result) => parseToolResultText<PullRequestDetail>(result)),
        callWithSessionFallback(connectionService, session, 'pull_request_read', {
          owner: repo.owner,
          repo: repo.repo,
          pullNumber: entry.number,
          method: 'get_reviews',
        }).then((result) => parseToolResultText<PullRequestReview[]>(result)),
        callWithSessionFallback(connectionService, session, 'pull_request_read', {
          owner: repo.owner,
          repo: repo.repo,
          pullNumber: entry.number,
          method: 'get_comments',
        }).then((result) => parseToolResultText<PullRequestComment[]>(result)),
        callWithSessionFallback(connectionService, session, 'pull_request_read', {
          owner: repo.owner,
          repo: repo.repo,
          pullNumber: entry.number,
          method: 'get_check_runs',
        }).then((result) => extractCheckRuns(parseToolResultText<CheckRunsResponse>(result))),
      ]);
      return { entry, detail, reviews, comments, checkRuns };
    }),
  );

  const uniqueLabelNames = [...new Set(nonDraft.flatMap((entry) => (entry.labels ?? []).map((label) => label.name)))];
  const labelColorEntries = await Promise.all(
    uniqueLabelNames.map(async (name) => {
      const label = parseToolResultText<{ color: string }>(
        await callWithSessionFallback(connectionService, session, 'get_label', {
          owner: repo.owner,
          repo: repo.repo,
          name,
        }),
      );
      return [name, label.color] as const;
    }),
  );
  const labelColors = new Map(labelColorEntries);

  return details.map(({ entry, detail, reviews, comments, checkRuns }) =>
    mapPullRequest(entry, repoKey, detail, reviews, comments, checkRuns, labelColors),
  );
}
