import * as vscode from 'vscode';
import { createContainer } from './app/container';
import { allCommands } from './ui/commands/index';
import { getActiveEditorOrWarn } from './ui/textEdit';
import { SIDEBAR_VIEW_ID, SidebarProvider } from './ui/views/SidebarProvider';
import { ToolPanel } from './ui/panels/ToolPanel';
import { DashboardPanel } from './ui/panels/DashboardPanel';
import { AttentionStatusBar } from './ui/statusBar';
import { AttentionNotifier } from './ui/notifications';
import type { SetupStepId } from './services/session/setupStatus';

export function activate(context: vscode.ExtensionContext): void {
  registerTextCommands(context);

  // The AI coordinator needs to reveal UI that is built from the session it receives, so the
  // hooks resolve the surfaces lazily.
  const surfaces: { sidebar?: SidebarProvider } = {};
  const { session, ai } = createContainer(context, {
    revealDashboard: () => DashboardPanel.createOrShow(context.extensionUri, session),
    revealSetup: () => void surfaces.sidebar?.showTab('setup', 'ai'),
  });

  const sidebar = new SidebarProvider(context.extensionUri, session);
  surfaces.sidebar = sidebar;
  context.subscriptions.push(
    sidebar,
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebar, { webviewOptions: { retainContextWhenHidden: true } }),
    new AttentionStatusBar(session),
    new AttentionNotifier(session, () => DashboardPanel.isFocused()),
  );

  const register = (id: string, handler: (...args: never[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  register('devMateKit.openDashboard', () => DashboardPanel.createOrShow(context.extensionUri, session));
  register('devMateKit.openSetup', (step?: SetupStepId) => sidebar.showTab('setup', step));
  register('devMateKit.openTools', () => sidebar.showTab('tools'));
  register('devMateKit.openTool', (toolId: string) => ToolPanel.createOrShow(context.extensionUri, toolId));
  register('devMateKit.refresh', () => session.refreshAll({ notify: false }));
  register('devMateKit.githubSignIn', () => session.handleCommand({ command: 'github.signIn' }));
  register('devMateKit.ai.whatNext', () => ai.whatShouldIDoNext());
  register('devMateKit.ai.standup', () => ai.standup());
  register('devMateKit.ai.selectModel', () => ai.pickModel());
}

function registerTextCommands(context: vscode.ExtensionContext): void {
  for (const command of allCommands) {
    context.subscriptions.push(vscode.commands.registerCommand(command.id, async () => {
      const editor = getActiveEditorOrWarn();
      if (!editor) {
        return;
      }
      try {
        await command.handler(editor, context);
      } catch (err) {
        vscode.window.showErrorMessage(`DevMate Kit: ${(err as Error).message}`);
      }
    }));
  }
}

export function deactivate(): void {}
