import * as vscode from 'vscode';
import { GitHubAuthService } from '../../infrastructure/github/auth';
import { GitHubConfigStore } from '../../infrastructure/github/configStore';
import { ErrorClassifier } from '../../infrastructure/github/errorClassifier';
import { GithubMcpAdapter } from '../../infrastructure/github/githubMcpAdapter';
import type { McpConnectionService } from '../../infrastructure/mcp/connectionService';
import { AttentionEngine, githubCommentSourceKey } from './attentionEngine';
import { LastSeenStore, prKey } from '../../infrastructure/github/lastSeenStore';
import { PullRequestCache } from '../../infrastructure/github/pullRequestCache';
import { buildCommentAttention } from '../attention/commentAttention';
import type { CommentAttentionSummary, ProviderCommentCandidate } from '../attention/commentAttention';
import type { CommentReadStateStore } from '../../infrastructure/attention/commentReadStateStore';
import type {
  GitHubAttentionResult,
  GitHubCommentState,
  GitHubFailure,
  GitHubIncomingMessage,
  GitHubOperationId,
  GitHubOutgoingMessage,
  GitHubPendingOperation,
  GitHubViewState,
  PullRequestSummary,
} from '../../shared/githubTypes';

type OperationResult = { ok: true } | { ok: false; reason: string };

export interface GitHubViewHost {
  readonly webview: Pick<vscode.Webview, 'postMessage'>;
}

export class GitHubViewController {
  private lastFetchResult: Map<string, PullRequestSummary[]> = new Map();
  private isRefreshing = false;
  private rateLimitedUntil: number | undefined;
  private lastRefreshAt: string | null = null;
  private failures: GitHubFailure[] = [];
  private me: string | undefined;
  private monitoredAuthorNames: string[] = [];
  private commentAttentionBySource = new Map<string, CommentAttentionSummary>();
  private commentStatusBySource: Record<string, GitHubCommentState> = {};
  private pendingOperations: Partial<Record<GitHubOperationId, GitHubPendingOperation>> = {};
  private commentFailures: GitHubFailure[] = [];

  constructor(
    _context: vscode.ExtensionContext,
    private readonly view: GitHubViewHost,
    private readonly authService: GitHubAuthService,
    private readonly configStore: GitHubConfigStore,
    private readonly connectionService: McpConnectionService,
    private readonly lastSeenStore: LastSeenStore,
    private readonly commentReadStateStore: CommentReadStateStore,
    private readonly pullRequestCache: PullRequestCache = new PullRequestCache(),
    private readonly outputChannel: Pick<vscode.OutputChannel, 'appendLine'> = { appendLine: () => {} },
  ) {}

  async handleMessage(msg: GitHubIncomingMessage): Promise<void> {
    switch (msg.command) {
      case 'github.signIn':
        await this.runOperation(msg.command, async () => {
          await this.authService.getSession(true);
          return this.performRefresh();
        });
        return;
      case 'github.refresh':
        await this.runOperation(msg.command, () => this.performRefresh());
        return;
      case 'github.addRepo':
        await this.runOperation(msg.command, async () => {
          const result = await this.configStore.addRepo(msg.value);
          this.postAddResult('repo', result);
          await this.performRefresh();
          return result;
        });
        return;
      case 'github.removeRepo':
        await this.runOperation(msg.command, async () => {
          await this.configStore.removeRepo(msg.owner, msg.repo);
          return this.performRefresh();
        });
        return;
      case 'github.addAuthor':
        await this.runOperation(msg.command, async () => {
          const result = await this.configStore.addAuthor(msg.value);
          this.postAddResult('author', result);
          await this.performRefresh();
          return result;
        });
        return;
      case 'github.removeAuthor':
        await this.runOperation(msg.command, async () => {
          await this.configStore.removeAuthor(msg.username);
          return this.performRefresh();
        });
        return;
      case 'github.markRead':
        this.lastSeenStore.markSeen(prKey(msg.repoKey, msg.number));
        this.recomputeAndPostState();
        return;
      case 'github.openPr':
      case 'github.openComment':
        this.lastSeenStore.markSeen(prKey(msg.repoKey, msg.number));
        await this.runOperation(msg.command, async () => {
          await this.markCommentSourceSeenAfterOpen(
            githubCommentSourceKey(msg.repoKey, msg.number),
            msg.url,
          );
          return { ok: true };
        });
    }
  }

