import * as vscode from 'vscode';
import { GitHubAuthService } from '../github/auth';
import { GitHubConfigStore } from '../github/configStore';
import type { GitHubIncomingMessage, GitHubOutgoingMessage, GitHubViewState } from '../github/types';
import { GitHubViewController } from '../github/viewController';
import { LastSeenStore } from '../github/lastSeenStore';
import type { McpConnectionService } from '../mcp/connectionService';
import type { PullRequestCache } from '../github/pullRequestCache';
import { RefreshScheduler, RefreshVisibilityHost, REFRESH_INTERVAL_MINUTES } from '../github/refreshScheduler';
import { JiraViewController } from '../jira/viewController';
import type { JiraIncomingMessage, JiraOutgoingMessage, JiraViewState } from '../jira/types';
import type { JiraServices } from './jiraServices';
import { buildAttentionInbox } from './attentionInboxBuilder';
import type { AttentionInboxItem } from './attentionInboxBuilder';
import { getNonce } from '../webview/nonce';

interface GitHubServices {
  authService: GitHubAuthService;
  configStore: GitHubConfigStore;
  connectionService: McpConnectionService;
  lastSeenStore: LastSeenStore;
  pullRequestCache: PullRequestCache;
}

type IncomingMessage = GitHubIncomingMessage | JiraIncomingMessage;

export function panelVisibilityHost(panel: vscode.WebviewPanel): RefreshVisibilityHost {
  return {
    get visible() {
      return panel.visible;
    },
    onDidChangeVisibility: (listener: () => unknown) => panel.onDidChangeViewState(() => listener()),
  };
}

