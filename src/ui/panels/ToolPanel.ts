import * as vscode from 'vscode';
import { getToolById } from '../../services/toolRegistry';
import { ToolDefinition } from '../../shared/toolTypes';
import { renderWebviewHtml, webviewAssetRoot } from '../webview/html';

type IncomingMessage =
  | { command: 'run'; action: string; input: string }
  | { command: 'copy'; text: string };

/** One editor panel per text tool. Rendering lives in `src/ui/webview/tool/`. */
export class ToolPanel {
  private static readonly panels = new Map<string, ToolPanel>();

  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(extensionUri: vscode.Uri, toolId: string): void {
    const tool = getToolById(toolId);
    if (!tool) {
      vscode.window.showErrorMessage(`DevMate Kit: Unknown tool "${toolId}".`);
      return;
    }

    const existing = ToolPanel.panels.get(toolId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const panel = vscode.window.createWebviewPanel('devMateKit.tool', tool.title, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [webviewAssetRoot(extensionUri)],
    });

    new ToolPanel(panel, extensionUri, tool);
  }

  private constructor(private readonly panel: vscode.WebviewPanel, extensionUri: vscode.Uri, tool: ToolDefinition) {
    const { id, title, description, icon, needsInput, inputPlaceholder, actions } = tool;
    this.panel.webview.html = renderWebviewHtml(panel.webview, extensionUri, {
      bundle: 'tool',
      title: tool.title,
      bootData: { id, title, description, icon, needsInput, inputPlaceholder, actions },
    });
    ToolPanel.panels.set(tool.id, this);

    this.panel.webview.onDidReceiveMessage(
      (message: IncomingMessage) => this.handleMessage(tool, message),
      undefined,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(tool.id), undefined, this.disposables);
  }

  private handleMessage(tool: ToolDefinition, message: IncomingMessage): void {
    if (message.command === 'copy') {
      void vscode.env.clipboard.writeText(message.text);
      void vscode.window.setStatusBarMessage('$(check) DevMate Kit: Copied to clipboard', 2000);
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
}
