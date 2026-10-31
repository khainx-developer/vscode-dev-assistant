import * as vscode from 'vscode';
import { tools } from '../tools/registry';
import { CATEGORY_LABELS, ToolCategory } from '../tools/types';
import { getNonce } from '../webview/nonce';

type IncomingMessage = { command: 'openTool'; toolId: string };

const TAB_ORDER: Array<{ id: 'all' | ToolCategory | 'daily'; label: string }> = [
  { id: 'all', label: 'All Tools' },
  { id: 'generators', label: CATEGORY_LABELS.generators },
  { id: 'encoders', label: CATEGORY_LABELS.encoders },
  { id: 'formatters', label: CATEGORY_LABELS.formatters },
  { id: 'converters', label: CATEGORY_LABELS.converters },
  { id: 'daily', label: 'Daily Tasks' },
];

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.render();

    webviewView.webview.onDidReceiveMessage((message: IncomingMessage) => {
      if (message.command === 'openTool') {
        void vscode.commands.executeCommand('devUtilities.openTool', message.toolId);
      }
    });
  }

  private render(): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

    const tabButtons = TAB_ORDER.map(
      (tab) => `<button class="tab${tab.id === 'all' ? ' active' : ''}" data-tab="${tab.id}">${escapeHtml(tab.label)}</button>`
    ).join('\n');

    const cards = tools
      .map(
        (tool) => `
      <div class="card" data-category="${tool.category}" data-tool-id="${escapeHtml(tool.id)}" tabindex="0" role="button">
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
  <title>Dev Utilities</title>
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
  </style>
</head>
<body>
  <div class="tabs">
    ${tabButtons}
  </div>

  <div class="grid" id="grid">
    ${cards}
    <div class="empty-state" id="dailyPlaceholder" style="display:none;">
      📝 Daily Tasks is coming soon.
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const tabs = document.querySelectorAll('.tab');
    const cards = document.querySelectorAll('.card');
    const dailyPlaceholder = document.getElementById('dailyPlaceholder');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const selected = tab.getAttribute('data-tab');

        dailyPlaceholder.style.display = selected === 'daily' ? 'block' : 'none';

        cards.forEach((card) => {
          const matches = selected === 'all' || card.getAttribute('data-category') === selected;
          card.style.display = selected === 'daily' ? 'none' : matches ? '' : 'none';
        });
      });
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
