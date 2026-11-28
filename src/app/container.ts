import * as vscode from 'vscode';
import { GitHubAuthService } from '../infrastructure/github/auth';
import { GitHubConfigStore } from '../infrastructure/github/configStore';
import { LastSeenStore } from '../infrastructure/github/lastSeenStore';
import { PullRequestCache } from '../infrastructure/github/pullRequestCache';
import { McpConnectionService } from '../infrastructure/mcp/connectionService';
import { JiraConfigStore } from '../infrastructure/jira/configStore';
import { JiraConnectionStore } from '../infrastructure/jira/connectionStore';
import { CommentReadStateStore } from '../infrastructure/attention/commentReadStateStore';
import { AttentionPrefsStore } from '../infrastructure/attention/attentionPrefsStore';
import { AiConfigStore } from '../infrastructure/ai/aiConfigStore';
import { CursorCliClient } from '../infrastructure/ai/cursorCliClient';
import { LanguageModelClient } from '../infrastructure/ai/languageModelClient';
import { AnalysisStore } from '../infrastructure/analysis/analysisStore';
import { DashboardSession } from './dashboardSession';
import { AiCoordinator, type AiUiHooks } from './aiCoordinator';

/** Every long-lived service, built once per activation. */
export interface AppServices {
  context: vscode.ExtensionContext;
  output: vscode.OutputChannel;
  githubAuth: GitHubAuthService;
  githubConfig: GitHubConfigStore;
  lastSeen: LastSeenStore;
  pullRequestCache: PullRequestCache;
  mcp: McpConnectionService;
  jiraConnection: JiraConnectionStore;
  jiraConfig: JiraConfigStore;
  commentReadState: CommentReadStateStore;
  attentionPrefs: AttentionPrefsStore;
  analysisStore: AnalysisStore;
  aiConfig: AiConfigStore;
  languageModels: LanguageModelClient;
  cursorCli: CursorCliClient;
}

export interface AppContainer {
  services: AppServices;
  session: DashboardSession;
  ai: AiCoordinator;
}

export function createContainer(context: vscode.ExtensionContext, hooks: AiUiHooks): AppContainer {
  const output = vscode.window.createOutputChannel('DevMate Kit');
  const githubAuth = new GitHubAuthService();
  const mcp = new McpConnectionService(context);
  const jiraConnection = new JiraConnectionStore(context, mcp);

  const services: AppServices = {
    context,
    output,
    githubAuth,
    githubConfig: new GitHubConfigStore(githubAuth, mcp),
    lastSeen: new LastSeenStore(context),
    pullRequestCache: new PullRequestCache(),
    mcp,
    jiraConnection,
    jiraConfig: new JiraConfigStore(jiraConnection, mcp),
    commentReadState: new CommentReadStateStore(context),
    attentionPrefs: new AttentionPrefsStore(context.globalState),
    analysisStore: new AnalysisStore(context.globalState),
    aiConfig: new AiConfigStore(),
    languageModels: new LanguageModelClient(),
    cursorCli: new CursorCliClient(),
  };

  const session = new DashboardSession(services);
  const ai = new AiCoordinator(
    session,
    services.aiConfig,
    services.languageModels,
    services.cursorCli,
    services.analysisStore,
    hooks,
    { auth: services.githubAuth, mcp: services.mcp },
  );
  session.setAiHandler(ai);

  context.subscriptions.push(
    output,
    session,
    ai,
    { dispose: () => void mcp.dispose() },
  );

  return { services, session, ai };
}