  async refresh(): Promise<void> {
    await this.performRefresh();
  }

  getState(): GitHubViewState {
    return this.buildViewModel();
  }

  private async runOperation(
    operationId: GitHubOperationId,
    operation: () => Promise<OperationResult>,
  ): Promise<void> {
    this.pendingOperations = {
      ...this.pendingOperations,
      [operationId]: { operationId, pending: true },
    };
    this.postState();

    let result: OperationResult;
    try {
      result = await operation();
    } catch (error) {
      const failure = ErrorClassifier.classify(error);
      this.outputChannel.appendLine(`[${failure.category}] ${operationId}`);
      result = { ok: false, reason: failure.detail };
    }

    this.publishOperationResult(operationId, result);
  }

  private async performRefresh(): Promise<OperationResult> {
    if (this.isRefreshing) {
      return { ok: true };
    }
    this.isRefreshing = true;
    this.postState();
    this.commentFailures = [];

    try {
      if (this.rateLimitedUntil !== undefined && Date.now() < this.rateLimitedUntil) {
        this.recomputeAndPostState();
        return { ok: false, reason: 'GitHub requests are paused during the rate-limit cooldown.' };
      }

      const session = await this.authService.getSession(false);
      if (!session) {
        this.me = undefined;
        this.failures = [{ category: 'auth-expired', detail: 'Not signed in.' }];
        this.recomputeAndPostState();
        return { ok: false, reason: 'Not signed in.' };
      }

      const config = this.configStore.getConfig();
      this.me = session.username;
      this.monitoredAuthorNames = config.monitoredAuthors.map((author) => author.username);
      const currentRepoKeys = new Set(config.monitoredRepos.map((repo) => `${repo.owner}/${repo.repo}`));
      for (const key of this.lastFetchResult.keys()) {
        if (!currentRepoKeys.has(key)) this.lastFetchResult.delete(key);
      }

      const repoResults = await Promise.allSettled(
        config.monitoredRepos.map(async (repo) => ({
          repo,
          prs: await GithubMcpAdapter.fetchOpenPullRequests(this.connectionService, repo, session),
        })),
      );
      const failures = this.applyRepoResults(repoResults, config.monitoredRepos);
      const fetchedPRs = repoResults.flatMap((result) =>
        result.status === 'fulfilled' ? result.value.prs : [],
      );
      const commentResults = await this.buildCommentAttentionBySource(fetchedPRs, session.username);
      for (const [sourceKey, summary] of commentResults) {
        this.commentAttentionBySource.set(sourceKey, summary);
      }

      const repositoriesComplete = repoResults.every((result) => result.status === 'fulfilled');
      if (repositoriesComplete && this.commentFailures.length === 0) {
        const activeSourceKeys = new Set(
          fetchedPRs.map((pr) => githubCommentSourceKey(pr.repoKey, pr.number)),
        );
        this.commentAttentionBySource = commentResults;
        this.commentStatusBySource = Object.fromEntries(
          [...commentResults.keys()].map((sourceKey) => [sourceKey, 'available']),
        );
        await this.commentReadStateStore.reconcileSources(activeSourceKeys, true);
      } else {
        this.markFailedRepoSourcesStale(repoResults, config.monitoredRepos);
      }

      this.failures = [...failures, ...this.commentFailures];
      this.recomputeAndPostState();
      return this.failures.length === 0
        ? { ok: true }
        : { ok: false, reason: 'Some GitHub sources could not be refreshed. Review failures and retry.' };
    } catch (error) {
      const failure = ErrorClassifier.classify(error);
      this.failures = [...this.failures, failure];
      this.outputChannel.appendLine(`[${failure.category}] ${failure.detail}`);
      this.recomputeAndPostState();
      return { ok: false, reason: failure.detail };
    } finally {
      this.isRefreshing = false;
      this.postState();
    }
  }

