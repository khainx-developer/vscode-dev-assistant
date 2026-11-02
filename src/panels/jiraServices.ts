import * as vscode from 'vscode';
import type { PullRequestCache } from '../github/pullRequestCache';
import type { JiraConfigStore } from '../jira/configStore';
import type { JiraConnectionStore } from '../jira/connectionStore';
import type { McpConnectionService } from '../mcp/connectionService';

export interface JiraServices {
  connectionStore: JiraConnectionStore;
  configStore: JiraConfigStore;
  connectionService: McpConnectionService;
  pullRequestCache: PullRequestCache;
  outputChannel: vscode.OutputChannel;
}