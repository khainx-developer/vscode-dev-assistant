import * as vscode from 'vscode';
import type { CommentReadStateStore } from '../attention/commentReadStateStore';
import type { PullRequestCache } from '../github/pullRequestCache';
import type { JiraConfigStore } from '../jira/configStore';
import type { JiraConnectionStore } from '../jira/connectionStore';
import type { McpConnectionService } from '../mcp/connectionService';

export interface JiraServices {
  connectionStore: JiraConnectionStore;
  configStore: JiraConfigStore;
  connectionService: McpConnectionService;
  commentReadStateStore: CommentReadStateStore;
  pullRequestCache: PullRequestCache;
  outputChannel: vscode.OutputChannel;
}