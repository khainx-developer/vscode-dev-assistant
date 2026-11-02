import * as vscode from 'vscode';
import { AtlassianMcpAdapter } from './atlassianMcpAdapter';
import { JiraErrorClassifier } from './errorClassifier';
import { matchPullRequestForIssue } from './prLinkMatcher';
import type {
  JiraFailure,
  JiraIncomingMessage,
  JiraOutgoingMessage,
  JiraTask,
  JiraViewState,
} from './types';
import type { JiraConfigStore } from './configStore';
import type { JiraConnectionStore } from './connectionStore';
import type { McpConnectionService } from '../mcp/connectionService';
import type { PullRequestCache } from '../github/pullRequestCache';

type JiraViewHost = { webview: vscode.Webview };
type OperationResult = { ok: true } | { ok: false; reason: string };

export class JiraViewController {
  private connected = false;
  private siteUrl: string | null = null;
  private tasksByQuery: Record<string, JiraTask[]> = {};
  private failures: JiraFailure[] = [];
  private lastRefreshAt: string | null = null;
  private isRefreshing = false;

  constructor(
    private readonly view: JiraViewHost,
    private readonly connectionStore: JiraConnectionStore,
    private readonly configStore: JiraConfigStore,
    private readonly connectionService: McpConnectionService,
    private readonly pullRequestCache: PullRequestCache,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  async handleMessage(msg: JiraIncomingMessage): Promise<void> {
    switch (msg.command) {
      case 'jira.saveConnection': {
        const result = await this.connectionStore.saveConnection(msg.siteUrl);
        this.postConnectionResult(result);
        await this.refresh();
        break;
      }
      case 'jira.disconnect':
        await this.connectionStore.clearConnection();
        await this.refresh();
        break;
      case 'jira.setCurrentUser':
        await this.configStore.setCurrentUser(msg.displayName);
        this.postState();
        break;
      case 'jira.refresh':
        await this.refresh();
        break;
      case 'jira.addQuery': {
        const result = await this.configStore.addQuery(msg.label, msg.jql);
        this.postQueryResult(result);
        await this.refresh();
        break;
      }
      case 'jira.removeQuery':
        await this.configStore.removeQuery(msg.label);
        await this.refresh();
        break;
      case 'jira.openTask':
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
    }
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }
    this.isRefreshing = true;
    try {
      const connection = await this.connectionStore.getConnection();
      if (!connection) {
        this.connected = false;
        this.siteUrl = null;
        this.failures = [{ category: 'auth-expired', detail: 'Not connected.', queryLabel: '' }];
        this.tasksByQuery = {};
        this.isRefreshing = false;
        this.postState();
        return;
      }

      this.connected = true;
      this.siteUrl = connection.siteUrl;
      const queries = this.configStore.getSavedQueries();
      const results = await Promise.allSettled(
        queries.map((query) =>
          AtlassianMcpAdapter.fetchIssues(this.connectionService, connection.siteId, query.jql, connection.siteUrl).then(
            (tasks) => ({ query, tasks }),
          ),
        ),
      );
      const failures: JiraFailure[] = [];
      for (let index = 0; index < results.length; index++) {
        const result = results[index];
        const query = queries[index];
        if (result.status === 'fulfilled') {
          this.tasksByQuery[result.value.query.label] = result.value.tasks.map((task) =>
            this.buildTaskWithLinkage(task),
          );
          continue;
        }

        const classified = JiraErrorClassifier.classify(result.reason);
        const failure = { ...classified, queryLabel: query.label };
        this.outputChannel.appendLine(`[${failure.category}] ${failure.detail}`);
        failures.push(failure);
      }

      this.failures = failures;
      this.lastRefreshAt = new Date().toISOString();
      this.isRefreshing = false;
      this.postState();
    } finally {
      this.isRefreshing = false;
    }
  }

  getState(): JiraViewState {
    return {
      connected: this.connected,
      siteUrl: this.siteUrl,
      currentUser: this.configStore.getCurrentUser(),
      savedQueries: this.configStore.getSavedQueries(),
      tasksByQuery: this.tasksByQuery,
      failures: this.failures,
      lastRefreshAt: this.lastRefreshAt,
      isRefreshing: this.isRefreshing,
    };
  }

  private buildTaskWithLinkage(task: JiraTask): JiraTask {
    const prs = this.pullRequestCache.getAll();
    if (prs.length === 0) {
      return { ...task, prLink: { kind: 'not-available' } };
    }
    const match = matchPullRequestForIssue(task.key, prs);
    return match
      ? { ...task, prLink: { kind: 'linked', pr: match } }
      : { ...task, prLink: { kind: 'no-match' } };
  }

  private postState(): void {
    const message: JiraOutgoingMessage = { command: 'jira.state', state: this.getState() };
    void this.view.webview.postMessage(message);
  }

  private postConnectionResult(result: OperationResult): void {
    const message: JiraOutgoingMessage = result.ok
      ? { command: 'jira.connectionResult', ok: true }
      : { command: 'jira.connectionResult', ok: false, reason: result.reason };
    void this.view.webview.postMessage(message);
  }

  private postQueryResult(result: OperationResult): void {
    const message: JiraOutgoingMessage = result.ok
      ? { command: 'jira.queryResult', ok: true }
      : { command: 'jira.queryResult', ok: false, reason: result.reason };
    void this.view.webview.postMessage(message);
  }
}