  private applyRepoResults(
    results: PromiseSettledResult<{ repo: { owner: string; repo: string }; prs: PullRequestSummary[] }>[],
    repos: Array<{ owner: string; repo: string }>,
  ): GitHubFailure[] {
    const failures: GitHubFailure[] = [];
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status === 'fulfilled') {
        const { repo, prs } = result.value;
        const repoKey = `${repo.owner}/${repo.repo}`;
        this.lastFetchResult.set(repoKey, prs);
        this.pullRequestCache.setForRepo(repoKey, prs);
        continue;
      }

      const failure = ErrorClassifier.classify(result.reason);
      if (failure.category === 'rate-limited') {
        this.rateLimitedUntil = failure.resetAt ? new Date(failure.resetAt).getTime() : undefined;
      }
      failure.entry = `${repos[index].owner}/${repos[index].repo}`;
      this.outputChannel.appendLine(`[${failure.category}] ${failure.detail}`);
      failures.push(failure);
    }
    return failures;
  }

  private async buildCommentAttentionBySource(
    prs: PullRequestSummary[],
    me: string,
  ): Promise<Map<string, CommentAttentionSummary>> {
    const results = await Promise.allSettled(prs.map(async (pr) => {
      const sourceKey = githubCommentSourceKey(pr.repoKey, pr.number);
      const seenAt = await this.commentReadStateStore.getSeenAt(sourceKey);
      const comments = this.toProviderComments(pr, sourceKey, me);
      const attention = buildCommentAttention(comments, seenAt);
      if (seenAt === undefined) {
        await this.commentReadStateStore.ensureBaseline(sourceKey, Date.now());
      }
      return { sourceKey, attention };
    }));
    const summaries = new Map<string, CommentAttentionSummary>();

    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      const sourceKey = githubCommentSourceKey(prs[index].repoKey, prs[index].number);
      if (result.status === 'fulfilled') {
        summaries.set(sourceKey, result.value.attention);
        this.commentStatusBySource[sourceKey] = 'available';
      } else {
        const failure = ErrorClassifier.classify(result.reason);
        failure.entry = sourceKey;
        this.commentFailures.push(failure);
        this.commentStatusBySource[sourceKey] = this.commentAttentionBySource.has(sourceKey)
          ? 'stale'
          : 'unavailable';
        this.outputChannel.appendLine(`[${failure.category}] comment source ${sourceKey}`);
      }
    }
    return summaries;
  }

  private toProviderComments(
    pr: PullRequestSummary,
    sourceKey: string,
    me: string,
  ): ProviderCommentCandidate[] {
    return pr.comments.map((comment) => ({
      id: comment.id,
      sourceKey,
      authorIdentity: comment.author,
      bodyText: comment.body,
      createdAt: comment.createdAt,
      url: comment.url,
      isCurrentUser: comment.author.toLowerCase() === me.toLowerCase(),
    }));
  }

  private markFailedRepoSourcesStale(
    results: PromiseSettledResult<{ repo: { owner: string; repo: string }; prs: PullRequestSummary[] }>[],
    repos: Array<{ owner: string; repo: string }>,
  ): void {
    for (let index = 0; index < results.length; index++) {
      if (results[index].status === 'fulfilled') continue;
      const repoKey = `${repos[index].owner}/${repos[index].repo}`;
      for (const pr of this.lastFetchResult.get(repoKey) ?? []) {
        const sourceKey = githubCommentSourceKey(pr.repoKey, pr.number);
        this.commentStatusBySource[sourceKey] = this.commentAttentionBySource.has(sourceKey)
          ? 'stale'
          : 'unavailable';
      }
    }
  }

  private async markCommentSourceSeenAfterOpen(sourceKey: string, url: string): Promise<void> {
    const opened = await vscode.env.openExternal(vscode.Uri.parse(url));
    if (!opened) {
      throw new Error('The GitHub pull request or comment could not be opened.');
    }

    const seenAt = Date.now();
    await this.commentReadStateStore.markSeen(sourceKey, seenAt);
    const pr = [...this.lastFetchResult.values()]
      .flat()
      .find((item) => githubCommentSourceKey(item.repoKey, item.number) === sourceKey);
    if (pr && this.me) {
      this.commentAttentionBySource.set(
        sourceKey,
        buildCommentAttention(this.toProviderComments(pr, sourceKey, this.me), seenAt),
      );
      this.commentStatusBySource[sourceKey] = 'available';
    }
    this.recomputeAndPostState();
  }

  private recomputeAndPostState(): void {
    const allPrs = [...this.lastFetchResult.values()].flat();
    for (const pr of allPrs) {
      this.lastSeenStore.ensureBaseline(prKey(pr.repoKey, pr.number));
    }
    this.lastRefreshAt = new Date().toISOString();
    this.postState();
  }

  private computeAttention(): GitHubAttentionResult {
    if (this.me === undefined) {
      return { myPRs: [], teamPRs: [], attentionInbox: [] };
    }
    const allPrs = [...this.lastFetchResult.values()].flat();
    return AttentionEngine.computeAttentionState(
      allPrs,
      this.lastSeenStore.getAll(),
      this.me,
      this.monitoredAuthorNames,
      Date.now(),
      this.commentAttentionBySource,
    );
  }

  private buildViewModel(): GitHubViewState {
    const config = this.configStore.getConfig();
    const invalidRepoKeys = new Set(
      this.failures.filter((failure) => failure.category === 'invalid-entry' && failure.entry?.includes('/')).map((failure) => failure.entry),
    );
    const invalidAuthorNames = new Set(
      this.failures
        .filter((failure) => failure.category === 'invalid-entry' && failure.entry !== undefined && !failure.entry.includes('/'))
        .map((failure) => failure.entry),
    );

    return {
      authenticated: this.me !== undefined,
      me: this.me ?? null,
      monitoredRepos: config.monitoredRepos.map((repo) => {
        const key = `${repo.owner}/${repo.repo}`;
        return invalidRepoKeys.has(key)
          ? { ...repo, status: 'invalid' as const, invalidReason: 'Repo not found or not accessible.' }
          : { ...repo, status: 'valid' as const };
      }),
      monitoredAuthors: config.monitoredAuthors.map((author) =>
        invalidAuthorNames.has(author.username)
          ? { ...author, status: 'invalid' as const, invalidReason: 'GitHub user not found.' }
          : { ...author, status: 'valid' as const },
      ),
      attention: this.computeAttention(),
      commentAttentionBySource: Object.fromEntries(this.commentAttentionBySource),
      commentStatusBySource: { ...this.commentStatusBySource },
      pendingOperations: { ...this.pendingOperations },
      failures: this.failures,
      lastRefreshAt: this.lastRefreshAt,
      isRefreshing: this.isRefreshing,
    };
  }

  private postState(): void {
    const state = this.buildViewModel();
    const message: GitHubOutgoingMessage = { command: 'github.state', state };
    void this.view.webview.postMessage(message);
  }

  private publishOperationResult(operationId: GitHubOperationId, result: OperationResult): void {
    this.pendingOperations = {
      ...this.pendingOperations,
      [operationId]: { operationId, pending: false, result },
    };
    const message: GitHubOutgoingMessage = { command: 'github.operationResult', operationId, result };
    void this.view.webview.postMessage(message);
    this.postState();
  }

  private postAddResult(kind: 'repo' | 'author', result: { ok: true } | { ok: false; reason: string }): void {
    const message: GitHubOutgoingMessage = result.ok
      ? { command: 'github.addResult', kind, ok: true }
      : { command: 'github.addResult', kind, ok: false, reason: result.reason };
    void this.view.webview.postMessage(message);
  }
}
