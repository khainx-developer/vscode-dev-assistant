import * as vscode from 'vscode';
import { AtlassianMcpAdapter } from './atlassianMcpAdapter';
import { JiraErrorClassifier } from './errorClassifier';
import { matchPullRequestForIssue } from './prLinkMatcher';
import { buildCommentAttention, type CommentAttentionSummary, type ProviderCommentCandidate } from '../attention/commentAttention';
import type { CommentReadStateStore } from '../attention/commentReadStateStore';
import type { McpToolError } from '../mcp/types';
import type {
  JiraCommentSummary,
  JiraConnection,
  JiraFailure,
  JiraIncomingMessage,
  JiraOperationId,
  JiraOutgoingMessage,
  JiraSavedQuery,
  JiraTask,
  JiraViewState,
  OperationResult,
  PendingOperation,
} from './types';
import type { JiraConfigStore } from './configStore';
import type { JiraConnectionStore } from './connectionStore';
import type { McpConnectionService } from '../mcp/connectionService';
import type { PullRequestCache } from '../github/pullRequestCache';

type JiraViewHost = { webview: vscode.Webview };
type QueryResult =
  | { query: JiraSavedQuery; status: 'fulfilled'; tasks: JiraTask[] }
  | { query: JiraSavedQuery; status: 'rejected'; failure: JiraFailure };
type CommentResult =
  | { sourceKey: string; taskKey: string; status: 'fulfilled'; comments: JiraCommentSummary[]; attention: CommentAttentionSummary }
  | { sourceKey: string; taskKey: string; status: 'rejected'; failure: JiraFailure };

const EMPTY_COMMENT_ATTENTION: CommentAttentionSummary = {
  unreadCount: 0,
  latestUnreadAt: null,
  latestUnreadComment: null,
};

function jiraSourceKey(siteId: string, issueKey: string): string {
  return `jira:${siteId}:${issueKey}`;
}

function classifyFailure(error: unknown, queryLabel: string): JiraFailure {
  return { ...JiraErrorClassifier.classify(error as McpToolError), queryLabel };
}

