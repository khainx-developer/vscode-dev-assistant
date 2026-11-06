import * as vscode from 'vscode';
import type { CommentReadStateStore } from '../../infrastructure/attention/commentReadStateStore';
import type { PullRequestCache } from '../../infrastructure/github/pullRequestCache';
import type { JiraConfigStore } from '../../infrastructure/jira/configStore';
import type { JiraConnectionStore } from '../../infrastructure/jira/connectionStore';
import type { McpConnectionService } from '../../infrastructure/mcp/connectionService';

export interface JiraServices {
  connectionStore: JiraConnectionStore;
  configStore: JiraConfigStore;
  connectionService: McpConnectionService;
  commentReadStateStore: CommentReadStateStore;
  pullRequestCache: PullRequestCache;
  outputChannel: vscode.OutputChannel;
}