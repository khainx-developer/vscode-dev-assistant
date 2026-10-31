import * as vscode from 'vscode';
import { getToolById } from '../tools/registry';
import { ToolDefinition } from '../tools/types';
import { getNonce } from '../webview/nonce';

type IncomingMessage =
  | { command: 'run'; action: string; input: string }
  | { command: 'copy'; text: string };

export class ToolPanel {
  private static readonly panels = new Map<string, ToolPanel>();

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(extensionUri: vscode.Uri, toolId: string): void {
    const tool = getToolById(toolId);
    if (!tool) {
      vscode.window.showErrorMessage(`Dev Utilities: Unknown tool "${toolId}".`);
      return;
    }

    const existing = ToolPanel.panels.get(toolId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const panel = vscode.window.createWebviewPanel('devUtilities.tool', tool.title, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri],
    });

    new ToolPanel(panel, tool);
  }

  private constructor(panel: vscode.WebviewPanel, tool: ToolDefinition) {
    this.panel = panel;
    this.panel.webview.html = this.render(tool);
    ToolPanel.panels.set(tool.id, this);

    this.panel.webview.onDidReceiveMessage(
      (message: IncomingMessage) => this.handleMessage(tool, message),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(tool.id), undefined, this.disposables);
  }

  private handleMessage(tool: ToolDefinition, message: IncomingMessage): void {
    if (message.command === 'copy') {
      void vscode.env.clipboard.writeText(message.text);
      void vscode.window.setStatusBarMessage('Dev Utilities: Copied to clipboard', 2000);
      return;
    }

    if (message.command === 'run') {
      try {
        const output = tool.run(message.action, message.input);
        void this.panel.webview.postMessage({ command: 'result', output });
      } catch (err) {
        void this.panel.webview.postMessage({ command: 'error', message: (err as Error).message });
      }
    }
  }

  private dispose(toolId: string): void {
    ToolPanel.panels.delete(toolId);
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }

  private render(tool: ToolDefinition): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

    const actionButtons = tool.actions
      .map((a) => `<button class="action-btn" data-action="${escapeHtml(a.id)}">${escapeHtml(a.label)}</button>`)
      .join('\n');

    const inputSection = tool.needsInput
      ? `<label for="input">Input</label>
         <textarea id="input" rows="8" placeholder="${escapeHtml(tool.inputPlaceholder ?? '')}"></textarea>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(tool.title)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 16px 20px 24px;
    }
    h1 { font-size: 1.1em; margin: 0 0 4px; }
    p.description { color: var(--vscode-descriptionForeground); margin: 0 0 16px; }
    label { display: block; font-size: 0.85em; font-weight: 600; margin: 12px 0 4px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--vscode-descriptionForeground); }
    textarea {
      width: 100%;
      box-sizing: border-box;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 8px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      resize: vertical;
    }
    textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
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
    }
    button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
    .output-row { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
    .output-row label { margin: 0; }
    .error { color: var(--vscode-errorForeground); margin-top: 8px; font-size: 0.9em; min-height: 1.2em; }
  </style>
</head>
<body>
  <h1>${escapeHtml(tool.icon)} ${escapeHtml(tool.title)}</h1>
  <p class="description">${escapeHtml(tool.description)}</p>

  ${inputSection}

  <div class="actions">
    ${actionButtons}
  </div>

  <div class="error" id="error"></div>

  <div class="output-row">
    <label for="output">Output</label>
    <button class="secondary" id="copyBtn">Copy</button>
  </div>
  <textarea id="output" rows="8" readonly></textarea>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const inputEl = document.getElementById('input');
    const outputEl = document.getElementById('output');
    const errorEl = document.getElementById('error');

    document.querySelectorAll('.action-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        errorEl.textContent = '';
        vscode.postMessage({
          command: 'run',
          action: btn.getAttribute('data-action'),
          input: inputEl ? inputEl.value : '',
        });
      });
    });

    document.getElementById('copyBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'copy', text: outputEl.value });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.command === 'result') {
        outputEl.value = message.output;
        errorEl.textContent = '';
      } else if (message.command === 'error') {
        errorEl.textContent = message.message;
      }
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
