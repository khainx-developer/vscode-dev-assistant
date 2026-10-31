import * as vscode from 'vscode';
import { GitHubAuthService } from '../github/auth';
import { GitHubClient } from '../github/client';
import { GitHubConfigStore } from '../github/configStore';
import { GitHubIncomingMessage } from '../github/types';
import { GitHubViewController } from '../github/viewController';
import { LastSeenStore } from '../github/lastSeenStore';
import { RefreshScheduler, RefreshVisibilityHost } from '../github/refreshScheduler';
import { getNonce } from '../webview/nonce';

interface GitHubServices {
  authService: GitHubAuthService;
  configStore: GitHubConfigStore;
  client: typeof GitHubClient;
  lastSeenStore: LastSeenStore;
}

function panelVisibilityHost(panel: vscode.WebviewPanel): RefreshVisibilityHost {
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
  private readonly controller: GitHubViewController;
  private readonly scheduler: RefreshScheduler;
  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    services: GitHubServices,
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

    DashboardPanel.instance = new DashboardPanel(panel, context, services);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, services: GitHubServices) {
    this.panel = panel;
    this.panel.webview.html = this.render();

    this.controller = new GitHubViewController(
      context,
      panel,
      services.authService,
      services.configStore,
      services.client,
      services.lastSeenStore,
    );
    this.scheduler = new RefreshScheduler(panelVisibilityHost(panel), () => this.controller.refresh());

    this.panel.webview.onDidReceiveMessage(
      (message: GitHubIncomingMessage) => void this.controller.handleMessage(message),
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
      max-width: 1100px;
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
    button.filter[aria-pressed="true"] {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .last-refresh { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-left: auto; }

    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 26px; }
    .stat-tile {
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 8px;
      padding: 16px;
      background-color: var(--vscode-editorWidget-background, transparent);
      cursor: pointer;
    }
    .stat-tile.active { border-color: var(--vscode-focusBorder); }
    .stat-tile .stat-value { font-size: 2em; font-weight: 700; line-height: 1; }
    .stat-tile .stat-label { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-top: 6px; }

    .failure-banner {
      border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-errorForeground));
      background-color: var(--vscode-inputValidation-warningBackground, transparent);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 0.85em;
      margin-bottom: 16px;
    }

    .pr-list { display: flex; flex-direction: column; gap: 10px; }
    .pr-card {
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 8px;
      padding: 14px 16px;
      background-color: var(--vscode-editorWidget-background, transparent);
    }
    .pr-card .pr-title { font-weight: 600; font-size: 1em; cursor: pointer; }
    .pr-card .pr-title:hover { text-decoration: underline; }
    .pr-card .pr-meta { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 4px 0 8px; }
    .pr-card .pr-footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .pr-reasons { display: flex; flex-wrap: wrap; gap: 6px; }
    .pr-reason {
      font-size: 0.72em;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      padding: 2px 8px;
    }
    .pr-badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 8px; }
    .pr-badge { font-size: 0.72em; border-radius: 3px; padding: 2px 8px; }
    .pr-badge.check-success { background-color: rgba(46, 160, 67, 0.18); color: #2ea043; }
    .pr-badge.check-failure, .pr-badge.check-error { background-color: rgba(248, 81, 73, 0.18); color: #f85149; }
    .pr-badge.check-pending, .pr-badge.check-expected { background-color: rgba(210, 153, 34, 0.18); color: #d29922; }
    .pr-badge.conflicting { background-color: rgba(248, 81, 73, 0.18); color: #f85149; }
    .pr-label {
      font-size: 0.72em;
      border-radius: 3px;
      padding: 2px 8px;
      color: #fff;
    }
    .empty-state { text-align: center; color: var(--vscode-descriptionForeground); padding: 40px 8px; }
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
  <p class="subtitle" id="subtitle">Pull requests across your monitored repos and teammates.</p>

  <div id="root"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    const subtitle = document.getElementById('subtitle');
    let filter = 'inbox';
    let lastState = null;

    function escapeHtml(value) {
      return String(value)
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

    function checkStatusBadge(checkStatus) {
      if (!checkStatus) return '';
      const labels = { SUCCESS: 'Checks passing', FAILURE: 'Checks failing', ERROR: 'Checks errored', PENDING: 'Checks running', EXPECTED: 'Checks pending' };
      const cls = 'pr-badge check-' + checkStatus.toLowerCase();
      return '<span class="pr-badge ' + cls + '">' + escapeHtml(labels[checkStatus] || checkStatus) + '</span>';
    }

    function renderPrList(items) {
      if (items.length === 0) {
        return '<div class="empty-state">Nothing here. You\\'re all caught up.</div>';
      }
      return '<div class="pr-list">' + items.map((item) => {
        const pr = item.pr;
        const reasons = item.reasons
          .map((r) => '<span class="pr-reason">' + escapeHtml(r.replace(/_/g, ' ')) + '</span>')
          .join('');

        const labelBadges = (pr.labels || [])
          .map((l) => '<span class="pr-label" style="background-color:#' + escapeHtml(l.color) + '">' + escapeHtml(l.name) + '</span>')
          .join('');
        const conflictBadge = pr.mergeable === 'CONFLICTING'
          ? '<span class="pr-badge conflicting">Has conflicts</span>'
          : '';
        const badges = checkStatusBadge(pr.checkStatus) + conflictBadge + labelBadges;

        return (
          '<div class="pr-card">' +
          '<div class="pr-title" data-open-pr data-repo-key="' + escapeHtml(pr.repoKey) + '" data-number="' + pr.number + '" data-url="' + escapeHtml(pr.url) + '">' +
          '#' + pr.number + ' ' + escapeHtml(pr.title) +
          '</div>' +
          '<div class="pr-meta">' + escapeHtml(pr.repoKey) + ' &middot; by ' + escapeHtml(pr.author) + ' &middot; ' + escapeHtml(item.reviewState.replace(/_/g, ' ')) + ' &middot; updated ' + escapeHtml(relativeTime(pr.updatedAt)) + '</div>' +
          (badges ? '<div class="pr-badges">' + badges + '</div>' : '') +
          '<div class="pr-footer">' +
          '<div class="pr-reasons">' + reasons + '</div>' +
          '<button class="secondary" data-mark-read data-repo-key="' + escapeHtml(pr.repoKey) + '" data-number="' + pr.number + '">Mark as Read</button>' +
          '</div>' +
          '</div>'
        );
      }).join('') + '</div>';
    }

    function render(state) {
      lastState = state;

      if (!state.authenticated) {
        subtitle.textContent = 'Sign in to see pull requests that need your attention.';
        root.innerHTML =
          '<div class="sign-in-card"><p>Sign in to GitHub to load your attention inbox.</p>' +
          '<button data-sign-in>Sign in to GitHub</button></div>';
        wireActions();
        return;
      }

      subtitle.textContent = 'Signed in as ' + state.me + '.';

      const lists = { inbox: state.attention.attentionInbox, mine: state.attention.myPRs, team: state.attention.teamPRs };
      const tiles = [
        { key: 'inbox', label: 'Attention Inbox', value: state.attention.attentionInbox.length },
        { key: 'mine', label: 'My PRs', value: state.attention.myPRs.length },
        { key: 'team', label: 'Team PRs', value: state.attention.teamPRs.length },
      ];

      const statTiles = tiles.map((t) =>
        '<div class="stat-tile' + (filter === t.key ? ' active' : '') + '" data-filter="' + t.key + '" tabindex="0" role="button">' +
        '<div class="stat-value">' + t.value + '</div>' +
        '<div class="stat-label">' + escapeHtml(t.label) + '</div>' +
        '</div>'
      ).join('');

      const failureBanner = state.failures.length
        ? '<div class="failure-banner">' + state.failures.map((f) => escapeHtml(f.detail)).join('<br/>') + '</div>'
        : '';

      const lastRefresh = state.lastRefreshAt
        ? 'Last refreshed ' + new Date(state.lastRefreshAt).toLocaleTimeString()
        : '';

      root.innerHTML =
        '<div class="toolbar">' +
        '<button data-refresh>Refresh</button>' +
        '<span class="last-refresh">' + escapeHtml(lastRefresh) + '</span>' +
        '</div>' +
        failureBanner +
        '<div class="stat-grid">' + statTiles + '</div>' +
        renderPrList(lists[filter]);

      wireActions();
    }

    function wireActions() {
      const signIn = root.querySelector('[data-sign-in]');
      if (signIn) signIn.addEventListener('click', () => post({ command: 'github.signIn' }));

      const refresh = root.querySelector('[data-refresh]');
      if (refresh) refresh.addEventListener('click', () => post({ command: 'github.refresh' }));

      root.querySelectorAll('[data-filter]').forEach((el) => {
        el.addEventListener('click', () => {
          filter = el.getAttribute('data-filter');
          if (lastState) render(lastState);
        });
      });

      root.querySelectorAll('[data-mark-read]').forEach((btn) => {
        btn.addEventListener('click', () =>
          post({ command: 'github.markRead', repoKey: btn.getAttribute('data-repo-key'), number: Number(btn.getAttribute('data-number')) })
        );
      });

      root.querySelectorAll('[data-open-pr]').forEach((el) => {
        el.addEventListener('click', () =>
          post({
            command: 'github.openPr',
            repoKey: el.getAttribute('data-repo-key'),
            number: Number(el.getAttribute('data-number')),
            url: el.getAttribute('data-url'),
          })
        );
      });
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message && message.command === 'github.state') {
        render(message.state);
      }
    });

    post({ command: 'github.refresh' });
  </script>
</body>
</html>`;
  }
}
