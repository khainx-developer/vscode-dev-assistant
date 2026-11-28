import type { McpConnectionService } from '../mcp/connectionService';
import type { McpToolError } from '../../shared/mcpTypes';
import type {
  FailedJobLog,
  FailedJobLogsFailureReason,
  FailedJobLogsResult,
  GitHubSession,
  MonitoredAuthor,
  MonitoredRepo,
  PullRequestCheckRun,
  PullRequestSummary,
  RateLimitStatus,
} from '../../shared/githubTypes';

export type {
  FailedJobLog,
  FailedJobLogsFailureReason,
  FailedJobLogsResult,
  PullRequestCheckRun,
} from '../../shared/githubTypes';
export { parseActionsRunId } from '../../shared/githubTypes';

type RestUser = { login: string } | null;

type HeadSource = {
  head?: { ref?: string | null; sha?: string | null } | string | null;
} | null | undefined;

type ListedPullRequest = {
  number: number;
  title: string;
  head?: { ref?: string | null; sha?: string | null } | string | null;
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

/** `pull_request_read`/`get` returns the full PR; we need mergeable and head.ref/sha for Jira linking and analysis. */
type PullRequestDetail = {
  mergeable: boolean | null;
  head?: { ref?: string | null; sha?: string | null } | string | null;
};

function extractHeadRef(source: HeadSource): string | undefined {
  const head = source?.head;
  if (typeof head === 'string') {
    const trimmed = head.trim();
    return trimmed || undefined;
  }
  if (head && typeof head.ref === 'string') {
    const trimmed = head.ref.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function extractHeadSha(source: HeadSource): string | undefined {
  const head = source?.head;
  if (!head || typeof head === 'string') {
    return undefined;
  }
  if (typeof head.sha === 'string') {
    const trimmed = head.sha.trim();
    return trimmed || undefined;
  }
  return undefined;
}

type PullRequestReview = { user: RestUser; state: string; submitted_at: string };
type PullRequestComment = {
  id: number | string;
  user: RestUser;
  body: string;
  created_at: string;
  html_url: string;
  path?: string;
  line?: number | null;
};
/** `pull_request_read`/`get_review_comments` returns threaded GraphQL-shaped review comments (not a bare array). */
type MinimalReviewComment = {
  body?: string;
  path?: string;
  line?: number | null;
  author?: string;
  created_at?: string;
  updated_at?: string;
  html_url?: string;
};
type MinimalReviewThread = {
  id?: string;
  is_resolved?: boolean;
  is_outdated?: boolean;
  is_collapsed?: boolean;
  path?: string;
  line?: number | null;
  comments?: MinimalReviewComment[];
  total_count?: number;
};
type ReviewThreadsPage = {
  review_threads?: MinimalReviewThread[];
  totalCount?: number;
  pageInfo?: {
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
    startCursor?: string;
    endCursor?: string;
  };
};
type CachedPullRequestDetails = {
  updatedAt: string;
  detail: PullRequestDetail;
  reviews: PullRequestReview[];
  comments: PullRequestComment[];
  unresolvedThreadCount: number;
};
type CheckRun = {
  name?: string;
  status: string;
  conclusion: string | null;
  details_url?: string | null;
  html_url?: string | null;
  output?: { title?: string | null; summary?: string | null; text?: string | null } | null;
};
// GitHub's real "list check runs for a ref" REST endpoint returns `{total_count, check_runs:
// [...]}`, not a bare array — confirmed live ("checkRuns.some is not a function"), unlike
// list_pull_requests/get_reviews/get_comments (bare arrays). get_review_comments is different
// again: `{ review_threads, totalCount, pageInfo }` with cursor pagination via `after`.
type CheckRunsResponse = CheckRun[] | { check_runs?: CheckRun[] };

const pullRequestDetailsCache = new Map<string, CachedPullRequestDetails>();
const labelColorCache = new Map<string, string>();
const inFlightRepoFetches = new Map<string, Promise<PullRequestSummary[]>>();
const MAX_CONCURRENT_GITHUB_CALLS = 4;
const INITIAL_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
const MAX_RATE_LIMIT_BACKOFF_MS = 60 * 60 * 1000;
const ACTIONS_TOOLSET_HEADER = 'default,actions';
const ACTIONS_READ_ALLOWLIST = new Set(['get_job_logs', 'actions_get', 'actions_list']);
let rateLimitedUntil: number | undefined;
let rateLimitBackoffMs = INITIAL_RATE_LIMIT_BACKOFF_MS;
let activeGitHubCalls = 0;
const queuedGitHubCalls: Array<() => void> = [];
let actionsToolsetRejected = false;

export function assertActionsToolAllowed(name: string): void {
  const isActionsTool = name === 'get_job_logs' || name.startsWith('actions_');
  if (!isActionsTool) {
    return;
  }
  if (!ACTIONS_READ_ALLOWLIST.has(name)) {
    throw new Error(
      `GitHub actions tool "${name}" is not allowed (read-only allowlist: ${[...ACTIONS_READ_ALLOWLIST].join(', ')}).`,
    );
  }
}

export function areCiLogsAvailable(): boolean {
  return !actionsToolsetRejected;
}

export function resetGithubMcpAdapterTestState(): void {
  actionsToolsetRejected = false;
  rateLimitedUntil = undefined;
  rateLimitBackoffMs = INITIAL_RATE_LIMIT_BACKOFF_MS;
  pullRequestDetailsCache.clear();
  labelColorCache.clear();
  inFlightRepoFetches.clear();
}

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
  assertActionsToolAllowed(name);
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

function sessionAuthHeaders(session: GitHubSession, includeActionsToolset: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
  };
  if (includeActionsToolset) {
    headers['X-MCP-Toolsets'] = ACTIONS_TOOLSET_HEADER;
  }
  return headers;
}

async function connectGitHubWithSession(
  connectionService: McpConnectionService,
  session: GitHubSession,
): Promise<void> {
  if (actionsToolsetRejected) {
    await connectionService.connect('github', {
      extraHeaders: sessionAuthHeaders(session, false),
    });
    return;
  }

  try {
    await connectionService.connect('github', {
      extraHeaders: sessionAuthHeaders(session, true),
    });
  } catch (error) {
    if ((error as McpToolError)?.category === 'auth-expired') {
      throw error;
    }
    try {
      await connectionService.disconnect('github');
    } catch (disconnectError) {
      void disconnectError;
    }
    await connectionService.connect('github', {
      extraHeaders: sessionAuthHeaders(session, false),
    });
    actionsToolsetRejected = true;
  }
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
    await connectGitHubWithSession(connectionService, session);
    return await callGitHubTool(connectionService, name, args);
  } catch (error) {
    if ((error as McpToolError)?.category !== 'auth-expired') {
      throw error;
    }
    await connectionService.connect('github');
    return await callGitHubTool(connectionService, name, args);
  }
}

type JobLogsToolPayload = {
  failed_jobs?: number;
  logs?: Array<{
    job_id?: string | number;
    job_name?: string;
    logs_content?: string;
  }>;
};

function mapFailedJobLogs(payload: JobLogsToolPayload): FailedJobLog[] {
  return (payload.logs ?? [])
    .map((entry) => {
      const content = typeof entry.logs_content === 'string' ? entry.logs_content : '';
      const jobName = typeof entry.job_name === 'string' && entry.job_name.trim()
        ? entry.job_name
        : 'job';
      const mapped: FailedJobLog = { jobName, content };
      if (entry.job_id !== undefined) {
        mapped.jobId = entry.job_id;
      }
      return mapped;
    })
    .filter((entry) => entry.content.length > 0);
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

function mapCheckRun(run: CheckRun): PullRequestCheckRun | null {
  const name = typeof run.name === 'string' ? run.name.trim() : '';
  if (!name) {
    return null;
  }
  const detailsUrl = (typeof run.details_url === 'string' && run.details_url.trim())
    ? run.details_url.trim()
    : (typeof run.html_url === 'string' && run.html_url.trim() ? run.html_url.trim() : undefined);
  const summary = run.output?.summary?.trim()
    || run.output?.title?.trim()
    || undefined;
  const mapped: PullRequestCheckRun = {
    name,
    status: run.status,
    conclusion: run.conclusion ?? null,
  };
  if (detailsUrl) {
    mapped.detailsUrl = detailsUrl;
  }
  if (summary) {
    mapped.summary = summary;
  }
  return mapped;
}

function mapReviewState(state: string): PullRequestSummary['reviews'][number]['state'] {
  const upper = state.toUpperCase();
  if (upper === 'APPROVED' || upper === 'CHANGES_REQUESTED' || upper === 'COMMENTED' || upper === 'PENDING') {
    return upper;
  }
  return 'PENDING';
}

function checkConclusionsFromRuns(checkRuns: CheckRun[] | undefined): Record<string, string | null> {
  const conclusions: Record<string, string | null> = {};
  for (const run of checkRuns ?? []) {
    const name = typeof run.name === 'string' ? run.name.trim() : '';
    if (!name) {
      continue;
    }
    conclusions[name] = run.conclusion ?? null;
  }
  return conclusions;
}

function mapPullRequest(
  entry: ListedPullRequest,
  repoKey: string,
  detail: PullRequestDetail,
  reviews: PullRequestReview[] | undefined,
  comments: PullRequestComment[] | undefined,
  checkRuns: CheckRun[] | undefined,
  labelColors: Map<string, string>,
  unresolvedThreadCount: number,
): PullRequestSummary {
  return {
    repoKey,
    number: entry.number,
    title: entry.title,
    // Prefer list payload; fall back to pull_request_read/get — some MCP list shapes omit head.ref.
    headRef: extractHeadRef(entry) ?? extractHeadRef(detail),
    headSha: extractHeadSha(entry) ?? extractHeadSha(detail) ?? null,
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
    checkConclusions: checkConclusionsFromRuns(checkRuns),
    unresolvedThreadCount,
    reviews: (reviews ?? []).map((review) => ({
      author: review.user?.login ?? '',
      state: mapReviewState(review.state),
      submittedAt: review.submitted_at,
    })),
    comments: (comments ?? []).map((comment) => {
      const mapped: PullRequestSummary['comments'][number] = {
        id: String(comment.id),
        author: comment.user?.login ?? '',
        body: comment.body ?? '',
        createdAt: comment.created_at,
        url: comment.html_url,
      };
      if (comment.path) {
        mapped.path = comment.path;
      }
      if (comment.line !== undefined) {
        mapped.line = comment.line;
      }
      return mapped;
    }),
    requestedReviewers: (entry.requested_reviewers ?? [])
      .map((reviewer) => reviewer?.login)
      .filter((login): login is string => login !== undefined && login !== null),
  };
}

export const GithubMcpAdapter = {
  async getCheckRuns(
    connectionService: McpConnectionService,
    session: GitHubSession,
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<PullRequestCheckRun[]> {
    const checkRuns = extractCheckRuns(
      parseToolResultText<CheckRunsResponse>(
        await callWithSessionFallback(connectionService, session, 'pull_request_read', {
          owner,
          repo,
          pullNumber,
          method: 'get_check_runs',
        }),
      ),
    );
    return checkRuns
      .map(mapCheckRun)
      .filter((run): run is PullRequestCheckRun => run !== null);
  },

  async getFailedJobLogs(
    connectionService: McpConnectionService,
    session: GitHubSession,
    owner: string,
    repo: string,
    runId: string,
    log: (line: string) => void = () => undefined,
  ): Promise<FailedJobLogsResult> {
    if (actionsToolsetRejected) {
      const result: FailedJobLogsResult = { ok: false, reason: 'unavailable', detail: 'actions toolset unavailable' };
      log(`[analysis] getFailedJobLogs unavailable for ${owner}/${repo} run ${runId}: ${result.detail}`);
      return result;
    }
    try {
      const payload = parseToolResultText<JobLogsToolPayload>(
        await callWithSessionFallback(connectionService, session, 'get_job_logs', {
          owner,
          repo,
          run_id: Number.isFinite(Number(runId)) ? Number(runId) : runId,
          failed_only: true,
          return_content: true,
          tail_lines: 2000,
        }),
      );
      return { ok: true, logs: mapFailedJobLogs(payload) };
    } catch (error) {
      const category = (error as Partial<McpToolError>)?.category;
      const detail = (error as Partial<McpToolError>)?.detail
        || (error instanceof Error ? error.message : 'Unknown error');
      const reason: FailedJobLogsFailureReason = category === 'rate-limited'
        ? 'rate-limited'
        : 'error';
      log(`[analysis] getFailedJobLogs ${reason} for ${owner}/${repo} run ${runId}: ${detail}`);
      return { ok: false, reason, detail };
    }
  },

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

async function fetchConversationComments(
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

function mapReviewComment(
  comment: MinimalReviewComment,
  thread: MinimalReviewThread,
): PullRequestComment {
  const author = comment.author ?? '';
  const body = comment.body ?? '';
  const createdAt = comment.created_at ?? '';
  const htmlUrl = comment.html_url ?? '';
  const path = comment.path ?? thread.path;
  const line = comment.line !== undefined ? comment.line : thread.line;
  // Review-thread comments have no numeric id in the MCP minimal shape — use the permalink, or a stable composite.
  const id = htmlUrl
    || `review:${author}:${createdAt}:${path ?? ''}:${body.slice(0, 64)}`;
  const mapped: PullRequestComment = {
    id,
    user: { login: author },
    body,
    created_at: createdAt,
    html_url: htmlUrl,
  };
  if (path) {
    mapped.path = path;
  }
  if (line !== undefined) {
    mapped.line = line;
  }
  return mapped;
}

function flattenReviewThreadsPage(payload: ReviewThreadsPage | PullRequestComment[] | unknown): {
  comments: PullRequestComment[];
  unresolvedThreadCount: number;
  hasNextPage: boolean;
  endCursor: string | undefined;
} {
  // Tests and older stubs may return []; treat as empty threads (not conversation comments).
  if (Array.isArray(payload)) {
    return { comments: [], unresolvedThreadCount: 0, hasNextPage: false, endCursor: undefined };
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('GitHub MCP get_review_comments result must be an object with review_threads.');
  }
  const page = payload as ReviewThreadsPage;
  const threads = page.review_threads;
  if (threads !== undefined && !Array.isArray(threads)) {
    throw new Error('GitHub MCP get_review_comments review_threads must be an array.');
  }
  const openThreads = (threads ?? [])
    .filter((thread) => thread.is_resolved !== true && thread.is_outdated !== true);
  const comments = openThreads.flatMap((thread) =>
    (thread.comments ?? []).map((comment) => mapReviewComment(comment, thread)));
  return {
    comments,
    unresolvedThreadCount: openThreads.length,
    hasNextPage: page.pageInfo?.hasNextPage === true,
    endCursor: typeof page.pageInfo?.endCursor === 'string' ? page.pageInfo.endCursor : undefined,
  };
}

async function fetchReviewComments(
  connectionService: McpConnectionService,
  repo: MonitoredRepo,
  session: GitHubSession,
  pullNumber: number,
): Promise<{ comments: PullRequestComment[]; unresolvedThreadCount: number }> {
  const comments: PullRequestComment[] = [];
  let unresolvedThreadCount = 0;
  let after: string | undefined;
  for (;;) {
    const args: Record<string, unknown> = {
      owner: repo.owner,
      repo: repo.repo,
      pullNumber,
      method: 'get_review_comments',
      perPage: 100,
    };
    if (after) {
      args.after = after;
    }
    const payload = parseToolResultText<ReviewThreadsPage | PullRequestComment[]>(
      await callWithSessionFallback(connectionService, session, 'pull_request_read', args),
    );
    const page = flattenReviewThreadsPage(payload);
    comments.push(...page.comments);
    unresolvedThreadCount += page.unresolvedThreadCount;
    // Stop when pagination claims another page but the cursor does not advance (avoids infinite loops).
    if (!page.hasNextPage || !page.endCursor || page.endCursor === after) {
      return { comments, unresolvedThreadCount };
    }
    after = page.endCursor;
  }
}

/** Conversation (`get_comments`) + inline/review (`get_review_comments`), same pipeline for attention. */
async function fetchAllPullRequestComments(
  connectionService: McpConnectionService,
  repo: MonitoredRepo,
  session: GitHubSession,
  pullNumber: number,
): Promise<{ comments: PullRequestComment[]; unresolvedThreadCount: number }> {
  const conversationPromise = fetchConversationComments(connectionService, repo, session, pullNumber);
  const reviewPromise = fetchReviewComments(connectionService, repo, session, pullNumber).then(
    (result) => result,
    (error: unknown) => {
      console.warn(
        '[GithubMcpAdapter] get_review_comments failed; continuing with conversation comments only.',
        error,
      );
      return { comments: [] as PullRequestComment[], unresolvedThreadCount: 0 };
    },
  );
  const [conversation, review] = await Promise.all([conversationPromise, reviewPromise]);
  return {
    comments: [...conversation, ...review.comments],
    unresolvedThreadCount: review.unresolvedThreadCount,
  };
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
        ]).then(([detail, reviews, commentResult]) => {
          const fetchedDetails: CachedPullRequestDetails = {
            updatedAt: entry.updated_at,
            detail,
            reviews,
            comments: commentResult.comments,
            unresolvedThreadCount: commentResult.unresolvedThreadCount,
          };
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

  return details.map(({ entry, detail, reviews, comments, checkRuns, unresolvedThreadCount }) =>
    mapPullRequest(
      entry,
      repoKey,
      detail,
      reviews,
      comments,
      checkRuns,
      labelColors,
      unresolvedThreadCount,
    ),
  );
}
