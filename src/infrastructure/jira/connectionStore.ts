import * as vscode from 'vscode';
import type { McpConnectionService } from '../mcp/connectionService';
import { AtlassianMcpAdapter } from './atlassianMcpAdapter';
import type { JiraConnection } from '../../shared/jiraTypes';

const URL_FORMAT = /^https:\/\//;
const LEGACY_SECRET_KEY = 'devMateKit.jira.apiToken';

export class JiraConnectionStore {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly connectionService: McpConnectionService,
  ) {}

  async getConnection(): Promise<JiraConnection | undefined> {
    const cfg = vscode.workspace.getConfiguration('devMateKit.jira');
    const siteUrl = cfg.get<string>('siteUrl', '');
    const siteId = cfg.get<string>('siteId', '');
    if (!siteUrl || !siteId) {
      return undefined;
    }
    return { siteUrl, siteId };
  }

  async saveConnection(siteUrl: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!URL_FORMAT.test(siteUrl)) {
      return { ok: false, reason: 'Site URL must start with https://.' };
    }
    try {
      new URL(siteUrl);
    } catch {
      return { ok: false, reason: 'Site URL is not a valid URL.' };
    }

    try {
      await this.connectionService.connect('atlassian');
    } catch (error) {
      const detail = (error as { detail?: string })?.detail || (error as Error)?.message;
      return { ok: false, reason: detail || 'Could not authorize with Atlassian.' };
    }

    const result = await AtlassianMcpAdapter.validateConnection(this.connectionService, siteUrl);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    const cfg = vscode.workspace.getConfiguration('devMateKit.jira');
    await cfg.update('siteUrl', siteUrl, vscode.ConfigurationTarget.Global);
    await cfg.update('siteId', result.siteId, vscode.ConfigurationTarget.Global);
    await this.context.secrets.delete(LEGACY_SECRET_KEY);
    return { ok: true };
  }

  async clearConnection(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('devMateKit.jira');
    await cfg.update('siteUrl', '', vscode.ConfigurationTarget.Global);
    await cfg.update('siteId', '', vscode.ConfigurationTarget.Global);
    await this.connectionService.disconnect('atlassian');
    await this.context.secrets.delete(LEGACY_SECRET_KEY);
  }
}