export class DashboardPanel {
  private static instance: DashboardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly githubController: GitHubViewController;
  private readonly jiraController: JiraViewController;
  private readonly scheduler: RefreshScheduler;
  private readonly controllerWebview: vscode.Webview;
  private githubState: GitHubViewState | null = null;
  private jiraState: JiraViewState | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    githubServices: GitHubServices,
    jiraServices: JiraServices,
  ): void {
    if (DashboardPanel.instance) {
      DashboardPanel.instance.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'devMateKit.dashboard',
      'Daily Tasks',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    DashboardPanel.instance = new DashboardPanel(panel, context, githubServices, jiraServices);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    githubServices: GitHubServices,
    jiraServices: JiraServices,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.render();
    this.controllerWebview = new Proxy(panel.webview, {
      get: (target, property, receiver) => property === 'postMessage'
        ? (message: GitHubOutgoingMessage | JiraOutgoingMessage) => this.postControllerMessage(message)
        : Reflect.get(target, property, receiver),
    });

    this.githubController = new GitHubViewController(
      context,
      { webview: this.controllerWebview },
      githubServices.authService,
      githubServices.configStore,
      githubServices.connectionService,
      githubServices.lastSeenStore,
      jiraServices.commentReadStateStore,
      githubServices.pullRequestCache,
      jiraServices.outputChannel,
    );
    this.jiraController = new JiraViewController(
      { webview: this.controllerWebview },
      jiraServices.connectionStore,
      jiraServices.configStore,
      jiraServices.connectionService,
      jiraServices.commentReadStateStore,
      jiraServices.pullRequestCache,
      jiraServices.outputChannel,
    );
    this.scheduler = new RefreshScheduler(panelVisibilityHost(panel), async () => {
      await Promise.all([this.githubController.refresh(), this.jiraController.refresh()]);
      this.jiraController.refreshPullRequestLinks();
    });

    this.panel.webview.onDidReceiveMessage(
      (message: IncomingMessage) => {
        if (typeof message.command === 'string' && message.command.startsWith('jira.')) {
          void this.jiraController.handleMessage(message as JiraIncomingMessage);
        } else {
          void this.handleGitHubMessage(message as GitHubIncomingMessage);
        }
      },
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  private async handleGitHubMessage(message: GitHubIncomingMessage): Promise<void> {
    try {
      await this.githubController.handleMessage(message);
    } finally {
      this.jiraController.refreshPullRequestLinks();
    }
  }

  private dispose(): void {
    DashboardPanel.instance = undefined;
    this.scheduler.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }

  private postControllerMessage(message: GitHubOutgoingMessage | JiraOutgoingMessage): Thenable<boolean> {
    if (message.command === 'github.state') this.githubState = message.state;
    if (message.command === 'jira.state') this.jiraState = message.state;

    const posted = this.panel.webview.postMessage(message);
    if (this.githubState && this.jiraState) {
      const inbox: AttentionInboxItem[] = buildAttentionInbox(
        this.jiraState,
        this.githubState,
        Date.now(),
      );
      void this.panel.webview.postMessage({ command: 'dashboard.inboxState', items: inbox });
    }
    return posted;
  }

  private render(): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily Tasks</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 24px 32px 40px;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { font-size: 1.4em; margin: 0 0 4px; }
    .subtitle { color: var(--vscode-descriptionForeground); margin: 0 0 20px; }
    .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .attention-action-row { margin: 8px 0 0; }
    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 0.9em;
    }
    button:hover { background-color: var(--vscode-button-hoverBackground); }
    button.secondary {
      background-color: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    }
    button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
    .last-refresh { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-left: auto; }
    .refresh-hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; }

    a.section-link { color: var(--vscode-textLink-foreground); font-size: 0.82em; text-decoration: none; }
    a.section-link:hover { text-decoration: underline; }

    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .stat-tile {
      display: block;
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-left: 3px solid var(--tile-accent, var(--vscode-focusBorder));
      border-radius: 8px;
      padding: 14px 16px;
      background-color: var(--vscode-editorWidget-background, transparent);
      text-decoration: none;
      color: inherit;
    }
    .stat-tile .stat-head { display: flex; align-items: center; justify-content: space-between; }
    .stat-tile .stat-icon { font-size: 1.1em; }
    .stat-tile .stat-value { font-size: 1.9em; font-weight: 700; line-height: 1.3; }
    .stat-tile .stat-label { color: var(--vscode-descriptionForeground); font-size: 0.82em; }

    .failure-banner {
      border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-errorForeground));
      background-color: var(--vscode-inputValidation-warningBackground, transparent);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 0.85em;
      margin-bottom: 16px;
    }

    .section {
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 18px;
      background-color: var(--vscode-editorWidget-background, transparent);
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      list-style: none;
      cursor: pointer;
      margin-bottom: 10px;
    }
    .section-header::-webkit-details-marker { display: none; }
    .section-header::marker { content: ''; }
    .section-header h2 { font-size: 1em; margin: 0; display: flex; align-items: center; gap: 6px; }
    .section-chevron {
      width: 7px;
      height: 7px;
      border-right: 1.5px solid var(--vscode-descriptionForeground);
      border-bottom: 1.5px solid var(--vscode-descriptionForeground);
      transform: rotate(45deg);
      margin: 0 2px 4px 0;
      flex: none;
    }
    details.section:not([open]) > .section-header .section-chevron {
      transform: rotate(-45deg);
      margin-bottom: 0;
    }
    .section-header:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 3px; }
    .team-filter {
      max-width: 220px;
      min-width: 150px;
      background-color: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, transparent));
      border-radius: 4px;
      padding: 5px 8px;
    }
    .team-filter-row { display: flex; justify-content: flex-end; margin-bottom: 8px; }
    .section-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
    @media (max-width: 700px) {
      .team-filter-row { justify-content: stretch; }
      .team-filter { max-width: none; width: 100%; }
    }

    .item-list { display: flex; flex-direction: column; gap: 8px; }
    .item-card {
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-left: 3px solid var(--item-accent, var(--vscode-widget-border));
      border-radius: 6px;
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .item-card:hover { border-color: var(--vscode-focusBorder); }
    .item-icon { font-size: 1em; margin-top: 1px; }
    .item-body { flex: 1; min-width: 0; }
    .item-title { font-weight: 600; font-size: 0.92em; }
    .item-meta { color: var(--vscode-descriptionForeground); font-size: 0.8em; margin-top: 2px; }
    .attention-linked-pr { border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); margin-top: 8px; padding-top: 8px; }
    .item-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
    .item-badge { font-size: 0.7em; border-radius: 3px; padding: 2px 7px; white-space: nowrap; }
    .badge-red { background-color: rgba(248, 81, 73, 0.18); color: var(--vscode-charts-red, #f85149); }
    .badge-blue { background-color: rgba(31, 111, 235, 0.18); color: var(--vscode-charts-blue, #1f6feb); }
    .badge-orange { background-color: rgba(210, 153, 34, 0.18); color: var(--vscode-charts-orange, #d29922); }
    .badge-green { background-color: rgba(46, 160, 67, 0.18); color: var(--vscode-charts-green, #2ea043); }
    .badge-neutral { background-color: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }

    .empty-state { color: var(--vscode-descriptionForeground); padding: 10px 4px; font-size: 0.85em; }
    .sign-in-card {
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 8px;
      padding: 24px;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>📋 Daily Tasks</h1>
  <p class="subtitle" id="subtitle">Your daily work at a glance.</p>

  <div id="root"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    const subtitle = document.getElementById('subtitle');
    let githubState = null;
    let jiraState = null;
    let attentionInbox = null;
    let teamJiraFilter = '';
    let teamPrFilter = '';
    const expandedSections = {
      attentionSection: true,
      jiraSection: true,
      myPrsSection: true,
      teamJiraSection: true,
      teamPrsSection: true,
    };

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function post(message) {
      vscode.postMessage(message);
    }

    function relativeTime(iso) {
      if (!iso) return '';
      const diffMs = Date.now() - new Date(iso).getTime();
      const minutes = Math.round(diffMs / 60000);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return minutes + 'm ago';
      const hours = Math.round(minutes / 60);
      if (hours < 24) return hours + 'h ago';
      const days = Math.round(hours / 24);
      return days + 'd ago';
    }

    const PR_REASON_LABELS = {
      needs_my_review: { label: 'Needs your review', cls: 'badge-red' },
      new_activity: { label: 'New activity', cls: 'badge-blue' },
      waiting_for_review: { label: 'Waiting for review', cls: 'badge-orange' },
      merged: { label: 'Merged', cls: 'badge-green' },
      'pr-changes-requested': { label: 'Changes requested', cls: 'badge-red' },
      'pr-checks-failing': { label: 'Checks failing', cls: 'badge-red' },
      'pr-waiting-review': { label: 'Waiting for review', cls: 'badge-orange' },
      'pr-needs-my-review': { label: 'Needs your review', cls: 'badge-red' },
      'pr-unread-comment': { label: 'Unread comment', cls: 'badge-blue' },
      'jira-review': { label: 'Jira review', cls: 'badge-orange' },
      'jira-overdue': { label: 'Overdue', cls: 'badge-red' },
      'jira-due-today': { label: 'Due today', cls: 'badge-orange' },
      'jira-due-tomorrow': { label: 'Due tomorrow', cls: 'badge-orange' },
      'jira-unread-comment': { label: 'Unread comment', cls: 'badge-blue' },
    };

    function prBadges(item) {
      return item.reasons.map((r) => {
        const info = PR_REASON_LABELS[r] || { label: r.replace(/_/g, ' '), cls: 'badge-neutral' };
        return '<span class="item-badge ' + info.cls + '">' + escapeHtml(info.label) + '</span>';
      }).join('');
    }

    const CHECK_STATUS_LABELS = { SUCCESS: 'Checks passing', FAILURE: 'Checks failing', ERROR: 'Checks errored', PENDING: 'Checks running', EXPECTED: 'Checks pending' };

    function statusBadges(pr) {
      let html = '';
      if (pr.checkStatus) {
        const cls = pr.checkStatus === 'SUCCESS' ? 'badge-green' : (pr.checkStatus === 'FAILURE' || pr.checkStatus === 'ERROR') ? 'badge-red' : 'badge-orange';
        html += '<span class="item-badge ' + cls + '">' + escapeHtml(CHECK_STATUS_LABELS[pr.checkStatus] || pr.checkStatus) + '</span>';
      }
      if (pr.mergeable === 'CONFLICTING') {
        html += '<span class="item-badge badge-red">Has conflicts</span>';
      }
      return html;
    }

    function latestComment(pr) {
      if (!pr.comments || pr.comments.length === 0) return null;
      return pr.comments.reduce((latest, c) => (!latest || c.createdAt > latest.createdAt ? c : latest), null);
    }

    function prMeta(item) {
      const pr = item.pr;
      if (item.reasons.includes('new_activity') || item.reasons.includes('pr-unread-comment')) {
        const comment = latestComment(pr);
        if (comment && comment.body) {
          const snippet = comment.body.length > 60 ? comment.body.slice(0, 60) + '…' : comment.body;
          return 'New comment from ' + escapeHtml(comment.author) + ': "' + escapeHtml(snippet) + '"';
        }
      }
      return escapeHtml(pr.repoKey) + ' &middot; by ' + escapeHtml(pr.author) + ' &middot; updated ' + escapeHtml(relativeTime(pr.updatedAt));
    }

    function renderPrItem(item) {
      const pr = item.pr;
      const draftBadge = pr.draft ? '<span class="item-badge badge-neutral">Draft</span>' : '';
      return '<div class="item-card" role="button" tabindex="0" data-command="github.openPr" data-repo-key="' + escapeHtml(pr.repoKey) +
        '" data-number="' + pr.number + '" data-url="' + escapeHtml(pr.url) + '">' +
        '<span class="item-icon">🐙</span>' +
        '<div class="item-body">' +
        '<div class="item-title">#' + pr.number + ' ' + escapeHtml(pr.title) + '</div>' +
        '<div class="item-meta">' + prMeta(item) + '</div>' +
        '<div class="item-badges">' + draftBadge + prBadges(item) + statusBadges(pr) + '</div>' +
        '</div></div>';
    }

    function renderJiraItem(task) {
      const prLinkBadge = task.prLink.kind === 'linked'
        ? '<span class="item-badge badge-green">Has PR #' + escapeHtml(task.prLink.pr.number) + ' · ' + escapeHtml(task.prLink.pr.state) + '</span>'
        : task.prLink.kind === 'no-match'
        ? '<span class="item-badge badge-neutral">No PR</span>'
        : '<span class="item-badge badge-neutral">PR status unavailable</span>';
      const badges = '<span class="item-badge badge-neutral">' + escapeHtml(task.status) + '</span>' +
        (task.dueDate ? '<span class="item-badge badge-neutral">Due ' + escapeHtml(task.dueDate) + '</span>' : '') +
        ((task.commentAttention && task.commentAttention.unreadCount > 0)
          ? '<span class="item-badge badge-blue">' + task.commentAttention.unreadCount + ' unread comments</span>'
          : '') +
        (task.commentState === 'stale'
          ? '<span class="item-badge badge-orange">Comments stale</span>'
          : task.commentState === 'unavailable'
          ? '<span class="item-badge badge-neutral">Comments unavailable</span>'
          : '') +
        prLinkBadge;
      return '<div class="item-card" role="button" tabindex="0" data-command="jira.openTask" data-url="' + escapeHtml(task.url) + '">' +
        '<span class="item-icon">🔷</span>' +
        '<div class="item-body">' +
        '<div class="item-title">' + escapeHtml(task.key) + ' — ' + escapeHtml(task.summary) + '</div>' +
        '<div class="item-meta">' + escapeHtml(task.assignee || 'Unassigned') + '</div>' +
        '<div class="item-badges">' + badges + '</div>' +
        '</div></div>';
    }

    function operationError(state, operationId) {
      const operation = state && state.pendingOperations && state.pendingOperations[operationId];
      return operation && !operation.pending && operation.result && !operation.result.ok
        ? operation.result.reason || 'Could not complete the action.'
        : '';
    }

    function renderAttentionItem(item) {
      const task = item.jiraTask;
      const pr = item.pr;
      const relatedPRs = item.relatedPRs || [];
      const jiraOpen = jiraState && jiraState.pendingOperations && jiraState.pendingOperations['jira.openTask'];
      const githubOpen = githubState && githubState.pendingOperations && githubState.pendingOperations['github.openPr'];
      const githubCommentOpen = githubState && githubState.pendingOperations && githubState.pendingOperations['github.openComment'];
      const visibleReasons = relatedPRs.length > 0
        ? item.reasons.filter((reason) => reason.startsWith('jira-'))
        : item.reasons;
      const renderReasonBadge = (reason, unreadCount) => {
        const info = PR_REASON_LABELS[reason] || { label: reason.replace(/-/g, ' '), cls: 'badge-neutral' };
        const count = reason === 'jira-unread-comment'
          ? ' (' + item.jiraUnreadCount + ')'
          : reason === 'pr-unread-comment'
          ? ' (' + unreadCount + ')'
          : '';
        return '<span class="item-badge ' + info.cls + '">' + escapeHtml(info.label + count) + '</span>';
      };
      const reasonBadges = visibleReasons.map((reason) => renderReasonBadge(reason, item.prUnreadCount)).join('');
      const previewText = (comment) => {
        const body = String(comment.bodyText ?? '');
        return escapeHtml(body.length > 120 ? body.slice(0, 120) + '…' : body);
      };
      const commentPreviews = [
        item.jiraLatestUnreadComment
          ? '<div class="item-meta">Jira comment from ' + escapeHtml(item.jiraLatestUnreadComment.authorIdentity) +
            ': "' + previewText(item.jiraLatestUnreadComment) + '"</div>'
          : '',
        item.prLatestUnreadComment && relatedPRs.length === 0
          ? '<div class="item-meta">PR comment from ' + escapeHtml(item.prLatestUnreadComment.authorIdentity) +
            ': "' + previewText(item.prLatestUnreadComment) + '"</div>'
          : '',
      ].join('');
      const relatedPRsHtml = relatedPRs.map((related) => {
        const linkedPR = related.pr;
        const sourceKey = 'github:' + linkedPR.repoKey + '#' + linkedPR.number;
        const commentState = githubState && githubState.commentStatusBySource
          ? githubState.commentStatusBySource[sourceKey]
          : '';
        const commentStatus = commentState === 'stale'
          ? '<span class="item-badge badge-orange">PR comments stale</span>'
          : commentState === 'unavailable'
          ? '<span class="item-badge badge-neutral">PR comments unavailable</span>'
          : '';
        const badges = related.reasons
          .map((reason) => renderReasonBadge(reason, related.unreadCount))
          .join('');
        const commentPreview = related.latestUnreadComment
          ? '<div class="item-meta">PR comment from ' + escapeHtml(related.latestUnreadComment.authorIdentity) +
            ': "' + previewText(related.latestUnreadComment) + '"</div>'
          : '';
        const openPR = '<button type="button" class="secondary" data-command="github.openPr" data-repo-key="' +
          escapeHtml(linkedPR.repoKey) + '" data-number="' + linkedPR.number + '" data-url="' +
          escapeHtml(linkedPR.url) + '" aria-label="Open pull request ' + linkedPR.number + '"' +
          (githubOpen && githubOpen.pending ? ' disabled' : '') + '>' +
          (githubOpen && githubOpen.pending ? 'Opening PR…' : 'Open PR') + '</button>';
        const openComment = related.latestUnreadComment
          ? '<button type="button" class="secondary" data-command="github.openComment" data-repo-key="' +
            escapeHtml(linkedPR.repoKey) + '" data-number="' + linkedPR.number + '" data-url="' +
            escapeHtml(related.latestUnreadComment.url) + '" aria-label="Open latest comment on pull request ' +
            linkedPR.number + '"' + (githubCommentOpen && githubCommentOpen.pending ? ' disabled' : '') + '>' +
            (githubCommentOpen && githubCommentOpen.pending ? 'Opening comment…' : 'Open comment') + '</button>'
          : '';
        const errors = operationError(githubState, 'github.openPr') || operationError(githubState, 'github.openComment')
          ? '<span class="gh-error" role="alert">' +
            escapeHtml(operationError(githubState, 'github.openPr') || operationError(githubState, 'github.openComment')) +
            '</span>'
          : '';
        const linkedPRCommentsBadge = (linkedPR.comments && linkedPR.comments.length > 0) || related.unreadCount > 0
          ? '<span class="item-badge badge-neutral">PR comments</span>'
          : '';
        return '<div class="attention-linked-pr">' +
          '<div class="item-title">#' + linkedPR.number + ' ' + escapeHtml(linkedPR.title) + '</div>' +
          '<div class="item-meta">' + escapeHtml(linkedPR.repoKey) + ' · by ' + escapeHtml(linkedPR.author) + '</div>' +
          '<div class="item-badges">' + badges + linkedPRCommentsBadge + statusBadges(linkedPR) + commentStatus + '</div>' +
          commentPreview + '<div class="toolbar attention-action-row">' + openPR + openComment + errors + '</div></div>';
      }).join('');
      const jiraCommentState = task && task.commentState === 'stale'
        ? '<span class="item-badge badge-orange">Jira comments stale</span>'
        : task && task.commentState === 'unavailable'
        ? '<span class="item-badge badge-neutral">Jira comments unavailable</span>'
        : '';
      const jiraCommentsBadge = task && (
        (task.comments && task.comments.length > 0) || (task.commentAttention && task.commentAttention.unreadCount > 0)
      )
        ? '<span class="item-badge badge-neutral">Jira comments</span>'
        : '';
      const githubSourceKey = pr ? 'github:' + pr.repoKey + '#' + pr.number : '';
      const githubCommentState = pr && githubState && githubState.commentStatusBySource
        ? githubState.commentStatusBySource[githubSourceKey]
        : '';
      const githubCommentStatus = githubCommentState === 'stale'
        ? '<span class="item-badge badge-orange">PR comments stale</span>'
        : githubCommentState === 'unavailable'
        ? '<span class="item-badge badge-neutral">PR comments unavailable</span>'
        : '';
      const prCommentsBadge = pr && (
        (pr.comments && pr.comments.length > 0) || item.prUnreadCount > 0
      )
        ? '<span class="item-badge badge-neutral">PR comments</span>'
        : '';
      const jiraTitle = task
        ? escapeHtml(task.key) + ' — ' + escapeHtml(task.summary)
        : '';
      const prTitle = pr ? '#' + pr.number + ' ' + escapeHtml(pr.title) : '';
      const title = jiraTitle
        ? '<div class="item-title">' + jiraTitle + '</div>' +
          (prTitle ? '<div class="item-meta">' + prTitle + '</div>' : '')
        : '<div class="item-title">' + prTitle + '</div>';
      const jiraAction = task
        ? '<button type="button" class="secondary" data-command="jira.openTask" data-url="' + escapeHtml(task.url) +
          '" aria-label="Open Jira task ' + escapeHtml(task.key) + '"' + (jiraOpen && jiraOpen.pending ? ' disabled' : '') + '>' +
          (jiraOpen && jiraOpen.pending ? 'Opening Jira…' : 'Open Jira') + '</button>' +
          (operationError(jiraState, 'jira.openTask')
            ? '<span class="gh-error" role="alert">' + escapeHtml(operationError(jiraState, 'jira.openTask')) + '</span>'
            : '')
        : '';
      const prAction = pr
        ? '<button type="button" class="secondary" data-command="github.openPr" data-repo-key="' + escapeHtml(pr.repoKey) +
          '" data-number="' + pr.number + '" data-url="' + escapeHtml(pr.url) +
          '" aria-label="Open pull request ' + pr.number + '"' + (githubOpen && githubOpen.pending ? ' disabled' : '') + '>' +
          (githubOpen && githubOpen.pending ? 'Opening PR…' : 'Open PR') + '</button>' +
          (item.prLatestUnreadComment
            ? '<button type="button" class="secondary" data-command="github.openComment" data-repo-key="' + escapeHtml(pr.repoKey) +
              '" data-number="' + pr.number + '" data-url="' + escapeHtml(item.prLatestUnreadComment.url) +
              '" aria-label="Open latest comment on pull request ' + pr.number + '"' +
              (githubCommentOpen && githubCommentOpen.pending ? ' disabled' : '') + '>' +
              (githubCommentOpen && githubCommentOpen.pending ? 'Opening comment…' : 'Open comment') + '</button>'
            : '') +
          (operationError(githubState, 'github.openPr') || operationError(githubState, 'github.openComment')
            ? '<span class="gh-error" role="alert">' +
              escapeHtml(operationError(githubState, 'github.openPr') || operationError(githubState, 'github.openComment')) +
              '</span>'
            : '')
        : '';
      const activity = item.latestRelevantAt
        ? '<div class="item-meta">Updated ' + escapeHtml(relativeTime(item.latestRelevantAt)) + '</div>'
        : '';
      const jiraActionHtml = jiraAction
        ? '<div class="toolbar attention-action-row">' + jiraAction + '</div>'
        : '';
      const relatedPRList = relatedPRs.length > 0
        ? '<div class="attention-linked-prs"><div class="item-meta">Related PRs (' + relatedPRs.length + ')</div>' +
          relatedPRsHtml + '</div>'
        : '';
      const standalonePRAction = prAction
        ? '<div class="toolbar attention-action-row">' + prAction + '</div>'
        : '';

      return '<div class="item-card"><span class="item-icon">' + (task ? '🔷' : '🐙') + '</span>' +
        '<div class="item-body">' + title +
        '<div class="item-badges">' + reasonBadges + jiraCommentsBadge + prCommentsBadge +
        jiraCommentState + githubCommentStatus + '</div>' +
        commentPreviews + jiraActionHtml + relatedPRList + activity + standalonePRAction +
        '</div></div>';
    }

    function renderList(html, emptyText) {
      return html || '<div class="empty-state">' + escapeHtml(emptyText) + '</div>';
    }

    function sectionOpenAttribute(sectionId) {
      return expandedSections[sectionId] ? ' open' : '';
    }

    function getAllJiraTasks() {
      if (!jiraState || !jiraState.connected) return [];
      const byQuery = jiraState.tasksByQuery || {};
      return Object.keys(byQuery).flatMap((label) => byQuery[label]);
    }

    // Saved queries may include teammate tasks, so "My Jira Tasks" always filters by the configured user.
    function getMyJiraTasks() {
      const all = getAllJiraTasks();
      const currentUser = jiraState && jiraState.currentUser
        ? jiraState.currentUser.trim().toLowerCase()
        : '';
      if (!currentUser) return [];
      return all.filter((task) =>
        task.assignee && task.assignee.trim().toLowerCase() === currentUser);
    }

    function getTeamJiraTasks() {
      const members = new Set((jiraState && jiraState.teamMembers || [])
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean));
      return getAllJiraTasks().filter((task) =>
        task.assignee && members.has(task.assignee.trim().toLowerCase()) &&
        (!teamJiraFilter || task.assignee.trim().toLowerCase() === teamJiraFilter.trim().toLowerCase()));
    }

    function uniqueNames(names) {
      const seen = new Set();
      return names
        .filter((name) => {
          const normalized = name.trim().toLowerCase();
          if (!normalized || seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        })
        .sort((a, b) => a.localeCompare(b));
    }

    function renderTeammateOptions(teammates, selected) {
      return '<option value="">All teammates</option>' + teammates.map((name) =>
        '<option value="' + escapeHtml(name) + '"' + (name.toLowerCase() === selected.toLowerCase() ? ' selected' : '') + '>' +
        escapeHtml(name) + '</option>'
      ).join('');
    }

    function render() {
      const githubReady = githubState !== null;
      const jiraReady = jiraState !== null;
      const githubAuthenticated = githubReady && githubState.authenticated;
      const myPrItems = githubAuthenticated ? githubState.attention.myPRs : [];
      const teamPrTeammates = githubAuthenticated
        ? uniqueNames((githubState.monitoredAuthors || []).filter((author) => author.status === 'valid').map((author) => author.username))
        : [];
      const teamJiraTeammates = jiraReady
        ? uniqueNames((jiraState.teamMembers || []).map((name) => name.trim()))
        : [];
      if (teamPrFilter && !teamPrTeammates.some((name) => name.toLowerCase() === teamPrFilter.toLowerCase())) teamPrFilter = '';
      if (teamJiraFilter && !teamJiraTeammates.some((name) => name.toLowerCase() === teamJiraFilter.toLowerCase())) teamJiraFilter = '';
      const teamPrItems = githubAuthenticated
        ? githubState.attention.teamPRs.filter((item) =>
          !teamPrFilter || item.pr.author.toLowerCase() === teamPrFilter.toLowerCase())
        : [];
      const myJiraTasks = getMyJiraTasks();
      const teamJiraTasks = getTeamJiraTasks();
      const inboxItems = attentionInbox;
      const refreshing = !!(githubState && githubState.isRefreshing)
        || !!(jiraState && jiraState.isRefreshing);
      const signInCard = githubReady && !githubState.authenticated
        ? '<div class="sign-in-card"><p>Sign in to GitHub to load your PRs.</p>' +
          '<button type="button" data-command="github.signIn"' +
          (githubState.pendingOperations?.['github.signIn']?.pending ? ' disabled' : '') + '>' +
          (githubState.pendingOperations?.['github.signIn']?.pending ? 'Signing in…' : 'Sign in to GitHub') +
          '</button></div>'
        : '';

      subtitle.textContent = githubAuthenticated
        ? 'Signed in as ' + (githubState.me || '') + '.'
        : 'Your daily work at a glance.';

      const tiles = [
        { key: 'attention', icon: '🔔', accent: 'var(--vscode-charts-red, #f85149)', value: inboxItems ? inboxItems.length : '…', label: 'Needs Attention', href: '#attentionSection' },
        { key: 'mine', icon: '🐙', accent: 'var(--vscode-charts-blue, #1f6feb)', value: myPrItems.length, label: 'My PRs', href: '#myPrsSection' },
        { key: 'team', icon: '👥', accent: 'var(--vscode-charts-purple, #8957e5)', value: teamPrItems.length, label: 'Team PRs', href: '#teamPrsSection' },
        { key: 'jira', icon: '🔷', accent: 'var(--vscode-charts-blue, #1f6feb)', value: myJiraTasks.length, label: 'My Jira Tasks', href: '#jiraSection' },
        { key: 'teamJira', icon: '🔷', accent: 'var(--vscode-charts-green, #2ea043)', value: teamJiraTasks.length, label: 'Team Jira Tasks', href: '#teamJiraSection' },
      ];
      const statTiles = tiles.map((t) =>
        '<a class="stat-tile" style="--tile-accent:' + t.accent + '" href="' + t.href + '">' +
        '<div class="stat-head"><span class="stat-icon">' + t.icon + '</span></div>' +
        '<div class="stat-value">' + t.value + '</div>' +
        '<div class="stat-label">' + escapeHtml(t.label) + '</div>' +
        '</a>'
      ).join('');

      const allFailures = [...(githubReady ? githubState.failures : []), ...(jiraReady ? jiraState.failures : [])];
      const failureBanner = allFailures.length
        ? '<div class="failure-banner">' + allFailures.map((f) => escapeHtml(f.detail)).join('<br/>') + '</div>'
        : '';

      const lastRefreshTimes = [githubReady ? githubState.lastRefreshAt : null, jiraReady ? jiraState.lastRefreshAt : null]
        .filter(Boolean)
        .map((iso) => new Date(iso).getTime());
      const lastRefresh = lastRefreshTimes.length
        ? 'Last refreshed ' + new Date(Math.max(...lastRefreshTimes)).toLocaleTimeString()
        : '';

      const attentionHtml = inboxItems === null
        ? '<div class="empty-state">Loading provider attention…</div>'
        : renderList(inboxItems.map(renderAttentionItem).join(''), 'Nothing here. You\\'re all caught up.');
      const myPrsHtml = renderList(myPrItems.map(renderPrItem).join(''), 'No open PRs of yours.');
      const teamPrsHtml = renderList(teamPrItems.map(renderPrItem).join(''), 'No team PRs to show.');
      const hasJiraCurrentUser = !!(jiraReady && jiraState.currentUser && jiraState.currentUser.trim());
      const jiraEmptyText = !hasJiraCurrentUser
        ? 'Set your Jira display name in the Configuration tab to see tasks assigned to you.'
        : !jiraState.savedQueries.length
        ? 'No saved Jira queries yet.'
        : 'No tasks matched "' + jiraState.currentUser.trim() +
          '". Verify this matches the Jira assignee display name in Configuration.';
      const jiraHtml = !jiraReady
        ? '<div class="empty-state">Loading…</div>'
        : !jiraState.connected
        ? '<div class="empty-state">Connect Jira from the Configuration tab to see your tasks here.</div>'
        : renderList(myJiraTasks.map(renderJiraItem).join(''), jiraEmptyText);
      const teamJiraHtml = !jiraReady
        ? '<div class="empty-state">Loading…</div>'
        : !jiraState.connected
        ? '<div class="empty-state">Connect Jira from the Configuration tab to see team tasks here.</div>'
        : !(jiraState.teamMembers || []).length
        ? '<div class="empty-state">No Jira teammates configured.</div>'
        : renderList(teamJiraTasks.map(renderJiraItem).join(''), 'No team Jira tasks found.');

      root.innerHTML =
        '<div class="toolbar">' +
        '<button type="button" data-command="refreshAll"' + (refreshing ? ' disabled' : '') + '>' +
        (refreshing ? 'Refreshing…' : 'Refresh') + '</button>' +
        '<span class="refresh-hint">Auto-refreshes every ' + ${REFRESH_INTERVAL_MINUTES} + ' minutes while visible.</span>' +
        '<span class="last-refresh">' + escapeHtml(lastRefresh) + '</span>' +
        '</div>' +
        signInCard +
        failureBanner +
        '<div class="stat-grid">' + statTiles + '</div>' +
        '<details class="section" id="attentionSection"' + sectionOpenAttribute('attentionSection') + '>' +
        '<summary class="section-header"><h2>🔔 Attention Inbox (' + (inboxItems ? inboxItems.length : 0) + ')</h2><span class="section-chevron" aria-hidden="true"></span></summary>' +
        '<div class="item-list">' + attentionHtml + '</div>' +
        '</details>' +
        '<div class="section-row">' +
        '<details class="section" id="jiraSection"' + sectionOpenAttribute('jiraSection') + '>' +
        '<summary class="section-header"><h2>🔷 My Jira Tasks (' + myJiraTasks.length + ')</h2><span class="section-chevron" aria-hidden="true"></span></summary>' +
        '<div class="item-list">' + jiraHtml + '</div>' +
        '</details>' +
        '<details class="section" id="myPrsSection"' + sectionOpenAttribute('myPrsSection') + '>' +
        '<summary class="section-header"><h2>🐙 My PRs (' + myPrItems.length + ')</h2><span class="section-chevron" aria-hidden="true"></span></summary>' +
        '<div class="item-list">' + myPrsHtml + '</div>' +
        '</details>' +
        '</div>' +
        '<div class="section-row">' +
        '<details class="section" id="teamJiraSection"' + sectionOpenAttribute('teamJiraSection') + '>' +
        '<summary class="section-header"><h2>🔷 Team Jira Tasks (' + teamJiraTasks.length + ')</h2><span class="section-chevron" aria-hidden="true"></span></summary>' +
        '<div class="team-filter-row"><select class="team-filter" id="teamJiraFilter" aria-label="Filter Team Jira Tasks by teammate"' + (!teamJiraTeammates.length ? ' disabled' : '') + '>' +
        renderTeammateOptions(teamJiraTeammates, teamJiraFilter) + '</select></div>' +
        '<div class="item-list">' + teamJiraHtml + '</div>' +
        '</details>' +
        '<details class="section" id="teamPrsSection"' + sectionOpenAttribute('teamPrsSection') + '>' +
        '<summary class="section-header"><h2>👥 Team PRs (' + teamPrItems.length + ')</h2><span class="section-chevron" aria-hidden="true"></span></summary>' +
        '<div class="team-filter-row"><select class="team-filter" id="teamPrFilter" aria-label="Filter Team PRs by teammate"' + (!teamPrTeammates.length ? ' disabled' : '') + '>' +
        renderTeammateOptions(teamPrTeammates, teamPrFilter) + '</select></div>' +
        '<div class="item-list">' + teamPrsHtml + '</div>' +
        '</details>' +
        '</div>';

      wireActions();
    }

    function wireActions() {
      root.querySelectorAll('details.section').forEach((section) => {
        const summary = section.querySelector('summary');
        summary.addEventListener('click', () => {
          expandedSections[section.id] = !section.open;
        });
        section.addEventListener('toggle', () => {
          expandedSections[section.id] = section.open;
        });
      });

      const jiraFilter = root.querySelector('#teamJiraFilter');
      if (jiraFilter) {
        jiraFilter.addEventListener('change', () => {
          teamJiraFilter = jiraFilter.value;
          render();
        });
      }
      const prFilter = root.querySelector('#teamPrFilter');
      if (prFilter) {
        prFilter.addEventListener('change', () => {
          teamPrFilter = prFilter.value;
          render();
        });
      }

      root.querySelectorAll('[data-command]').forEach((el) => {
        const activate = () => {
          const command = el.getAttribute('data-command');
          if (command === 'refreshAll') {
            post({ command: 'github.refresh' });
            post({ command: 'jira.refresh' });
            return;
          }
          if (command === 'github.signIn') {
            post({ command: 'github.signIn' });
            return;
          }
          if (command === 'github.openPr') {
            post({
              command: 'github.openPr',
              repoKey: el.getAttribute('data-repo-key'),
              number: Number(el.getAttribute('data-number')),
              url: el.getAttribute('data-url'),
            });
            return;
          }
          if (command === 'jira.openTask') {
            post({ command: 'jira.openTask', url: el.getAttribute('data-url') });
          }
          if (command === 'github.openComment') {
            post({
              command: 'github.openComment',
              repoKey: el.getAttribute('data-repo-key'),
              number: Number(el.getAttribute('data-number')),
              url: el.getAttribute('data-url'),
            });
          }
        };
        el.addEventListener('click', activate);
        if (el.getAttribute('role') === 'button') {
          el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              activate();
            }
          });
        }
      });
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message && message.command === 'github.state') {
        githubState = message.state;
        render();
      } else if (message && message.command === 'jira.state') {
        jiraState = message.state;
        render();
      } else if (message && message.command === 'dashboard.inboxState') {
        attentionInbox = message.items || [];
        render();
      }
    });

    render();
    post({ command: 'github.refresh' });
    post({ command: 'jira.refresh' });
  </script>
</body>
</html>`;
  }
}
