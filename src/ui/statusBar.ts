import * as vscode from 'vscode';
import type { DashboardSession } from '../app/dashboardSession';

const SETTING = 'devMateKit.statusBar.enabled';

/** `$(bell-dot) 3` in the status bar — click opens the dashboard. Hidden until setup is started. */
export class AttentionStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly session: DashboardSession) {
    this.item = vscode.window.createStatusBarItem('devMateKit.attention', vscode.StatusBarAlignment.Left, 50);
    this.item.name = 'DevMate Kit: Attention';
    this.item.command = 'devMateKit.openDashboard';
    this.disposables.push(
      this.item,
      session.onDidChange(() => this.update()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(SETTING)) this.update();
      }),
    );
    this.update();
  }

  private update(): void {
    const enabled = vscode.workspace.getConfiguration().get<boolean>(SETTING, true);
    const status = this.session.getStatus();
    const inbox = this.session.getInbox();
    if (!enabled || status.dashboard.kind === 'needsSetup' || status.dashboard.kind === 'loading' && inbox.items === null) {
      this.item.hide();
      return;
    }

    if (!status.monitoringEnabled) {
      this.item.text = '$(debug-pause) DevMate';
      this.item.tooltip = 'DevMate Kit: Monitoring paused — click to open Daily Tasks and resume.';
      this.item.backgroundColor = undefined;
      this.item.accessibilityInformation = { label: this.item.tooltip as string };
      this.item.show();
      return;
    }

    const count = inbox.items?.length ?? 0;
    const urgent = inbox.items?.filter((item) => item.priority === 1).length ?? 0;
    if (status.isRefreshing && inbox.items === null) {
      this.item.text = '$(sync~spin) DevMate';
    } else if (count === 0) {
      this.item.text = '$(check) DevMate';
    } else {
      this.item.text = `$(bell-dot) ${count}`;
    }
    this.item.tooltip = count === 0
      ? 'DevMate Kit: nothing needs your attention right now. Click to open Daily Tasks.'
      : `DevMate Kit: ${count} item${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} your attention${urgent ? ` (${urgent} urgent)` : ''}. Click to open Daily Tasks.`;
    this.item.backgroundColor = urgent > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    this.item.accessibilityInformation = { label: this.item.tooltip as string };
    this.item.show();
  }

  dispose(): void {
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
