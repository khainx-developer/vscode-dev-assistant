import * as vscode from 'vscode';
import { tools } from '../../services/toolRegistry';
import { getNonce } from '../webview/nonce';
import { GitHubAuthService } from '../../infrastructure/github/auth';
import { GitHubConfigStore } from '../../infrastructure/github/configStore';
import { GitHubIncomingMessage } from '../../shared/githubTypes';
import { GitHubViewController } from '../../services/github/viewController';
import { LastSeenStore } from '../../infrastructure/github/lastSeenStore';
import { PullRequestCache } from '../../infrastructure/github/pullRequestCache';
import { RefreshScheduler, REFRESH_INTERVAL_MINUTES } from '../../infrastructure/github/refreshScheduler';
import { JiraViewController } from '../../services/jira/viewController';
import type { JiraIncomingMessage } from '../../shared/jiraTypes';
import type { McpConnectionService } from '../../infrastructure/mcp/connectionService';
import type { JiraServices } from '../panels/jiraServices';

type IncomingMessage =
  | { command: 'openTool' | 'openDashboard'; toolId?: string }
  | { command: 'ai.update'; setting: 'provider' | 'model'; value: string }
  | GitHubIncomingMessage
  | JiraIncomingMessage;

interface AiModelOption {
  id: string;
  name: string;
  family: string;
}

