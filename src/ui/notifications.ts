import * as vscode from 'vscode';
import type { DashboardSession } from '../app/dashboardSession';
import { itemUrl, notificationMessage } from '../services/attention/notificationPlanner';
import type { AttentionInboxItem } from '../services/attention/attentionInboxBuilder';

const SETTING = 'devMateKit.notifications.enabled';

/**
 * Native toast when a background refresh finds new attention items. One toast per refresh —
 * several new items are batched into "N items need your attention". VS Code's own
 * Do-Not-Disturb mode suppresses these like any other notification.
 */
export class AttentionNotifier implements vscode.Disposable {
  private readonly subscription: vscode.Disposable;

  constructor(session: DashboardSession, private readonly isDashboardFocused: () => boolean) {
    this.subscription = session.onDidFindNewItems((items) => void this.notify(items));
  }

  private async notify(items: AttentionInboxItem[]): Promise<void> {
    if (!vscode.workspace.getConfiguration().get<boolean>(SETTING, true)) return;
    if (this.isDashboardFocused()) return;
    const message = notificationMessage(items);
    if (!message) return;

    const single = items.length === 1 ? items[0] : undefined;
    const openItem = single?.jiraTask ? 'Open in Jira' : single?.pr ? 'Open PR' : undefined;
    const actions = [openItem, 'Open Dashboard', 'Turn off'].filter((action): action is string => !!action);
    const choice = await vscode.window.showInformationMessage(message, ...actions);

    if (choice === 'Open Dashboard') {
      await vscode.commands.executeCommand('devMateKit.openDashboard');
    } else if (choice && choice === openItem && single) {
      const url = itemUrl(single);
      if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
    } else if (choice === 'Turn off') {
      await vscode.workspace.getConfiguration('devMateKit.notifications').update('enabled', false, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage('DevMate: Notifications turned off. You can turn them back on in Setup.');
    }
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
