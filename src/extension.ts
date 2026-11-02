import * as vscode from 'vscode';
import { allCommands } from './commands';
import { getActiveEditorOrWarn } from './utils/textEdit';
import { SidebarProvider } from './views/SidebarProvider';
import { ToolPanel } from './panels/ToolPanel';
import { DashboardPanel } from './panels/DashboardPanel';
import { GitHubAuthService } from './github/auth';
import { GitHubConfigStore } from './github/configStore';
import { LastSeenStore } from './github/lastSeenStore';
import { PullRequestCache } from './github/pullRequestCache';
import { McpConnectionService } from './mcp/connectionService';
import { JiraConfigStore } from './jira/configStore';
import { JiraConnectionStore } from './jira/connectionStore';
import { CommentReadStateStore } from './attention/commentReadStateStore';

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
        vscode.window.showErrorMessage(`Dev Assistant: ${(err as Error).message}`);
      }
    });
    context.subscriptions.push(disposable);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('devAssistant.openTool', (toolId: string) => {
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
  const jiraOutputChannel = vscode.window.createOutputChannel('Dev Assistant');
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
    vscode.window.registerWebviewViewProvider('devAssistant.sidebar', sidebarProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devAssistant.githubSignIn', () => {
      void authService.getSession(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devAssistant.openDashboard', () => {
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