interface GitHubServices {
  authService: GitHubAuthService;
  configStore: GitHubConfigStore;
  connectionService: McpConnectionService;
  lastSeenStore: LastSeenStore;
  pullRequestCache: PullRequestCache;
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
    private readonly jiraServices: JiraServices,
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
      this.githubServices.connectionService,
      this.githubServices.lastSeenStore,
      this.jiraServices.commentReadStateStore,
      this.githubServices.pullRequestCache,
      this.jiraServices.outputChannel,
    );
    const jiraController = new JiraViewController(
      webviewView,
      this.jiraServices.connectionStore,
      this.jiraServices.configStore,
      this.jiraServices.connectionService,
      this.jiraServices.commentReadStateStore,
      this.jiraServices.pullRequestCache,
      this.jiraServices.outputChannel,
    );
    const runGitHubAndRelinkJira = async (operation: () => Promise<void>): Promise<void> => {
      try {
        await operation();
      } finally {
        jiraController.refreshPullRequestLinks();
      }
    };
    const scheduler = new RefreshScheduler(
      webviewView,
      () => runGitHubAndRelinkJira(() => controller.refresh()),
    );
    let availableAiModels: AiModelOption[] = [];

    const refreshAiModels = async (): Promise<void> => {
      const aiConfig = vscode.workspace.getConfiguration('devMateKit.ai');
      if (aiConfig.get<string>('provider', 'none') !== 'githubCopilot') {
        availableAiModels = [];
        void webviewView.webview.postMessage({ command: 'ai.models', models: [], selectedModel: aiConfig.get<string>('model', 'GPT-6 Luna') });
        return;
      }

      if (typeof vscode.lm?.selectChatModels !== 'function') {
        availableAiModels = [];
        void webviewView.webview.postMessage({ command: 'ai.models', models: [], selectedModel: aiConfig.get<string>('model', 'GPT-6 Luna') });
        return;
      }

      try {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        availableAiModels = models.map((model) => ({ id: model.id, name: model.name, family: model.family }));
      } catch {
        availableAiModels = [];
      }
      void webviewView.webview.postMessage({
        command: 'ai.models',
        models: availableAiModels,
        selectedModel: aiConfig.get<string>('model', 'GPT-6 Luna'),
      });
    };

    const modelChangeListener = vscode.lm?.onDidChangeChatModels?.(() => {
      void refreshAiModels();
    });
    void refreshAiModels();

    webviewView.webview.onDidReceiveMessage((message: IncomingMessage) => {
      if (message.command === 'openTool') {
        void vscode.commands.executeCommand('devMateKit.openTool', message.toolId);
      } else if (message.command === 'openDashboard') {
        void vscode.commands.executeCommand('devMateKit.openDashboard');
      } else if (message.command === 'ai.update') {
        const aiConfig = vscode.workspace.getConfiguration('devMateKit.ai');
        if (message.setting === 'provider' && ['none', 'githubCopilot'].includes(message.value)) {
          void aiConfig.update('provider', message.value, vscode.ConfigurationTarget.Global).then(
            async () => {
              await refreshAiModels();
              void webviewView.webview.postMessage({ command: 'ai.saved' });
            },
            () => void webviewView.webview.postMessage({ command: 'ai.saveFailed' }),
          );
        } else if (
          message.setting === 'model' &&
          aiConfig.get<string>('provider', 'none') === 'githubCopilot' &&
          availableAiModels.some((model) => model.id === message.value)
        ) {
          void aiConfig.update('model', message.value, vscode.ConfigurationTarget.Global).then(
            () => void webviewView.webview.postMessage({ command: 'ai.saved' }),
            () => void webviewView.webview.postMessage({ command: 'ai.saveFailed' }),
          );
        }
      } else if (typeof message.command === 'string' && message.command.startsWith('github.')) {
        void runGitHubAndRelinkJira(() => controller.handleMessage(message as GitHubIncomingMessage));
      } else if (typeof message.command === 'string' && message.command.startsWith('jira.')) {
        void jiraController.handleMessage(message as JiraIncomingMessage);
      }
    });

    webviewView.onDidDispose(() => {
      scheduler.dispose();
      modelChangeListener?.dispose();
    });
  }

  private render(): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const aiConfig = vscode.workspace.getConfiguration('devMateKit.ai');
    const aiProvider = aiConfig.get<string>('provider', 'none') === 'githubCopilot' ? 'githubCopilot' : 'none';
    const aiModel = aiConfig.get<string>('model', 'GPT-6 Luna');

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
  <title>DevMate Kit</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
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
      font-size: 1em;
      cursor: pointer;
    }
    .gh-select {
      width: 100%;
      background-color: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, transparent));
      border-radius: 4px;
      padding: 4px 6px;
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
    .card-header .title { font-weight: 600; font-size: 1em; }
    .card .description { margin: 0 0 6px; font-size: 0.92em; color: var(--vscode-descriptionForeground); }
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

    #githubRoot, #jiraRoot { display: none; }
    .gh-section { margin-bottom: 14px; }
    .gh-section h3 { font-size: 1em; margin: 0 0 6px; color: var(--vscode-foreground); }
    .config-section > summary {
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 1em;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .config-list { margin: 8px 0; }
    .config-list-title { font-weight: 600; margin-bottom: 4px; }
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
      font-size: 1em;
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
    .gh-label { display: block; font-size: 0.78em; color: var(--vscode-descriptionForeground); margin: 8px 0 2px; }
    .jira-status {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      background-color: var(--vscode-editorWidget-background, transparent);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 6px 8px;
      margin-bottom: 10px;
    }
    .jira-status .dot { color: var(--vscode-testing-iconPassed, #3fb950); font-size: 1em; line-height: 1; }
    .jira-status .site { font-size: 0.82em; word-break: break-all; }
    .jira-status button {
      background-color: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      border: none; border-radius: 4px; padding: 2px 8px; font-size: 1em; cursor: pointer; white-space: nowrap;
    }
    .gh-row textarea {
      flex: 1;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 3px 6px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      resize: vertical;
      min-height: 46px;
    }
    .jira-query-list { list-style: none; margin: 0 0 6px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .jira-query {
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 6px 8px;
    }
    .jira-query-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .jira-query-head strong { font-size: 1em; }
    .jira-query-head button { background: none; border: none; cursor: pointer; color: var(--vscode-descriptionForeground); font-size: 0.9em; padding: 0 2px; }
    .jira-query-jql {
      margin-top: 2px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.78em;
      color: var(--vscode-descriptionForeground);
      word-break: break-word;
    }
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
        <span class="title">Daily Tasks</span>
      </div>
      <p class="description">Open the full dashboard to see pull requests and Jira tasks that need your attention.</p>
    </div>
    ${cards}
    <div class="empty-state" id="dailyPlaceholder" style="display:none;"></div>
  </div>

  <div id="githubRoot"></div>
  <div id="jiraRoot"></div>
  <details id="aiRoot" class="gh-section config-section" style="display:none">
    <summary>AI runtime</summary>
    <label class="gh-label" for="aiProvider">AI provider</label>
    <select class="gh-select" id="aiProvider" aria-label="AI provider">
      <option value="none"${aiProvider === 'none' ? ' selected' : ''}>None</option>
      <option value="githubCopilot"${aiProvider === 'githubCopilot' ? ' selected' : ''}>GitHub Copilot</option>
    </select>
    <div id="aiSaveStatus" class="gh-label" role="status"></div>
    <div id="aiModelSection" style="display:${aiProvider === 'githubCopilot' ? 'block' : 'none'}">
      <label class="gh-label" for="aiModel">AI model</label>
      <select class="gh-select" id="aiModel" aria-label="AI model" disabled>
        <option value="${escapeHtml(aiModel)}">Loading Copilot models...</option>
      </select>
      <div id="aiModelStatus" class="gh-label" role="status"></div>
    </div>
  </details>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const tabs = document.querySelectorAll('.tab');
    const cards = document.querySelectorAll('.card[data-tool-id]');
    const dailyDashboardCard = document.getElementById('dailyDashboardCard');
    const dailyPlaceholder = document.getElementById('dailyPlaceholder');
    const githubRoot = document.getElementById('githubRoot');
    const jiraRoot = document.getElementById('jiraRoot');
    const aiRoot = document.getElementById('aiRoot');
    const aiProvider = document.getElementById('aiProvider');
    const aiModel = document.getElementById('aiModel');
    const aiModelSection = document.getElementById('aiModelSection');
    const aiModelStatus = document.getElementById('aiModelStatus');
    const aiSaveStatus = document.getElementById('aiSaveStatus');
    let activeTab = 'daily';

    function applyTab(selected) {
      activeTab = selected;
      dailyPlaceholder.style.display = 'none';
      dailyDashboardCard.style.display = selected === 'daily' ? '' : 'none';
      githubRoot.style.display = selected === 'config' ? 'block' : 'none';
      jiraRoot.style.display = selected === 'config' ? 'block' : 'none';
      aiRoot.style.display = selected === 'config' ? 'block' : 'none';
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

    aiProvider.addEventListener('change', () => {
      const useCopilot = aiProvider.value === 'githubCopilot';
      aiModelSection.style.display = useCopilot ? 'block' : 'none';
      if (useCopilot) {
        aiModel.disabled = true;
        aiModelStatus.textContent = 'Loading Copilot models...';
      }
      aiSaveStatus.textContent = 'Saving...';
      vscode.postMessage({ command: 'ai.update', setting: 'provider', value: aiProvider.value });
    });
    aiModel.addEventListener('change', () => {
      aiSaveStatus.textContent = 'Saving...';
      vscode.postMessage({ command: 'ai.update', setting: 'model', value: aiModel.value });
    });

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
    let jiraCurrentUserError = '';

    function operationFor(state, operationId) {
      return state && state.pendingOperations ? state.pendingOperations[operationId] : null;
    }

    function operationStatus(state, operationId, successText) {
      const operation = operationFor(state, operationId);
      if (!operation) return '';
      if (operation.pending) {
        return '<div class="gh-label" role="status">Saving…</div>';
      }
      if (operation.result && !operation.result.ok) {
        return '<div class="gh-error" role="alert">' + escapeHtmlClient(operation.result.reason || 'Could not complete the action.') + '</div>';
      }
      return operation.result && operation.result.ok
        ? '<div class="gh-label" role="status">' + escapeHtmlClient(successText) + '</div>'
        : '';
    }

    function renderEntries(entries, kind, state) {
      return entries
        .map((entry) => {
          const label = kind === 'repo' ? entry.owner + '/' + entry.repo : entry.username;
          const operationId = kind === 'repo' ? 'github.removeRepo' : 'github.removeAuthor';
          const pending = operationFor(state, operationId);
          const removeAttrs = kind === 'repo'
            ? 'data-remove-repo data-owner="' + escapeHtmlClient(entry.owner) + '" data-repo="' + escapeHtmlClient(entry.repo) + '"'
            : 'data-remove-author data-username="' + escapeHtmlClient(entry.username) + '"';
          const invalidClass = entry.status === 'invalid' ? ' invalid' : '';
          const title = entry.status === 'invalid' && entry.invalidReason ? ' title="' + escapeHtmlClient(entry.invalidReason) + '"' : '';
          return '<li class="gh-entry' + invalidClass + '"' + title + '>' + escapeHtmlClient(label) +
            '<button ' + removeAttrs + ' aria-label="Remove ' + escapeHtmlClient(label) + '"' +
            (pending && pending.pending ? ' disabled' : '') + '>&times;</button></li>';
        })
        .join('');
    }

    function renderGithub(state) {
      lastState = state;
      const sectionOpen = githubRoot.querySelector('details.config-section')?.open ?? false;
      const sectionOpenAttribute = sectionOpen ? ' open' : '';
      const signInPending = operationFor(state, 'github.signIn');
      if (!state.authenticated) {
        if (state.isRefreshing) {
          githubRoot.innerHTML =
            '<details class="gh-section config-section"' + sectionOpenAttribute + '><summary>GitHub configuration</summary>' +
            '<p class="description" role="status">Checking GitHub configuration...</p></details>';
          return;
        }
        githubRoot.innerHTML =
          '<details class="gh-section config-section"' + sectionOpenAttribute + '><summary>GitHub configuration</summary><p>Sign in to GitHub to monitor repos and authors.</p>' +
          '<p class="description">Auto-refreshes every ' + ${REFRESH_INTERVAL_MINUTES} + ' minutes while this view is open.</p>' +
          '<button class="gh-btn" data-sign-in' + (signInPending && signInPending.pending ? ' disabled' : '') + '>' +
          (signInPending && signInPending.pending ? 'Signing in…' : 'Sign in to GitHub') + '</button>' +
          operationStatus(state, 'github.signIn', 'Signed in.') + '</details>';
        wireActions();
        return;
      }

      const addRepoPending = operationFor(state, 'github.addRepo');
      const addAuthorPending = operationFor(state, 'github.addAuthor');
      githubRoot.innerHTML =
        '<details class="gh-section config-section"' + sectionOpenAttribute + '>' +
        '<summary>GitHub configuration</summary>' +
        '<p class="description">Signed in as ' + escapeHtmlClient(state.me || '') + '. Open <strong>Daily Tasks</strong> for the full dashboard.</p>' +
        '<p class="description">Auto-refreshes every ' + ${REFRESH_INTERVAL_MINUTES} + ' minutes while this view is open.</p>' +
        '<div class="gh-row"><input id="ghRepoInput" placeholder="owner/repo" aria-label="GitHub repository" />' +
        '<button class="gh-btn" data-add-repo' + (addRepoPending && addRepoPending.pending ? ' disabled' : '') + '>' +
        (addRepoPending && addRepoPending.pending ? 'Adding…' : 'Add') + '</button></div>' +
        '<div class="gh-error" id="ghRepoError">' + escapeHtmlClient(repoError) + '</div>' +
        operationStatus(state, 'github.addRepo', 'Repository added.') +
        '<div class="config-list"><div class="config-list-title">Monitored repositories (' + state.monitoredRepos.length + ')</div>' +
        '<ul class="gh-entry-list">' + (state.monitoredRepos.length ? renderEntries(state.monitoredRepos, 'repo', state) : '<li class="gh-error">No repositories configured.</li>') + '</ul></div>' +
        '<div class="gh-row"><input id="ghAuthorInput" placeholder="GitHub username" aria-label="GitHub username" />' +
        '<button class="gh-btn" data-add-author' + (addAuthorPending && addAuthorPending.pending ? ' disabled' : '') + '>' +
        (addAuthorPending && addAuthorPending.pending ? 'Adding…' : 'Add') + '</button></div>' +
        '<div class="gh-error" id="ghAuthorError">' + escapeHtmlClient(authorError) + '</div>' +
        operationStatus(state, 'github.addAuthor', 'Author added.') +
        '<div class="config-list"><div class="config-list-title">Monitored authors (' + state.monitoredAuthors.length + ')</div>' +
        '<ul class="gh-entry-list">' + (state.monitoredAuthors.length ? renderEntries(state.monitoredAuthors, 'author', state) : '<li class="gh-error">No authors configured.</li>') + '</ul></div>' +
        operationStatus(state, 'github.removeRepo', 'Repository removed.') +
        operationStatus(state, 'github.removeAuthor', 'Author removed.') +
        '</details>';

      wireActions();
    }

    let jiraState = null;
    let jiraConnectionError = '';
    let jiraQueryError = '';
    let jiraTeamError = '';
    let editingQueryLabel = null;

    function renderJira(state) {
      jiraState = state;
      const sectionOpen = jiraRoot.querySelector('details.config-section')?.open ?? false;
      const sectionOpenAttribute = sectionOpen ? ' open' : '';
      const operations = state.pendingOperations || {};
      if (!state.connected) {
        if (state.isRefreshing) {
          jiraRoot.innerHTML =
            '<details class="gh-section config-section"' + sectionOpenAttribute + '><summary>Jira configuration</summary>' +
            '<p class="description" role="status">Checking Jira configuration...</p></details>';
          return;
        }
        const failures = (state.failures || [])
          .filter((failure) => !failure.queryLabel)
          .map((failure) => failure.detail)
          .join(' ');
        const connectPending = operationFor(state, 'jira.saveConnection');
        jiraRoot.innerHTML =
          '<details class="gh-section config-section"' + sectionOpenAttribute + '><summary>Jira configuration</summary>' +
          '<div class="gh-row"><input id="jiraSiteUrl" type="url" aria-label="Jira site URL" placeholder="https://your-site.atlassian.net" /></div>' +
          '<div class="gh-error">' + escapeHtmlClient(jiraConnectionError || failures) + '</div>' +
          '<button class="gh-btn" data-jira-save' + (connectPending && connectPending.pending ? ' disabled' : '') + '>' +
          (connectPending && connectPending.pending ? 'Connecting…' : 'Connect to Jira') + '</button>' +
          operationStatus(state, 'jira.saveConnection', 'Connected to Jira.') + '</details>';
        wireJiraActions();
        return;
      }

      const removeQueryPending = operations['jira.removeQuery'];
      const queries = state.savedQueries || [];
      if (editingQueryLabel && !queries.some((q) => q.label === editingQueryLabel)) {
        editingQueryLabel = null;
      }
      const editingQuery = editingQueryLabel ? queries.find((q) => q.label === editingQueryLabel) : null;
      const teamMemberCount = (state.teamMembers || []).length;
      const removeTeamPending = operations['jira.removeTeamMember'];
      const teamMembers = (state.teamMembers || []).map((displayName) =>
        '<li class="jira-query"><div class="jira-query-head"><strong>' + escapeHtmlClient(displayName) +
        '</strong><button data-jira-remove-team="' + escapeHtmlClient(displayName) + '" aria-label="Remove teammate ' +
        escapeHtmlClient(displayName) + '"' + (removeTeamPending && removeTeamPending.pending ? ' disabled' : '') +
        '>&times;</button></div></li>'
      ).join('');
      const addTeamPending = operations['jira.addTeamMember'];
      const setUserPending = operations['jira.setCurrentUser'];
      const queryAddPending = operations['jira.addQuery'];
      const queryUpdatePending = operations['jira.updateQuery'];
      const disconnectPending = operations['jira.disconnect'];
      const failures = (state.failures || []).map((failure) =>
        '<div class="gh-error">' + escapeHtmlClient(
          (failure.queryLabel ? failure.queryLabel + ': ' : '') + failure.detail,
        ) + '</div>'
      ).join('');
      jiraRoot.innerHTML =
        '<details class="gh-section config-section"' + sectionOpenAttribute + '><summary>Jira configuration</summary>' +
        '<div class="jira-status"><span><span class="dot">●</span> Connected to <span class="site">' +
        escapeHtmlClient(state.siteUrl || '') + '</span></span>' +
        '<button data-jira-disconnect' + (disconnectPending && disconnectPending.pending ? ' disabled' : '') + '>' +
        (disconnectPending && disconnectPending.pending ? 'Disconnecting…' : 'Disconnect') + '</button></div>' +
        operationStatus(state, 'jira.disconnect', 'Disconnected.') +
        '<label class="gh-label" for="jiraCurrentUser">Your Jira display name (used to detect your own comments)</label>' +
        '<div class="gh-row"><input id="jiraCurrentUser" placeholder="e.g. Jane Doe" value="' + escapeHtmlClient(state.currentUser || '') + '" />' +
        '<button class="gh-btn" data-jira-save-user' + (setUserPending && setUserPending.pending ? ' disabled' : '') + '>' +
        (setUserPending && setUserPending.pending ? 'Saving…' : 'Save') + '</button></div>' +
        '<div class="gh-error">' + escapeHtmlClient(jiraCurrentUserError) + '</div>' +
        operationStatus(state, 'jira.setCurrentUser', 'Jira user saved.') +
        '<div class="config-list"><div class="config-list-title">Monitored Jira teammates (' + teamMemberCount + ')</div>' +
        '<ul class="jira-query-list">' + (teamMembers || '<li class="gh-error" style="border:none;padding:0;">No teammates configured.</li>') + '</ul></div>' +
        '<div class="gh-row"><input id="jiraTeamMember" placeholder="e.g. Alex Smith" aria-label="Jira teammate display name" />' +
        '<button class="gh-btn" data-jira-add-team' + (addTeamPending && addTeamPending.pending ? ' disabled' : '') + '>' +
        (addTeamPending && addTeamPending.pending ? 'Adding…' : 'Add teammate') + '</button></div>' +
        '<div class="gh-error">' + escapeHtmlClient(jiraTeamError) + '</div>' +
        operationStatus(state, 'jira.addTeamMember', 'Teammate added.') +
        operationStatus(state, 'jira.removeTeamMember', 'Teammate removed.') +
        '<div class="config-list"><div class="config-list-title">Saved JQL (' + queries.length + ')</div>' +
        '<ul class="jira-query-list">' + (
          queries.length
            ? queries.map((query) =>
              '<li class="jira-query"><div class="jira-query-head"><strong>' + escapeHtmlClient(query.label) + '</strong>' +
              '<span><button data-jira-edit="' + escapeHtmlClient(query.label) + '" aria-label="Edit ' + escapeHtmlClient(query.label) + '">&#9998;</button>' +
              '<button data-jira-remove="' + escapeHtmlClient(query.label) + '" aria-label="Remove ' + escapeHtmlClient(query.label) + '"' +
              (removeQueryPending && removeQueryPending.pending ? ' disabled' : '') + '>&times;</button></span></div>' +
              '<div class="jira-query-jql">' + escapeHtmlClient(query.jql) + '</div></li>'
            ).join('')
            : '<li class="gh-error" style="border:none;padding:0;">No saved queries yet.</li>'
        ) + '</ul></div>' +
        '<label class="gh-label" for="jiraQueryLabel">Query label</label>' +
        '<div class="gh-row"><input id="jiraQueryLabel" placeholder="e.g. My open tasks" value="' + escapeHtmlClient(editingQuery ? editingQuery.label : '') + '" /></div>' +
        '<label class="gh-label" for="jiraJql">JQL</label>' +
        '<div class="gh-row"><textarea id="jiraJql" placeholder="assignee = currentUser() AND resolution = Unresolved">' + escapeHtmlClient(editingQuery ? editingQuery.jql : '') + '</textarea></div>' +
        '<div class="gh-error">' + escapeHtmlClient(jiraQueryError) + '</div>' +
        '<div class="gh-row">' +
        '<button class="gh-btn" data-jira-save-query' +
        ((editingQueryLabel ? queryUpdatePending && queryUpdatePending.pending : queryAddPending && queryAddPending.pending) ? ' disabled' : '') + '>' +
        (editingQueryLabel
          ? (queryUpdatePending && queryUpdatePending.pending ? 'Updating…' : 'Update JQL')
          : (queryAddPending && queryAddPending.pending ? 'Saving…' : 'Add JQL')) +
        '</button>' +
        (editingQueryLabel ? '<button class="gh-btn" data-jira-cancel-edit type="button">Cancel</button>' : '') +
        '</div>' +
        operationStatus(state, 'jira.addQuery', 'JQL saved.') +
        operationStatus(state, 'jira.updateQuery', 'JQL updated.') +
        operationStatus(state, 'jira.removeQuery', 'Query removed.') +
        '</div>' + failures + '</details>';
      wireJiraActions();
    }

    function wireJiraActions() {
      const save = jiraRoot.querySelector('[data-jira-save]');
      if (save) {
        save.addEventListener('click', () => {
          post({
            command: 'jira.saveConnection',
            siteUrl: document.getElementById('jiraSiteUrl').value,
          });
        });
      }

      const disconnect = jiraRoot.querySelector('[data-jira-disconnect]');
      if (disconnect) {
        disconnect.addEventListener('click', () => post({ command: 'jira.disconnect' }));
      }

      const saveUser = jiraRoot.querySelector('[data-jira-save-user]');
      if (saveUser) {
        saveUser.addEventListener('click', () => {
          jiraCurrentUserError = '';
          post({
            command: 'jira.setCurrentUser',
            displayName: document.getElementById('jiraCurrentUser').value,
          });
        });
      }

      const addTeamMember = jiraRoot.querySelector('[data-jira-add-team]');
      if (addTeamMember) {
        addTeamMember.addEventListener('click', () => {
          const input = document.getElementById('jiraTeamMember');
          if (input && input.value.trim()) {
            jiraTeamError = '';
            post({ command: 'jira.addTeamMember', displayName: input.value.trim() });
            input.value = '';
          }
        });
      }

      jiraRoot.querySelectorAll('[data-jira-remove-team]').forEach((button) => {
        button.addEventListener('click', () =>
          post({
            command: 'jira.removeTeamMember',
            displayName: button.getAttribute('data-jira-remove-team'),
          })
        );
      });

      const saveQuery = jiraRoot.querySelector('[data-jira-save-query]');
      if (saveQuery) {
        saveQuery.addEventListener('click', () => {
          const label = document.getElementById('jiraQueryLabel').value;
          const jql = document.getElementById('jiraJql').value;
          if (editingQueryLabel) {
            post({ command: 'jira.updateQuery', originalLabel: editingQueryLabel, label, jql });
          } else {
            post({ command: 'jira.addQuery', label, jql });
          }
        });
      }

      const cancelEdit = jiraRoot.querySelector('[data-jira-cancel-edit]');
      if (cancelEdit) {
        cancelEdit.addEventListener('click', () => {
          editingQueryLabel = null;
          jiraQueryError = '';
          if (jiraState) renderJira(jiraState);
        });
      }

      jiraRoot.querySelectorAll('[data-jira-edit]').forEach((button) => {
        button.addEventListener('click', () => {
          editingQueryLabel = button.getAttribute('data-jira-edit');
          jiraQueryError = '';
          if (jiraState) renderJira(jiraState);
        });
      });

      jiraRoot.querySelectorAll('[data-jira-remove]').forEach((button) => {
        button.addEventListener('click', () => {
          const label = button.getAttribute('data-jira-remove');
          if (editingQueryLabel === label) editingQueryLabel = null;
          post({ command: 'jira.removeQuery', label });
        });
      });
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
      if (message && message.command === 'ai.models') {
        aiModel.innerHTML = '';
        const models = Array.isArray(message.models) ? message.models : [];
        if (models.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No GitHub Copilot models available';
          aiModel.appendChild(option);
          aiModel.disabled = true;
          aiModelStatus.textContent = '';
        } else {
          const selected = models.find((model) =>
            model.id === message.selectedModel || model.name === message.selectedModel || model.family === message.selectedModel
          );
          models.forEach((model) => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name || model.family || model.id;
            aiModel.appendChild(option);
          });
          aiModel.value = selected ? selected.id : models[0].id;
          aiModel.disabled = false;
          aiModelStatus.textContent = selected ? '' : 'The configured model is unavailable. Select an available model.';
        }
      } else if (message && message.command === 'ai.saved') {
        aiSaveStatus.textContent = 'Saved.';
      } else if (message && message.command === 'ai.saveFailed') {
        aiSaveStatus.textContent = 'Could not save AI settings.';
      } else if (message && message.command === 'github.state') {
        renderGithub(message.state);
      } else if (message && message.command === 'github.addResult' && !message.ok) {
        if (message.kind === 'repo') {
          repoError = message.reason || 'Could not add repo.';
        } else {
          authorError = message.reason || 'Could not add author.';
        }
        if (lastState) renderGithub(lastState);
      } else if (message && message.command === 'jira.state') {
        renderJira(message.state);
      } else if (message && message.command === 'jira.connectionResult') {
        jiraConnectionError = message.ok ? '' : (message.reason || 'Could not save Jira connection.');
        if (jiraState) renderJira(jiraState);
      } else if (message && message.command === 'jira.queryResult') {
        jiraQueryError = message.ok ? '' : (message.reason || 'Could not add saved query.');
        if (message.ok) editingQueryLabel = null;
        if (jiraState) renderJira(jiraState);
      } else if (message && message.command === 'jira.updateQueryResult') {
        jiraQueryError = message.ok ? '' : (message.reason || 'Could not update saved query.');
        if (message.ok) editingQueryLabel = null;
        if (jiraState) renderJira(jiraState);
      } else if (message && message.command === 'jira.teamMemberResult') {
        jiraTeamError = message.ok ? '' : (message.reason || 'Could not update Jira teammates.');
        if (jiraState) renderJira(jiraState);
      } else if (message && message.command === 'jira.currentUserResult') {
        jiraCurrentUserError = message.ok ? '' : (message.reason || 'Could not save your Jira display name.');
        if (jiraState) renderJira(jiraState);
      }
    });

    post({ command: 'github.refresh' });
    post({ command: 'jira.refresh' });
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
