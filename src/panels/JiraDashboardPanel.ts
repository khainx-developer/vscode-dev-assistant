import * as vscode from 'vscode';
import { JiraViewController } from '../jira/viewController';
import type { JiraConfigStore } from '../jira/configStore';
import type { JiraConnectionStore } from '../jira/connectionStore';
import type { JiraIncomingMessage } from '../jira/types';
import type { McpConnectionService } from '../mcp/connectionService';
import type { PullRequestCache } from '../github/pullRequestCache';
import { RefreshScheduler } from '../github/refreshScheduler';
import { panelVisibilityHost } from './DashboardPanel';
import { getNonce } from '../webview/nonce';

export interface JiraServices {
  connectionStore: JiraConnectionStore;
  configStore: JiraConfigStore;
  connectionService: McpConnectionService;
  pullRequestCache: PullRequestCache;
  outputChannel: vscode.OutputChannel;
}

export class JiraDashboardPanel {
  private static instance: JiraDashboardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly controller: JiraViewController;
  private readonly scheduler: RefreshScheduler;
  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(
    extensionUri: vscode.Uri,
    _context: vscode.ExtensionContext,
    services: JiraServices,
  ): void {
    if (JiraDashboardPanel.instance) {
      JiraDashboardPanel.instance.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'devUtilities.jiraDashboard',
      'Jira Tasks',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    JiraDashboardPanel.instance = new JiraDashboardPanel(panel, services);
  }

  private constructor(panel: vscode.WebviewPanel, services: JiraServices) {
    this.panel = panel;
    this.panel.webview.html = this.render();
    this.controller = new JiraViewController(
      panel,
      services.connectionStore,
      services.configStore,
      services.connectionService,
      services.pullRequestCache,
      services.outputChannel,
    );
    this.scheduler = new RefreshScheduler(panelVisibilityHost(panel), () => this.controller.refresh());

    this.panel.webview.onDidReceiveMessage(
      (message: JiraIncomingMessage) => void this.controller.handleMessage(message),
      undefined,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  private dispose(): void {
    JiraDashboardPanel.instance = undefined;
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
  <title>Jira Tasks</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; }
    h1 { font-size: 1.4em; margin: 0 0 16px; }
    h2 { font-size: 1.1em; margin: 0 0 8px; }
    .section { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 14px; margin: 12px 0; }
    label { display: block; margin: 10px 0 4px; }
    input, textarea { box-sizing: border-box; width: 100%; padding: 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
    button { margin: 10px 8px 0 0; padding: 6px 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .task { border-top: 1px solid var(--vscode-panel-border); padding: 10px 0; }
    .task:first-of-type { border-top: 0; }
    .muted { color: var(--vscode-descriptionForeground); }
    .error { color: var(--vscode-errorForeground); margin-top: 8px; }
    .badge { display: inline-block; margin-left: 8px; }
    .link-button { padding: 0; margin: 0; color: var(--vscode-textLink-foreground); background: transparent; text-decoration: underline; }
    .status-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .status-bar .dot { color: var(--vscode-testing-iconPassed, #3fb950); }
    .status-bar .site { font-weight: 600; }
    .status-bar button { margin: 0; }
  </style>
</head>
<body>
  <h1>Jira Tasks</h1>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    let state = { connected: false, savedQueries: [], tasksByQuery: {}, failures: [] };
    let connectionError = '';
    let queryError = '';

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }

    function renderTask(task) {
      let prBadge = '';
      if (task.prLink.kind === 'linked') {
        prBadge = '<button class="link-button" data-command="jira.openPr" data-url="' +
          escapeHtml(task.prLink.pr.url) + '">' + escapeHtml(task.prLink.pr.state) +
          ' PR #' + escapeHtml(task.prLink.pr.number) + '</button>';
      } else if (task.prLink.kind === 'no-match') {
        prBadge = 'No PR found';
      } else {
        prBadge = 'PR status unavailable';
      }

      return '<div class="task">' +
        '<button class="link-button" data-command="jira.openTask" data-url="' +
        escapeHtml(task.url) + '"><strong>' + escapeHtml(task.key) + '</strong> — ' +
        escapeHtml(task.summary) + '</button>' +
        '<div>' + escapeHtml(task.status) + ' · ' +
        escapeHtml(task.assignee || 'Unassigned') +
        '<span class="badge">' + prBadge + '</span></div></div>';
    }

    function render() {
      const globalFailures = (state.failures || []).filter((failure) => !failure.queryLabel);
      if (!state.connected) {
        root.innerHTML = '<form id="connectionForm" class="section">' +
          '<h2>Connect to Jira</h2>' +
          '<label for="siteUrl">Jira site URL</label><input id="siteUrl" type="url" required />' +
          '<button type="submit">Connect to Jira</button>' +
          '<div class="error">' + escapeHtml(connectionError ||
            globalFailures.map((failure) => failure.detail).join(' ')) + '</div></form>';
        return;
      }

      let html = '<div class="section status-bar"><span><span class="dot">●</span> Connected to ' +
        '<span class="site">' + escapeHtml(state.siteUrl || '') + '</span></span>' +
        '<span><button data-command="jira.refresh">Refresh</button>' +
        '<button data-command="jira.disconnect">Disconnect</button></span></div>' +
        '<form id="queryForm" class="section"><h2>Add saved query</h2>' +
        '<label for="queryLabel">Label</label><input id="queryLabel" required />' +
        '<label for="jql">JQL</label><textarea id="jql" rows="3" required></textarea>' +
        '<button type="submit">Add query</button><div class="error">' +
        escapeHtml(queryError) + '</div></form>';
      for (const query of state.savedQueries || []) {
        const tasks = (state.tasksByQuery || {})[query.label] || [];
        const failures = (state.failures || []).filter((failure) => failure.queryLabel === query.label);
        html += '<section class="section"><h2>' + escapeHtml(query.label) + '</h2>' +
          '<div class="muted">' + escapeHtml(query.jql) + '</div>' +
          failures.map((failure) => '<div class="error">' + escapeHtml(query.label + ': ' + failure.detail) + '</div>').join('') +
          (tasks.length ? tasks.map(renderTask).join('') : '<p class="muted">No tasks to show.</p>') +
          '</section>';
      }
      html += globalFailures.map((failure) => '<div class="error">' + escapeHtml(failure.detail) + '</div>').join('');
      root.innerHTML = html;
    }

    root.addEventListener('submit', (event) => {
      event.preventDefault();
      if (event.target.id === 'connectionForm') {
        vscode.postMessage({
          command: 'jira.saveConnection',
          siteUrl: document.getElementById('siteUrl').value,
        });
      } else if (event.target.id === 'queryForm') {
        vscode.postMessage({
          command: 'jira.addQuery',
          label: document.getElementById('queryLabel').value,
          jql: document.getElementById('jql').value
        });
      }
    });

    root.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-command]') : null;
      if (button) {
        vscode.postMessage({
          command: button.dataset.command,
          url: button.dataset.url
        });
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.command === 'jira.state') {
        state = message.state;
      } else if (message.command === 'jira.connectionResult') {
        connectionError = message.ok ? '' : message.reason;
      } else if (message.command === 'jira.queryResult') {
        queryError = message.ok ? '' : message.reason;
      }
      render();
    });

    render();
    vscode.postMessage({ command: 'jira.refresh' });
  </script>
</body>
</html>`;
  }
}
