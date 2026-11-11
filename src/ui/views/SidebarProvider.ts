import * as vscode from 'vscode';
import type { DashboardSession, SessionSurface } from '../../app/dashboardSession';
import { tools } from '../../services/toolRegistry';
import type { HostEvent, SidebarTab, WebviewCommand } from '../../shared/messages';
import type { SetupStepId } from '../../services/session/setupStatus';
import { renderWebviewHtml, webviewAssetRoot } from '../webview/html';
import { routeWebviewCommand } from '../webview/router';

export const SIDEBAR_VIEW_ID = 'devMateKit.sidebar';

/**
 * Activity-bar sidebar: Home (attention summary), Tools (text utilities), Setup (checklist).
 * Rendering lives in `src/ui/webview/sidebar/`; data comes from the shared `DashboardSession`.
 */
export class SidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private pendingTab: SidebarTab | undefined;
  private pendingStep: SetupStepId | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly session: DashboardSession,
  ) {
    this.disposables.push(session.onDidChange(() => this.updateBadge()));
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewAssetRoot(this.extensionUri)],
    };
    webviewView.webview.html = renderWebviewHtml(webviewView.webview, this.extensionUri, {
      bundle: 'sidebar',
      title: 'DevMate Kit',
      bootData: {
        initialTab: this.pendingTab ?? 'home',
        initialStep: this.pendingStep ?? null,
        tools: tools.map(({ id, title, description, icon, category, tags }) => ({ id, title, description, icon, category, tags })),
      },
    });
    this.pendingTab = undefined;
    this.pendingStep = undefined;

    const surface: SessionSurface = {
      get visible() {
        return webviewView.visible;
      },
      postMessage: (message: HostEvent) => webviewView.webview.postMessage(message),
    };
    const subscriptions = [
      this.session.attach(surface),
      webviewView.webview.onDidReceiveMessage((message: WebviewCommand) => routeWebviewCommand(message, this.session, surface)),
      webviewView.onDidChangeVisibility(() => this.session.surfaceVisibilityChanged(surface)),
    ];
    webviewView.onDidDispose(() => {
      subscriptions.forEach((subscription) => subscription.dispose());
      if (this.view === webviewView) this.view = undefined;
    });
    this.updateBadge();
  }

  /** Reveal the sidebar on a given tab (and, for Setup, optionally a specific step). */
  async showTab(tab: SidebarTab, step?: SetupStepId): Promise<void> {
    if (!this.view) {
      this.pendingTab = tab;
      this.pendingStep = step;
    }
    // Focusing the view also switches the side bar to the DevMate Kit container.
    await vscode.commands.executeCommand(`${SIDEBAR_VIEW_ID}.focus`);
    if (this.view) {
      void this.view.webview.postMessage({ command: 'nav.showTab', tab, step } satisfies HostEvent);
    }
  }

  private updateBadge(): void {
    if (!this.view) return;
    const count = this.session.getInbox().items?.length ?? 0;
    this.view.badge = count > 0
      ? { value: count, tooltip: `${count} item${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} your attention` }
      : undefined;
  }

  dispose(): void {
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
