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
  head?: { ref?: string | null } | null;
  html_url: string;
  user: RestUser;
  state: 'open' | 'closed';
  draft: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  labels?: Array<{ name?: string } | string | null>;
  requested_reviewers?: RestUser[];
};

type PullRequestDetail = { mergeable: boolean | null };
type PullRequestReview = { user: RestUser; state: string; submitted_at: string };
type PullRequestComment = { id: number | string; user: RestUser; body: string; created_at: string; html_url: string };
type CachedPullRequestDetails = {
  updatedAt: string;
  detail: PullRequestDetail;
  reviews: PullRequestReview[];
  comments: PullRequestComment[];
};
type CheckRun = { status: string; conclusion: string | null };
// GitHub's real "list check runs for a ref" REST endpoint returns `{total_count, check_runs:
// [...]}`, not a bare array — confirmed live ("checkRuns.some is not a function"), unlike
// list_pull_requests/get_reviews/get_comments, which the MCP server does return as bare arrays.
type CheckRunsResponse = CheckRun[] | { check_runs?: CheckRun[] };

const pullRequestDetailsCache = new Map<string, CachedPullRequestDetails>();
const labelColorCache = new Map<string, string>();
const inFlightRepoFetches = new Map<string, Promise<PullRequestSummary[]>>();
const MAX_CONCURRENT_GITHUB_CALLS = 4;
const INITIAL_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
const MAX_RATE_LIMIT_BACKOFF_MS = 60 * 60 * 1000;
let rateLimitedUntil: number | undefined;
let rateLimitBackoffMs = INITIAL_RATE_LIMIT_BACKOFF_MS;
let activeGitHubCalls = 0;
const queuedGitHubCalls: Array<() => void> = [];

function extractCheckRuns(response: CheckRunsResponse): CheckRun[] {
  return Array.isArray(response) ? response : (response.check_runs ?? []);
}

