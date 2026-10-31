import * as vscode from 'vscode';
import { allCommands } from './commands';
import { getActiveEditorOrWarn } from './utils/textEdit';
import { SidebarProvider } from './views/SidebarProvider';
import { ToolPanel } from './panels/ToolPanel';
import { DashboardPanel } from './panels/DashboardPanel';
import { GitHubAuthService } from './github/auth';
import { GitHubClient } from './github/client';
import { GitHubConfigStore } from './github/configStore';
import { LastSeenStore } from './github/lastSeenStore';

export function activate(context: vscode.ExtensionContext): void {
  for (const command of allCommands) {
    const disposable = vscode.commands.registerCommand(command.id, async () => {
      const editor = getActiveEditorOrWarn();
      if (!editor) {
        return;
      }
      try {
        await command.handler(editor, context);
      } catch (err) {
        vscode.window.showErrorMessage(`Dev Utilities: ${(err as Error).message}`);
      }
    });
    context.subscriptions.push(disposable);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('devUtilities.openTool', (toolId: string) => {
      ToolPanel.createOrShow(context.extensionUri, toolId);
    })
  );

  const authService = new GitHubAuthService();
  const lastSeenStore = new LastSeenStore(context);
  const configStore = new GitHubConfigStore(authService, GitHubClient);

  const sidebarProvider = new SidebarProvider(context.extensionUri, context, {
    authService,
    configStore,
    client: GitHubClient,
    lastSeenStore,
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('devUtilities.sidebar', sidebarProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devUtilities.githubSignIn', () => {
      void authService.getSession(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devUtilities.openDashboard', () => {
      DashboardPanel.createOrShow(context.extensionUri, context, {
        authService,
        configStore,
        client: GitHubClient,
        lastSeenStore,
      });
    })
  );
}

export function deactivate(): void {}
