import * as vscode from 'vscode';
import { allCommands } from './ui/commands/index';
import { getActiveEditorOrWarn } from './ui/textEdit';
import { SidebarProvider } from './ui/views/SidebarProvider';
import { ToolPanel } from './ui/panels/ToolPanel';
import { DashboardPanel } from './ui/panels/DashboardPanel';
import { GitHubAuthService } from './infrastructure/github/auth';
import { GitHubConfigStore } from './infrastructure/github/configStore';
import { LastSeenStore } from './infrastructure/github/lastSeenStore';
import { PullRequestCache } from './infrastructure/github/pullRequestCache';
import { McpConnectionService } from './infrastructure/mcp/connectionService';
import { JiraConfigStore } from './infrastructure/jira/configStore';
import { JiraConnectionStore } from './infrastructure/jira/connectionStore';
import { CommentReadStateStore } from './infrastructure/attention/commentReadStateStore';

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
        vscode.window.showErrorMessage(`DevMate Kit: ${(err as Error).message}`);
      }
    });
    context.subscriptions.push(disposable);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('devMateKit.openTool', (toolId: string) => {
      ToolPanel.createOrShow(context.extensionUri, toolId);
    })
  );

  const authService = new GitHubAuthService();
  const lastSeenStore = new LastSeenStore(context);
  const pullRequestCache = new PullRequestCache();
  const connectionService = new McpConnectionService(context);
  const configStore = new GitHubConfigStore(authService, connectionService);
  const jiraConnectionStore = new JiraConnectionStore(context, connectionService);
  const jiraConfigStore = new JiraConfigStore(jiraConnectionStore, connectionService);
  const commentReadStateStore = new CommentReadStateStore(context);
  const jiraOutputChannel = vscode.window.createOutputChannel('DevMate Kit');
  context.subscriptions.push(jiraOutputChannel);
  const jiraServices = {
    connectionStore: jiraConnectionStore,
    configStore: jiraConfigStore,
    connectionService,
    commentReadStateStore,
    pullRequestCache,
    outputChannel: jiraOutputChannel,
  };

  context.subscriptions.push({ dispose: () => void connectionService.dispose() });

  const sidebarProvider = new SidebarProvider(context.extensionUri, context, {
    authService,
    configStore,
    connectionService,
    lastSeenStore,
    pullRequestCache,
  }, jiraServices);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('devMateKit.sidebar', sidebarProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devMateKit.githubSignIn', () => {
      void authService.getSession(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devMateKit.openDashboard', () => {
      DashboardPanel.createOrShow(context.extensionUri, context, {
        authService,
        configStore,
        connectionService,
        lastSeenStore,
        pullRequestCache,
      }, jiraServices);
    })
  );

}

export function deactivate(): void {}
