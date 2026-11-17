import * as vscode from 'vscode';
import type { DashboardSession, SessionSurface } from '../../app/dashboardSession';
import type { HostEvent, WebviewCommand } from '../../shared/messages';
import { renderWebviewHtml, webviewAssetRoot } from '../webview/html';
import { routeWebviewCommand } from '../webview/router';

/**
 * The full "Daily Tasks" dashboard in the editor area. Rendering lives in
 * `src/ui/webview/dashboard/`; data comes from the shared `DashboardSession`.
 */
export class DashboardPanel {
  private static instance: DashboardPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(extensionUri: vscode.Uri, session: DashboardSession): void {
    if (DashboardPanel.instance) {
      DashboardPanel.instance.panel.reveal(DashboardPanel.instance.panel.viewColumn ?? vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel('devMateKit.dashboard', 'Daily Tasks', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [webviewAssetRoot(extensionUri)],
    });
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'dev-assistant-activity-icon.png');
    DashboardPanel.instance = new DashboardPanel(panel, extensionUri, session);
  }

  /** True when the dashboard is the active editor tab (used to skip redundant toasts). */
  static isFocused(): boolean {
    const panel = DashboardPanel.instance?.panel;
    return !!panel && panel.visible && panel.active && vscode.window.state.focused;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    session: DashboardSession,
  ) {
    const surface: SessionSurface = {
      get visible() {
        return panel.visible;
      },
      postMessage: (message: HostEvent) => panel.webview.postMessage(message),
    };

    panel.webview.html = renderWebviewHtml(panel.webview, extensionUri, { bundle: 'dashboard', title: 'Daily Tasks' });
    this.disposables.push(
      session.attach(surface),
      panel.webview.onDidReceiveMessage((message: WebviewCommand) => routeWebviewCommand(message, session, surface)),
      panel.onDidChangeViewState(() => session.surfaceVisibilityChanged(surface)),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  private dispose(): void {
    DashboardPanel.instance = undefined;
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
