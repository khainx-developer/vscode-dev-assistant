import * as vscode from 'vscode';
import { GitHubAuthService } from './auth';
import { GitHubClient } from './client';
import { GitHubConfigStore } from './configStore';
import { ErrorClassifier } from './errorClassifier';
import { AttentionEngine } from './attentionEngine';
import { LastSeenStore, prKey } from './lastSeenStore';
import {
  GitHubAttentionResult,
  GitHubFailure,
  GitHubIncomingMessage,
  GitHubOutgoingMessage,
  GitHubViewState,
  PullRequestSummary,
} from './types';

export interface GitHubViewHost {
  readonly webview: vscode.Webview;
}

export class GitHubViewController {
  private lastFetchResult: Map<string, PullRequestSummary[]> = new Map();
  private isRefreshing = false;
  private rateLimitedUntil: number | undefined;
  private lastRefreshAt: string | null = null;
  private failures: GitHubFailure[] = [];
  private me: string | undefined;
  private monitoredAuthorNames: string[] = [];
  private readonly outputChannel = vscode.window.createOutputChannel('Dev Assistant');

  constructor(
    _context: vscode.ExtensionContext,
    private readonly view: GitHubViewHost,
    private readonly authService: GitHubAuthService,
    private readonly configStore: GitHubConfigStore,
    private readonly client: typeof GitHubClient,
    private readonly lastSeenStore: LastSeenStore,
  ) {}

  async handleMessage(msg: GitHubIncomingMessage): Promise<void> {
    switch (msg.command) {
      case 'github.signIn':
        await this.authService.getSession(true);
        await this.refresh();
        break;
      case 'github.refresh':
        await this.refresh();
        break;
      case 'github.addRepo': {
        const result = await this.configStore.addRepo(msg.value);
        this.postAddResult('repo', result);
        await this.refresh();
        break;
      }
      case 'github.removeRepo':
        await this.configStore.removeRepo(msg.owner, msg.repo);
        await this.refresh();
        break;
      case 'github.addAuthor': {
        const result = await this.configStore.addAuthor(msg.value);
        this.postAddResult('author', result);
        await this.refresh();
        break;
      }
      case 'github.removeAuthor':
        await this.configStore.removeAuthor(msg.username);
        await this.refresh();
        break;
      case 'github.markRead':
        this.lastSeenStore.markSeen(prKey(msg.repoKey, msg.number));
        this.recomputeAndPostState();
        break;
      case 'github.openPr':
      case 'github.openComment':
        this.lastSeenStore.markSeen(prKey(msg.repoKey, msg.number));
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        this.recomputeAndPostState();
        break;
    }
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }
    this.isRefreshing = true;
    try {
      if (this.rateLimitedUntil !== undefined && Date.now() < this.rateLimitedUntil) {
        this.recomputeAndPostState();
        return;
      }

      const session = await this.authService.getSession(false);
      if (!session) {
        this.me = undefined;
        this.failures = [{ category: 'auth-expired', detail: 'Not signed in.' }];
        this.recomputeAndPostState();
        return;
      }

      const config = this.configStore.getConfig();
      this.me = session.username;
      this.monitoredAuthorNames = config.monitoredAuthors.map((a) => a.username);

      const currentRepoKeys = new Set(config.monitoredRepos.map((repo) => `${repo.owner}/${repo.repo}`));
      for (const key of this.lastFetchResult.keys()) {
        if (!currentRepoKeys.has(key)) {
          this.lastFetchResult.delete(key);
        }
      }

      const failures: GitHubFailure[] = [];
      const results = await Promise.allSettled(
        config.monitoredRepos.map((repo) =>
          this.client.fetchOpenPullRequests(repo, session).then((prs) => ({ repo, prs })),
        ),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { repo, prs } = result.value;
          this.lastFetchResult.set(`${repo.owner}/${repo.repo}`, prs);
          continue;
        }

        const failure = ErrorClassifier.classify(result.reason);
        if (failure.category === 'rate-limited') {
          this.rateLimitedUntil = failure.resetAt ? new Date(failure.resetAt).getTime() : undefined;
          this.outputChannel.appendLine(`[rate-limited] ${failure.detail}`);
          failures.push(failure);
          break;
        }

        this.outputChannel.appendLine(`[${failure.category}] ${failure.detail}`);
        failures.push(failure);
      }

      this.failures = failures;
      this.recomputeAndPostState();
    } finally {
      this.isRefreshing = false;
    }
  }

  getState(): GitHubViewState {
    return this.buildViewModel();
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
    const lastSeenMap = this.lastSeenStore.getAll();
    return AttentionEngine.computeAttentionState(allPrs, lastSeenMap, this.me, this.monitoredAuthorNames, Date.now());
  }

  private buildViewModel(): GitHubViewState {
    const config = this.configStore.getConfig();
    const invalidRepoKeys = new Set(
      this.failures.filter((f) => f.category === 'invalid-entry' && f.entry?.includes('/')).map((f) => f.entry),
    );
    const invalidAuthorNames = new Set(
      this.failures
        .filter((f) => f.category === 'invalid-entry' && f.entry !== undefined && !f.entry.includes('/'))
        .map((f) => f.entry),
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

  private postAddResult(kind: 'repo' | 'author', result: { ok: true } | { ok: false; reason: string }): void {
    const message: GitHubOutgoingMessage = result.ok
      ? { command: 'github.addResult', kind, ok: true }
      : { command: 'github.addResult', kind, ok: false, reason: result.reason };
    void this.view.webview.postMessage(message);
  }
}
