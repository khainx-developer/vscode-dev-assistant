import * as vscode from 'vscode';
import { tools } from '../tools/registry';
import { getNonce } from '../webview/nonce';
import { GitHubAuthService } from '../github/auth';
import { GitHubClient } from '../github/client';
import { GitHubConfigStore } from '../github/configStore';
import { GitHubIncomingMessage } from '../github/types';
import { GitHubViewController } from '../github/viewController';
import { LastSeenStore } from '../github/lastSeenStore';
import { RefreshScheduler } from '../github/refreshScheduler';

type IncomingMessage = { command: 'openTool' | 'openDashboard'; toolId?: string } | GitHubIncomingMessage;

interface GitHubServices {
  authService: GitHubAuthService;
  configStore: GitHubConfigStore;
  client: typeof GitHubClient;
  lastSeenStore: LastSeenStore;
}

const TAB_ORDER: Array<{ id: 'daily' | 'other' | 'config'; label: string }> = [
  { id: 'daily', label: 'Daily Tasks' },
  { id: 'other', label: 'Other Tools' },
  { id: 'config', label: 'Configuration' },
];

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly githubServices: GitHubServices,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.render();

    const controller = new GitHubViewController(
      this.context,
      webviewView,
      this.githubServices.authService,
      this.githubServices.configStore,
      this.githubServices.client,
      this.githubServices.lastSeenStore,
    );
    const scheduler = new RefreshScheduler(webviewView, () => controller.refresh());

    webviewView.webview.onDidReceiveMessage((message: IncomingMessage) => {
      if (message.command === 'openTool') {
        void vscode.commands.executeCommand('devUtilities.openTool', message.toolId);
      } else if (message.command === 'openDashboard') {
        void vscode.commands.executeCommand('devUtilities.openDashboard');
      } else if (typeof message.command === 'string' && message.command.startsWith('github.')) {
        void controller.handleMessage(message as GitHubIncomingMessage);
      }
    });

    webviewView.onDidDispose(() => scheduler.dispose());
  }

  private render(): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

    const tabButtons = TAB_ORDER.map(
      (tab) => `<button class="tab${tab.id === 'daily' ? ' active' : ''}" data-tab="${tab.id}">${escapeHtml(tab.label)}</button>`
    ).join('\n');

    const cards = tools
      .map(
        (tool) => `
      <div class="card" data-category="${tool.category}" data-tool-id="${escapeHtml(tool.id)}" tabindex="0" role="button" style="display:none;">
        <div class="card-header">
          <span class="icon">${escapeHtml(tool.icon)}</span>
          <span class="title">${escapeHtml(tool.title)}</span>
        </div>
        <p class="description">${escapeHtml(tool.description)}</p>
        <div class="tags">${tool.tags.map((t) => `<span class="tag">${escapeHtml(t.toUpperCase())}</span>`).join('')}</div>
      </div>`
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dev Assistant</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
      padding: 10px;
      margin: 0;
    }
    .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .tab {
      background-color: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      border: 1px solid transparent;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 0.8em;
      cursor: pointer;
    }
    .tab.active {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .tab:hover:not(.active) { background-color: var(--vscode-button-secondaryHoverBackground); }
    .grid { display: flex; flex-direction: column; gap: 8px; }
    .card {
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 6px;
      padding: 10px 12px;
      cursor: pointer;
      background-color: var(--vscode-editorWidget-background, transparent);
    }
    .card:hover, .card:focus {
      border-color: var(--vscode-focusBorder);
      outline: none;
    }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .card-header .icon { font-size: 1.1em; }
    .card-header .title { font-weight: 600; font-size: 0.95em; }
    .card .description { margin: 0 0 6px; font-size: 0.82em; color: var(--vscode-descriptionForeground); }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .tag {
      font-size: 0.65em;
      letter-spacing: 0.02em;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      padding: 1px 6px;
    }
    .empty-state { text-align: center; color: var(--vscode-descriptionForeground); padding: 24px 8px; font-size: 0.85em; }

    #githubRoot { display: none; font-size: 0.85em; }
    .gh-section { margin-bottom: 14px; }
    .gh-section h3 { font-size: 0.85em; margin: 0 0 6px; color: var(--vscode-foreground); }
    .gh-row { display: flex; gap: 6px; margin-bottom: 4px; }
    .gh-row input {
      flex: 1;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 3px 6px;
    }
    .gh-row button, .gh-btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 3px 10px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .gh-error { color: var(--vscode-errorForeground); font-size: 0.8em; margin: 2px 0 6px; }
    .gh-entry-list { list-style: none; margin: 0 0 6px; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
    .gh-entry {
      display: flex; align-items: center; gap: 4px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      padding: 1px 4px 1px 8px;
      font-size: 0.8em;
    }
    .gh-entry.invalid { background-color: var(--vscode-inputValidation-errorBackground, var(--vscode-errorForeground)); }
    .gh-entry button { background: none; border: none; cursor: pointer; color: inherit; padding: 0 2px; }
  </style>
</head>
<body>
  <div class="tabs">
    ${tabButtons}
  </div>

  <div class="grid" id="grid">
    <div class="card" id="dailyDashboardCard" tabindex="0" role="button" style="display:none;">
      <div class="card-header">
        <span class="icon">📋</span>
        <span class="title">GitHub Attention Inbox</span>
      </div>
      <p class="description">Open the full dashboard to see pull requests that need your attention.</p>
    </div>
    ${cards}
    <div class="empty-state" id="dailyPlaceholder" style="display:none;"></div>
  </div>

  <div id="githubRoot"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const tabs = document.querySelectorAll('.tab');
    const cards = document.querySelectorAll('.card[data-tool-id]');
    const dailyDashboardCard = document.getElementById('dailyDashboardCard');
    const dailyPlaceholder = document.getElementById('dailyPlaceholder');
    const githubRoot = document.getElementById('githubRoot');
    let activeTab = 'daily';

    function applyTab(selected) {
      activeTab = selected;
      dailyPlaceholder.style.display = 'none';
      dailyDashboardCard.style.display = selected === 'daily' ? '' : 'none';
      githubRoot.style.display = selected === 'config' ? 'block' : 'none';
      cards.forEach((card) => {
        card.style.display = selected === 'other' ? '' : 'none';
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        applyTab(tab.getAttribute('data-tab'));
      });
    });
    applyTab('daily');

    dailyDashboardCard.addEventListener('click', () => vscode.postMessage({ command: 'openDashboard' }));
    dailyDashboardCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        vscode.postMessage({ command: 'openDashboard' });
      }
    });

    cards.forEach((card) => {
      const open = () => vscode.postMessage({ command: 'openTool', toolId: card.getAttribute('data-tool-id') });
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    function escapeHtmlClient(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    let lastState = null;
    let repoError = '';
    let authorError = '';

    function renderEntries(entries, kind) {
      return entries
        .map((entry) => {
          const label = kind === 'repo' ? entry.owner + '/' + entry.repo : entry.username;
          const removeAttrs = kind === 'repo'
            ? 'data-remove-repo data-owner="' + escapeHtmlClient(entry.owner) + '" data-repo="' + escapeHtmlClient(entry.repo) + '"'
            : 'data-remove-author data-username="' + escapeHtmlClient(entry.username) + '"';
          const invalidClass = entry.status === 'invalid' ? ' invalid' : '';
          const title = entry.status === 'invalid' && entry.invalidReason ? ' title="' + escapeHtmlClient(entry.invalidReason) + '"' : '';
          return '<li class="gh-entry' + invalidClass + '"' + title + '>' + escapeHtmlClient(label) + '<button ' + removeAttrs + '>&times;</button></li>';
        })
        .join('');
    }

    function renderGithub(state) {
      lastState = state;
      if (!state.authenticated) {
        githubRoot.innerHTML =
          '<div class="gh-section"><h3>GitHub configuration</h3><p>Sign in to GitHub to monitor repos and authors.</p>' +
          '<button class="gh-btn" data-sign-in>Sign in to GitHub</button></div>';
        wireActions();
        return;
      }

      githubRoot.innerHTML =
        '<div class="gh-section">' +
        '<h3>GitHub configuration</h3>' +
        '<p class="description">Signed in as ' + escapeHtmlClient(state.me || '') + '. Open <strong>Daily Tasks</strong> for the full dashboard.</p>' +
        '<div class="gh-row"><input id="ghRepoInput" placeholder="owner/repo" /><button class="gh-btn" data-add-repo>Add</button></div>' +
        '<div class="gh-error" id="ghRepoError">' + escapeHtmlClient(repoError) + '</div>' +
        '<ul class="gh-entry-list">' + renderEntries(state.monitoredRepos, 'repo') + '</ul>' +
        '<div class="gh-row"><input id="ghAuthorInput" placeholder="GitHub username" /><button class="gh-btn" data-add-author>Add</button></div>' +
        '<div class="gh-error" id="ghAuthorError">' + escapeHtmlClient(authorError) + '</div>' +
        '<ul class="gh-entry-list">' + renderEntries(state.monitoredAuthors, 'author') + '</ul>' +
        '</div>';

      wireActions();
    }

    function post(message) {
      vscode.postMessage(message);
    }

    function wireActions() {
      const signIn = githubRoot.querySelector('[data-sign-in]');
      if (signIn) signIn.addEventListener('click', () => post({ command: 'github.signIn' }));

      const addRepoBtn = githubRoot.querySelector('[data-add-repo]');
      if (addRepoBtn) {
        addRepoBtn.addEventListener('click', () => {
          const input = document.getElementById('ghRepoInput');
          if (input && input.value.trim()) {
            repoError = '';
            post({ command: 'github.addRepo', value: input.value.trim() });
            input.value = '';
          }
        });
      }

      const addAuthorBtn = githubRoot.querySelector('[data-add-author]');
      if (addAuthorBtn) {
        addAuthorBtn.addEventListener('click', () => {
          const input = document.getElementById('ghAuthorInput');
          if (input && input.value.trim()) {
            authorError = '';
            post({ command: 'github.addAuthor', value: input.value.trim() });
            input.value = '';
          }
        });
      }

      githubRoot.querySelectorAll('[data-remove-repo]').forEach((btn) => {
        btn.addEventListener('click', () =>
          post({ command: 'github.removeRepo', owner: btn.getAttribute('data-owner'), repo: btn.getAttribute('data-repo') })
        );
      });

      githubRoot.querySelectorAll('[data-remove-author]').forEach((btn) => {
        btn.addEventListener('click', () => post({ command: 'github.removeAuthor', username: btn.getAttribute('data-username') }));
      });
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message && message.command === 'github.state') {
        renderGithub(message.state);
      } else if (message && message.command === 'github.addResult' && !message.ok) {
        if (message.kind === 'repo') {
          repoError = message.reason || 'Could not add repo.';
        } else {
          authorError = message.reason || 'Could not add author.';
        }
        if (lastState) renderGithub(lastState);
      }
    });

    post({ command: 'github.refresh' });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
