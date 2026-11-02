import * as vscode from 'vscode';
import { GitHubAuthService } from '../github/auth';
import { GitHubConfigStore } from '../github/configStore';
import { GitHubIncomingMessage } from '../github/types';
import { GitHubViewController } from '../github/viewController';
import { LastSeenStore } from '../github/lastSeenStore';
import type { McpConnectionService } from '../mcp/connectionService';
import type { PullRequestCache } from '../github/pullRequestCache';
import { RefreshScheduler, RefreshVisibilityHost } from '../github/refreshScheduler';
import { JiraViewController } from '../jira/viewController';
import type { JiraIncomingMessage } from '../jira/types';
import type { JiraServices } from './JiraDashboardPanel';
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
      'devUtilities.dashboard',
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

    this.githubController = new GitHubViewController(
      context,
      panel,
      githubServices.authService,
      githubServices.configStore,
      githubServices.connectionService,
      githubServices.lastSeenStore,
      githubServices.pullRequestCache,
      jiraServices.outputChannel,
    );
    this.jiraController = new JiraViewController(
      panel,
      jiraServices.connectionStore,
      jiraServices.configStore,
      jiraServices.connectionService,
      jiraServices.pullRequestCache,
      jiraServices.outputChannel,
    );
    this.scheduler = new RefreshScheduler(panelVisibilityHost(panel), async () => {
      await Promise.all([this.githubController.refresh(), this.jiraController.refresh()]);
    });

    this.panel.webview.onDidReceiveMessage(
      (message: IncomingMessage) => {
        if (typeof message.command === 'string' && message.command.startsWith('jira.')) {
          void this.jiraController.handleMessage(message as JiraIncomingMessage);
        } else {
          void this.githubController.handleMessage(message as GitHubIncomingMessage);
        }
      },
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  private dispose(): void {
    DashboardPanel.instance = undefined;
    this.scheduler.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
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
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .section-header h2 { font-size: 1em; margin: 0; display: flex; align-items: center; gap: 6px; }
    .section-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }

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

    // Jira 'duedate' is a plain YYYY-MM-DD with no time component — compare by calendar day,
    // not elapsed milliseconds, so "due today" doesn't flip to "overdue" partway through the day.
    function dueDateInfo(dueDate) {
      if (!dueDate) return null;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = new Date(dueDate + 'T00:00:00');
      const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
      if (diffDays < 0) return { label: 'Overdue', cls: 'badge-red', urgency: 0 };
      if (diffDays === 0) return { label: 'Due today', cls: 'badge-orange', urgency: 1 };
      if (diffDays === 1) return { label: 'Due tomorrow', cls: 'badge-orange', urgency: 2 };
      if (diffDays <= 3) return { label: 'Due in ' + diffDays + ' days', cls: 'badge-neutral', urgency: 3 };
      return null;
    }

    const PR_REASON_LABELS = {
      needs_my_review: { label: 'Needs your review', cls: 'badge-red' },
      new_activity: { label: 'New activity', cls: 'badge-blue' },
      waiting_for_review: { label: 'Waiting for review', cls: 'badge-orange' },
      merged: { label: 'Merged', cls: 'badge-green' },
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
      if (item.reasons.includes('new_activity')) {
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
      return '<div class="item-card" data-command="github.openPr" data-repo-key="' + escapeHtml(pr.repoKey) +
        '" data-number="' + pr.number + '" data-url="' + escapeHtml(pr.url) + '">' +
        '<span class="item-icon">🐙</span>' +
        '<div class="item-body">' +
        '<div class="item-title">#' + pr.number + ' ' + escapeHtml(pr.title) + '</div>' +
        '<div class="item-meta">' + prMeta(item) + '</div>' +
        '<div class="item-badges">' + prBadges(item) + statusBadges(pr) + '</div>' +
        '</div></div>';
    }

    function renderJiraItem(task) {
      const due = dueDateInfo(task.dueDate);
      const badges = '<span class="item-badge badge-neutral">' + escapeHtml(task.status) + '</span>' +
        (due ? '<span class="item-badge ' + due.cls + '">' + escapeHtml(due.label) + '</span>' : '');
      return '<div class="item-card" data-command="jira.openTask" data-url="' + escapeHtml(task.url) + '">' +
        '<span class="item-icon">🔷</span>' +
        '<div class="item-body">' +
        '<div class="item-title">' + escapeHtml(task.key) + ' — ' + escapeHtml(task.summary) + '</div>' +
        '<div class="item-meta">' + escapeHtml(task.assignee || 'Unassigned') + '</div>' +
        '<div class="item-badges">' + badges + '</div>' +
        '</div></div>';
    }

    function renderList(html, emptyText) {
      return html || '<div class="empty-state">' + escapeHtml(emptyText) + '</div>';
    }

    function getAllJiraTasks() {
      if (!jiraState || !jiraState.connected) return [];
      const byQuery = jiraState.tasksByQuery || {};
      return Object.keys(byQuery).flatMap((label) => byQuery[label]);
    }

    // "My Jira Tasks" is filtered to the configured display name once set (devAssistant.jira.currentUser);
    // saved queries are arbitrary JQL and may include tasks assigned to teammates, not just the user's own.
    function getMyJiraTasks() {
      const all = getAllJiraTasks();
      if (!jiraState || !jiraState.currentUser) return all;
      return all.filter((task) => task.assignee === jiraState.currentUser);
    }

    function getJiraAttentionTasks() {
      return getMyJiraTasks()
        .map((task) => ({ task, due: dueDateInfo(task.dueDate) }))
        .filter((entry) => entry.due && entry.due.urgency <= 2)
        .sort((a, b) => a.due.urgency - b.due.urgency)
        .map((entry) => entry.task);
    }

    function render() {
      const githubReady = githubState !== null;
      const jiraReady = jiraState !== null;

      if (githubReady && !githubState.authenticated) {
        subtitle.textContent = 'Sign in to see pull requests that need your attention.';
        root.innerHTML =
          '<div class="sign-in-card"><p>Sign in to GitHub to load your attention inbox.</p>' +
          '<button data-command="github.signIn">Sign in to GitHub</button></div>';
        wireActions();
        return;
      }

      const prAttentionItems = githubReady ? githubState.attention.attentionInbox : [];
      const myPrItems = githubReady ? githubState.attention.myPRs : [];
      const teamPrItems = githubReady ? githubState.attention.teamPRs : [];
      const jiraAttentionTasks = getJiraAttentionTasks();
      const myJiraTasks = getMyJiraTasks();

      subtitle.textContent = githubReady && githubState.me ? 'Signed in as ' + githubState.me + '.' : 'Your daily work at a glance.';

      const tiles = [
        { key: 'attention', icon: '🔔', accent: 'var(--vscode-charts-red, #f85149)', value: prAttentionItems.length + jiraAttentionTasks.length, label: 'Needs Attention', href: '#attentionSection' },
        { key: 'mine', icon: '🐙', accent: 'var(--vscode-charts-blue, #1f6feb)', value: myPrItems.length, label: 'My PRs', href: '#myPrsSection' },
        { key: 'team', icon: '👥', accent: 'var(--vscode-charts-purple, #8957e5)', value: teamPrItems.length, label: 'Team PRs', href: '#teamPrsSection' },
        { key: 'jira', icon: '🔷', accent: 'var(--vscode-charts-blue, #1f6feb)', value: myJiraTasks.length, label: 'My Jira Tasks', href: '#jiraSection' },
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

      const attentionHtml = renderList(
        prAttentionItems.map(renderPrItem).join('') + jiraAttentionTasks.map(renderJiraItem).join(''),
        'Nothing here. You\\'re all caught up.',
      );
      const myPrsHtml = renderList(myPrItems.map(renderPrItem).join(''), 'No open PRs of yours.');
      const teamPrsHtml = renderList(teamPrItems.map(renderPrItem).join(''), 'No team PRs to show.');
      const jiraUserHint = jiraReady && jiraState.connected && !jiraState.currentUser
        ? '<div class="empty-state">Showing all saved-query results — set your Jira display name in the Configuration tab to filter to just your tasks.</div>'
        : '';
      const jiraHtml = !jiraReady
        ? '<div class="empty-state">Loading…</div>'
        : !jiraState.connected
        ? '<div class="empty-state">Connect Jira from the Configuration tab to see your tasks here.</div>'
        : jiraUserHint + renderList(myJiraTasks.map(renderJiraItem).join(''), 'No saved Jira queries yet.');

      root.innerHTML =
        '<div class="toolbar">' +
        '<button data-command="refreshAll">Refresh</button>' +
        '<span class="last-refresh">' + escapeHtml(lastRefresh) + '</span>' +
        '</div>' +
        failureBanner +
        '<div class="stat-grid">' + statTiles + '</div>' +
        '<section class="section" id="attentionSection">' +
        '<div class="section-header"><h2>🔔 Attention Inbox (' + (prAttentionItems.length + jiraAttentionTasks.length) + ')</h2></div>' +
        '<div class="item-list">' + attentionHtml + '</div>' +
        '</section>' +
        '<div class="section-row">' +
        '<section class="section" id="myPrsSection">' +
        '<div class="section-header"><h2>🐙 My PRs (' + myPrItems.length + ')</h2></div>' +
        '<div class="item-list">' + myPrsHtml + '</div>' +
        '</section>' +
        '<section class="section" id="teamPrsSection">' +
        '<div class="section-header"><h2>👥 Team PRs (' + teamPrItems.length + ')</h2></div>' +
        '<div class="item-list">' + teamPrsHtml + '</div>' +
        '</section>' +
        '</div>' +
        '<section class="section" id="jiraSection">' +
        '<div class="section-header"><h2>🔷 My Jira Tasks (' + myJiraTasks.length + ')</h2></div>' +
        '<div class="item-list">' + jiraHtml + '</div>' +
        '</section>';

      wireActions();
    }

    function wireActions() {
      root.querySelectorAll('[data-command]').forEach((el) => {
        el.addEventListener('click', () => {
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
        });
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