function getLabelName(label: { name?: string } | string | null): string | undefined {
  const name = typeof label === 'string' ? label : label?.name;
  return typeof name === 'string' && name.trim() ? name : undefined;
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

function registerRateLimit(error: Partial<McpToolError>): McpToolError {
  const now = Date.now();
  const parsedResetAt = error.resetAt ? Date.parse(error.resetAt) : NaN;
  const reportedResetAt = Number.isFinite(parsedResetAt) ? parsedResetAt : undefined;
  if (rateLimitedUntil === undefined || rateLimitedUntil <= now) {
    rateLimitedUntil = reportedResetAt ?? now + rateLimitBackoffMs;
    if (reportedResetAt === undefined) {
      rateLimitBackoffMs = Math.min(rateLimitBackoffMs * 2, MAX_RATE_LIMIT_BACKOFF_MS);
    }
  } else if (reportedResetAt !== undefined) {
    rateLimitedUntil = Math.max(rateLimitedUntil, reportedResetAt);
  }

  return {
    serverId: 'github',
    category: 'rate-limited',
    detail: error.detail ?? 'GitHub rate limit exceeded.',
    resetAt: error.resetAt && reportedResetAt !== undefined
      ? error.resetAt
      : new Date(rateLimitedUntil).toISOString(),
  };
}

async function withGitHubRequestSlot<T>(request: () => Promise<T>): Promise<T> {
  if (activeGitHubCalls >= MAX_CONCURRENT_GITHUB_CALLS) {
    await new Promise<void>((resolve) => queuedGitHubCalls.push(resolve));
  } else {
    activeGitHubCalls++;
  }

  try {
    return await request();
  } finally {
    const next = queuedGitHubCalls.shift();
    if (next) {
      next();
    } else {
      activeGitHubCalls--;
    }
  }
}

async function callGitHubTool(
  connectionService: McpConnectionService,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return withGitHubRequestSlot(async () => {
    if (rateLimitedUntil !== undefined && Date.now() < rateLimitedUntil) {
      throw {
        serverId: 'github',
        category: 'rate-limited',
        detail: 'GitHub requests are paused during the rate-limit cooldown.',
        resetAt: new Date(rateLimitedUntil).toISOString(),
      } satisfies McpToolError;
    }
    try {
      return await connectionService.callTool('github', name, args);
    } catch (error) {
      if ((error as McpToolError)?.category === 'rate-limited') {
        throw registerRateLimit(error as Partial<McpToolError>);
      }
      throw error;
    }
  });
}

// Every GitHub MCP tool result is the SDK's raw CallToolResult shape
// (`{ content: [{ type: 'text', text: '<json>' }] }`), not the already-parsed payload — same
// issue found and fixed for the Atlassian adapter (DecisionLog.md). Unlike Atlassian's tools,
// GitHub's `text` is the bare JSON payload (no extra `data` wrapper) — confirmed live via the
// diagnostic fetch logging (`"text":"[{\"number\":1201,...`).
function parseToolResultText<T>(result: unknown): T {
  const toolResult = result as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
  const content = toolResult?.content;
  const text = content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Unexpected GitHub MCP tool result: no text content.');
  }
  if (toolResult.isError) {
    throw new Error(text);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`GitHub MCP tool returned non-JSON text: ${text}`);
  }
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
    return await callGitHubTool(connectionService, name, args);
  } catch (error) {
    if ((error as McpToolError)?.category !== 'auth-expired') {
      throw error;
    }
    await connectionService.connect('github');
    return await callGitHubTool(connectionService, name, args);
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
    headRef: entry.head?.ref ?? undefined,
    url: entry.html_url,
    author: entry.user?.login ?? '',
    state: entry.state === 'open' ? 'OPEN' : entry.merged_at ? 'MERGED' : 'CLOSED',
    draft: entry.draft,
    mergedAt: entry.merged_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    mergeable: detail.mergeable === true ? 'MERGEABLE' : detail.mergeable === false ? 'CONFLICTING' : 'UNKNOWN',
    labels: (entry.labels ?? []).flatMap((label) => {
      const name = getLabelName(label);
      return name ? [{ name, color: labelColors.get(name) ?? '' }] : [];
    }),
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
    if (rateLimitedUntil !== undefined && Date.now() < rateLimitedUntil) {
      throw toLegacyThrownShape({
        serverId: 'github',
        category: 'rate-limited',
        detail: 'GitHub requests are paused during the rate-limit cooldown.',
        resetAt: new Date(rateLimitedUntil).toISOString(),
      });
    }

    const repoKey = `${repo.owner}/${repo.repo}`;
    const fetchKey = `${session.username}:${repoKey}`;
    let fetchPromise = inFlightRepoFetches.get(fetchKey);
    if (!fetchPromise) {
      fetchPromise = fetchOpenPullRequestsImpl(connectionService, repo, session).then(
        (pullRequests) => {
          if (rateLimitedUntil === undefined || Date.now() >= rateLimitedUntil) {
            rateLimitedUntil = undefined;
            rateLimitBackoffMs = INITIAL_RATE_LIMIT_BACKOFF_MS;
          }
          return pullRequests;
        },
        (error: unknown) => {
          const mcpError = error as Partial<McpToolError>;
          if (mcpError?.category === 'rate-limited') {
            throw toLegacyThrownShape(registerRateLimit(mcpError));
          }
          throw toLegacyThrownShape(error as McpToolError);
        },
      );
      inFlightRepoFetches.set(fetchKey, fetchPromise);
    }

    try {
      return await fetchPromise;
    } finally {
      if (inFlightRepoFetches.get(fetchKey) === fetchPromise) {
        inFlightRepoFetches.delete(fetchKey);
      }
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
}

async function fetchAllPullRequestComments(
  connectionService: McpConnectionService,
  repo: MonitoredRepo,
  session: GitHubSession,
  pullNumber: number,
): Promise<PullRequestComment[]> {
  const comments: PullRequestComment[] = [];
  for (let page = 1; ; page += 1) {
    const pageComments = parseToolResultText<PullRequestComment[]>(
      await callWithSessionFallback(connectionService, session, 'pull_request_read', {
        owner: repo.owner,
        repo: repo.repo,
        pullNumber,
        method: 'get_comments',
        page,
        perPage: 100,
      }),
    );
    if (!Array.isArray(pageComments)) {
      throw new Error('GitHub MCP get_comments result must be an array.');
    }

    comments.push(...pageComments);
    if (pageComments.length < 100) {
      return comments;
    }
  }
}

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
  const activeDetailsKeys = new Set(listed.map((entry) => `${session.username}:${repoKey}#${entry.number}`));
  const detailsCachePrefix = `${session.username}:${repoKey}#`;
  for (const cachedKey of pullRequestDetailsCache.keys()) {
    if (cachedKey.startsWith(detailsCachePrefix) && !activeDetailsKeys.has(cachedKey)) {
      pullRequestDetailsCache.delete(cachedKey);
    }
  }

  const details = await Promise.all(
    listed.map(async (entry) => {
      const detailsKey = `${session.username}:${repoKey}#${entry.number}`;
      const cachedDetails = pullRequestDetailsCache.get(detailsKey);
      const metadataPromise = cachedDetails?.updatedAt === entry.updated_at
        ? Promise.resolve(cachedDetails)
        : Promise.all([
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
          fetchAllPullRequestComments(connectionService, repo, session, entry.number),
        ]).then(([detail, reviews, comments]) => {
          const fetchedDetails = { updatedAt: entry.updated_at, detail, reviews, comments };
          pullRequestDetailsCache.set(detailsKey, fetchedDetails);
          return fetchedDetails;
        });
      const [metadata, checkRuns] = await Promise.all([
        metadataPromise,
        callWithSessionFallback(connectionService, session, 'pull_request_read', {
          owner: repo.owner,
          repo: repo.repo,
          pullNumber: entry.number,
          method: 'get_check_runs',
        }).then((result) => extractCheckRuns(parseToolResultText<CheckRunsResponse>(result))),
      ]);
      return { entry, ...metadata, checkRuns };
    }),
  );

  const uniqueLabelNames = [...new Set(
    listed.flatMap((entry) => (entry.labels ?? []).map(getLabelName).filter((name): name is string => name !== undefined)),
  )];
  const labelColors = new Map<string, string>();
  const uncachedLabelNames = uniqueLabelNames.filter((name) => {
    const cachedColor = labelColorCache.get(`${session.username}:${repoKey}:${name}`);
    if (cachedColor !== undefined) {
      labelColors.set(name, cachedColor);
      return false;
    }
    return true;
  });
  const labelColorEntries = await Promise.all(
    uncachedLabelNames.map(async (name) => {
      const label = parseToolResultText<{ color: string }>(
        await callWithSessionFallback(connectionService, session, 'get_label', {
          owner: repo.owner,
          repo: repo.repo,
          name,
        }),
      );
      labelColorCache.set(`${session.username}:${repoKey}:${name}`, label.color);
      return [name, label.color] as const;
    }),
  );
  for (const [name, color] of labelColorEntries) {
    labelColors.set(name, color);
  }

  return details.map(({ entry, detail, reviews, comments, checkRuns }) =>
    mapPullRequest(entry, repoKey, detail, reviews, comments, checkRuns, labelColors),
  );
}