async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Concurrency limit must be a positive integer.');
  }

  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export class JiraViewController {
  private connected = false;
  private siteUrl: string | null = null;
  private tasksByQuery: Record<string, JiraTask[]> = {};
  private failures: JiraFailure[] = [];
  private lastRefreshAt: string | null = null;
  private isRefreshing = false;
  private pendingOperations: Partial<Record<JiraOperationId, PendingOperation>> = {};

  constructor(
    private readonly view: JiraViewHost,
    private readonly connectionStore: JiraConnectionStore,
    private readonly configStore: JiraConfigStore,
    private readonly connectionService: McpConnectionService,
    private readonly commentReadStateStore: CommentReadStateStore,
    private readonly pullRequestCache: PullRequestCache,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  async handleMessage(msg: JiraIncomingMessage): Promise<void> {
    switch (msg.command) {
      case 'jira.saveConnection':
        await this.runOperation(msg.command, async () => {
          const result = await this.connectionStore.saveConnection(msg.siteUrl);
          await this.performRefresh();
          return result;
        });
        return;
      case 'jira.disconnect':
        await this.runOperation(msg.command, async () => {
          await this.connectionStore.clearConnection();
          await this.performRefresh();
          return { ok: true };
        });
        return;
      case 'jira.setCurrentUser':
        await this.runOperation(msg.command, () => this.configStore.setCurrentUser(msg.displayName));
        return;
      case 'jira.addTeamMember':
        await this.runOperation(msg.command, () => this.configStore.addTeamMember(msg.displayName));
        return;
      case 'jira.removeTeamMember':
        await this.runOperation(msg.command, async () => {
          await this.configStore.removeTeamMember(msg.displayName);
          return { ok: true };
        });
        return;
      case 'jira.refresh':
        await this.runOperation(msg.command, () => this.performRefresh());
        return;
      case 'jira.addQuery':
        await this.runOperation(msg.command, async () => {
          const result = await this.configStore.addQuery(msg.label, msg.jql);
          await this.performRefresh();
          return result;
        });
        return;
      case 'jira.removeQuery':
        await this.runOperation(msg.command, async () => {
          await this.configStore.removeQuery(msg.label);
          await this.performRefresh();
          return { ok: true };
        });
        return;
      case 'jira.openTask':
        await this.runOperation(msg.command, () => this.openTask(msg.url));
    }
  }

  async refresh(): Promise<void> {
    await this.performRefresh();
  }

  getState(): JiraViewState {
    return {
      connected: this.connected,
      siteUrl: this.siteUrl,
      currentUser: this.configStore.getCurrentUser(),
      teamMembers: this.configStore.getTeamMembers(),
      savedQueries: this.configStore.getSavedQueries(),
      tasksByQuery: this.tasksByQuery,
      failures: this.failures,
      lastRefreshAt: this.lastRefreshAt,
      isRefreshing: this.isRefreshing,
      pendingOperations: { ...this.pendingOperations },
    };
  }

  private async runOperation(
    operationId: JiraOperationId,
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
      const failure = classifyFailure(error, operationId);
      this.outputChannel.appendLine(`[${failure.category}] ${operationId}`);
      result = { ok: false, reason: failure.detail };
    }

    try {
      this.postCommandResult(operationId, result);
    } finally {
      this.publishOperationResult(operationId, result);
    }
  }

  private async performRefresh(): Promise<OperationResult> {
    if (this.isRefreshing) {
      return { ok: true };
    }
    this.isRefreshing = true;
    this.postState();

    try {
      return await this.refreshCore();
    } catch (error) {
      const failure = classifyFailure(error, '');
      this.failures = [failure];
      this.outputChannel.appendLine(`[${failure.category}] ${failure.detail}`);
      return { ok: false, reason: failure.detail };
    } finally {
      this.isRefreshing = false;
      this.postState();
    }
  }

  private async refreshCore(): Promise<OperationResult> {
    const connection = await this.connectionStore.getConnection();
    if (!connection) {
      this.connected = false;
      this.siteUrl = null;
      this.failures = [{ category: 'auth-expired', detail: 'Not connected.', queryLabel: '' }];
      this.tasksByQuery = {};
      return { ok: false, reason: 'Not connected.' };
    }

    this.connected = true;
    this.siteUrl = connection.siteUrl;
    const previousTasksByKey = this.getTasksByKey();
    const queryResults = await this.fetchTasksByQuery(connection);
    const uniqueTasks = this.getUniqueTasks(queryResults);
    const commentResults = await this.refreshIssueComments(connection, [...uniqueTasks.values()]);
    const failures = this.collectFailures(queryResults, commentResults);

    this.applyQueryResults(queryResults, connection);
    this.applyCommentResults(commentResults, connection, previousTasksByKey);
    const complete = queryResults.every((result) => result.status === 'fulfilled')
      && commentResults.every((result) => result.status === 'fulfilled');
    if (complete) {
      await this.commentReadStateStore.reconcileSources(
        new Set([...uniqueTasks.keys()].map((key) => jiraSourceKey(connection.siteId, key))),
        true,
      );
    }

    this.failures = failures;
    this.lastRefreshAt = new Date().toISOString();
    return failures.length === 0
      ? { ok: true }
      : { ok: false, reason: 'Some Jira data could not be refreshed. Review the source failures and retry.' };
  }

  private async fetchTasksByQuery(connection: JiraConnection): Promise<QueryResult[]> {
    const queries = this.configStore.getSavedQueries();
    const results = await Promise.allSettled(
      queries.map(async (query) => ({
        query,
        tasks: await AtlassianMcpAdapter.fetchIssues(
          this.connectionService,
          connection.siteId,
          query.jql,
          connection.siteUrl,
        ),
      })),
    );
    return results.map((result, index) => result.status === 'fulfilled'
      ? { ...result.value, status: 'fulfilled' }
      : {
        query: queries[index],
        status: 'rejected',
        failure: classifyFailure(result.reason, queries[index].label),
      });
  }

  private async refreshIssueComments(
    connection: JiraConnection,
    uniqueTasks: JiraTask[],
  ): Promise<CommentResult[]> {
    const currentUser = this.configStore.getCurrentUser()?.toLowerCase();
    const results = await mapWithConcurrencyLimit(uniqueTasks, 4, async (task) => {
      const sourceKey = jiraSourceKey(connection.siteId, task.key);
      const seenAt = await this.commentReadStateStore.getSeenAt(sourceKey);
      const comments = await AtlassianMcpAdapter.fetchIssueComments(
        this.connectionService,
        connection.siteId,
        task.key,
        connection.siteUrl,
        seenAt,
      );
      if (seenAt === undefined) {
        await this.commentReadStateStore.ensureBaseline(sourceKey, Date.now());
      }
      return {
        sourceKey,
        taskKey: task.key,
        status: 'fulfilled' as const,
        comments,
        attention: buildCommentAttention(
          this.toProviderComments(comments, sourceKey, currentUser),
          seenAt,
        ),
      };
    });

    return results.map((result, index) => result.status === 'fulfilled'
      ? result.value
      : {
        sourceKey: jiraSourceKey(connection.siteId, uniqueTasks[index].key),
        taskKey: uniqueTasks[index].key,
        status: 'rejected',
        failure: classifyFailure(result.reason, uniqueTasks[index].key),
      });
  }

  private toProviderComments(
    comments: JiraCommentSummary[],
    sourceKey: string,
    currentUser: string | undefined,
  ): ProviderCommentCandidate[] {
    return comments.map((comment) => ({
      id: comment.id,
      sourceKey,
      authorIdentity: comment.author,
      bodyText: comment.body,
      createdAt: comment.createdAt,
      url: comment.url,
      isCurrentUser: currentUser !== undefined && comment.author.toLowerCase() === currentUser,
    }));
  }

  private getTasksByKey(): Map<string, JiraTask> {
    const tasks = new Map<string, JiraTask>();
    for (const queryTasks of Object.values(this.tasksByQuery)) {
      for (const task of queryTasks) {
        if (!tasks.has(task.key)) tasks.set(task.key, task);
      }
    }
    return tasks;
  }

  private getUniqueTasks(queryResults: QueryResult[]): Map<string, JiraTask> {
    const tasks = new Map<string, JiraTask>();
    for (const result of queryResults) {
      if (result.status !== 'fulfilled') continue;
      for (const task of result.tasks) {
        if (!tasks.has(task.key)) tasks.set(task.key, task);
      }
    }
    return tasks;
  }

  private collectFailures(
    queryResults: QueryResult[],
    commentResults: CommentResult[],
  ): JiraFailure[] {
    const failures: JiraFailure[] = [];
    for (const result of queryResults) {
      if (result.status === 'rejected') {
        this.outputChannel.appendLine(`[${result.failure.category}] ${result.failure.detail}`);
        failures.push(result.failure);
      }
    }
    for (const result of commentResults) {
      if (result.status === 'rejected') {
        this.outputChannel.appendLine(`[${result.failure.category}] Jira comments for ${result.taskKey}`);
        failures.push(result.failure);
      }
    }
    return failures;
  }

  private applyQueryResults(queryResults: QueryResult[], connection: JiraConnection): void {
    const activeLabels = new Set(queryResults.map((result) => result.query.label));
    const nextTasksByQuery: Record<string, JiraTask[]> = Object.fromEntries(
      Object.entries(this.tasksByQuery).filter(([label]) => activeLabels.has(label)),
    );
    for (const result of queryResults) {
      if (result.status === 'fulfilled') {
        nextTasksByQuery[result.query.label] = result.tasks.map((task) => ({
          ...this.buildTaskWithLinkage(task),
          commentSourceKey: jiraSourceKey(connection.siteId, task.key),
        }));
      } else {
        nextTasksByQuery[result.query.label] = (nextTasksByQuery[result.query.label] ?? [])
          .map((task) => this.markTaskCommentState(task, result.failure, connection));
      }
    }
    this.tasksByQuery = nextTasksByQuery;
  }

  private applyCommentResults(
    commentResults: CommentResult[],
    connection: JiraConnection,
    previousTasksByKey: Map<string, JiraTask>,
  ): void {
    const resultsByTask = new Map(commentResults.map((result) => [result.taskKey, result]));
    this.tasksByQuery = Object.fromEntries(
      Object.entries(this.tasksByQuery).map(([label, tasks]) => [
        label,
        tasks.map((task) => {
          const result = resultsByTask.get(task.key);
          return result
            ? this.enrichTaskWithCommentResult(task, result, previousTasksByKey.get(task.key), connection)
            : task;
        }),
      ]),
    );
  }

  private enrichTaskWithCommentResult(
    task: JiraTask,
    result: CommentResult,
    previous: JiraTask | undefined,
    connection: JiraConnection,
  ): JiraTask {
    const commentSourceKey = jiraSourceKey(connection.siteId, task.key);
    if (result.status === 'fulfilled') {
      return {
        ...task,
        commentSourceKey,
        comments: result.comments,
        commentAttention: result.attention,
        commentState: 'available',
      };
    }
    return this.markTaskCommentState(
      {
        ...task,
        commentSourceKey,
        comments: previous?.comments,
        commentAttention: previous?.commentAttention,
        commentState: previous?.commentState,
      },
      result.failure,
      connection,
    );
  }

  private markTaskCommentState(
    task: JiraTask,
    failure: JiraFailure,
    connection: JiraConnection,
  ): JiraTask {
    const hasLastSuccess = task.commentState === 'available' || task.commentState === 'stale';
    return {
      ...task,
      commentSourceKey: jiraSourceKey(connection.siteId, task.key),
      comments: task.comments ?? [],
      commentAttention: task.commentAttention ?? EMPTY_COMMENT_ATTENTION,
      commentState: hasLastSuccess ? 'stale' : 'unavailable',
      commentFailure: failure,
    };
  }

  private async openTask(url: string): Promise<OperationResult> {
    const opened = await vscode.env.openExternal(vscode.Uri.parse(url));
    if (!opened) {
      return { ok: false, reason: 'The Jira task could not be opened.' };
    }

    const task = Object.values(this.tasksByQuery).flat().find((item) => item.url === url);
    if (!task?.commentSourceKey) {
      return { ok: false, reason: 'The Jira task is no longer available in the current view.' };
    }
    const seenAt = Date.now();
    await this.commentReadStateStore.markSeen(task.commentSourceKey, seenAt);
    this.markCommentSourceSeen(task.commentSourceKey, seenAt);
    return { ok: true };
  }

  private markCommentSourceSeen(sourceKey: string, seenAt: number): void {
    const currentUser = this.configStore.getCurrentUser()?.toLowerCase();
    this.tasksByQuery = Object.fromEntries(
      Object.entries(this.tasksByQuery).map(([label, tasks]) => [
        label,
        tasks.map((task) => task.commentSourceKey === sourceKey
          ? {
            ...task,
            commentAttention: buildCommentAttention(
              this.toProviderComments(task.comments ?? [], sourceKey, currentUser),
              seenAt,
            ),
          }
          : task),
      ]),
    );
  }

  private postCommandResult(operationId: JiraOperationId, result: OperationResult): void {
    switch (operationId) {
      case 'jira.saveConnection':
        this.postConnectionResult(result);
        break;
      case 'jira.setCurrentUser':
        this.postCurrentUserResult(result);
        break;
      case 'jira.addTeamMember':
      case 'jira.removeTeamMember':
        this.postTeamMemberResult(result);
        break;
      case 'jira.addQuery':
        this.postQueryResult(result);
        break;
    }
  }

  private publishOperationResult(operationId: JiraOperationId, result: OperationResult): void {
    this.pendingOperations = {
      ...this.pendingOperations,
      [operationId]: { operationId, pending: false, result },
    };
    const message: JiraOutgoingMessage = { command: 'jira.operationResult', operationId, result };
    void this.view.webview.postMessage(message);
    this.postState();
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

  private postCurrentUserResult(result: OperationResult): void {
    const message: JiraOutgoingMessage = result.ok
      ? { command: 'jira.currentUserResult', ok: true }
      : { command: 'jira.currentUserResult', ok: false, reason: result.reason };
    void this.view.webview.postMessage(message);
  }

  private postTeamMemberResult(result: OperationResult): void {
    const message: JiraOutgoingMessage = result.ok
      ? { command: 'jira.teamMemberResult', ok: true }
      : { command: 'jira.teamMemberResult', ok: false, reason: result.reason };
    void this.view.webview.postMessage(message);
  }
}
