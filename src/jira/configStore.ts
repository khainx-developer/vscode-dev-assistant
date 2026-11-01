import * as vscode from 'vscode';
import type { McpConnectionService } from '../mcp/connectionService';
import { AtlassianMcpAdapter } from './atlassianMcpAdapter';
import type { JiraConnectionStore } from './connectionStore';
import type { JiraSavedQuery } from './types';

export class JiraConfigStore {
  constructor(
    private readonly connectionStore: JiraConnectionStore,
    private readonly connectionService: McpConnectionService,
  ) {}

  getSavedQueries(): JiraSavedQuery[] {
    return vscode.workspace.getConfiguration('devAssistant.jira').get<JiraSavedQuery[]>('savedQueries', []);
  }

  getCurrentUser(): string | null {
    const value = vscode.workspace.getConfiguration('devAssistant.jira').get<string>('currentUser', '').trim();
    return value === '' ? null : value;
  }

  async setCurrentUser(displayName: string): Promise<void> {
    await vscode.workspace
      .getConfiguration('devAssistant.jira')
      .update('currentUser', displayName.trim(), vscode.ConfigurationTarget.Global);
  }

  async addQuery(label: string, jql: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const trimmedLabel = label.trim();
    if (trimmedLabel === '') {
      return { ok: false, reason: 'Label is required.' };
    }
    if (jql.trim() === '') {
      return { ok: false, reason: 'JQL is required.' };
    }
    const current = this.getSavedQueries();
    if (current.some((query) => query.label.toLowerCase() === trimmedLabel.toLowerCase())) {
      return { ok: false, reason: 'A saved query with this label already exists.' };
    }

    const connection = await this.connectionStore.getConnection();
    if (!connection) {
      return { ok: false, reason: 'Save a Jira connection first.' };
    }

    const result = await AtlassianMcpAdapter.validateQuery(this.connectionService, connection.siteId, jql);
    if (!result.ok) {
      return result;
    }

    const cfg = vscode.workspace.getConfiguration('devAssistant.jira');
    await cfg.update(
      'savedQueries',
      [...current, { label: trimmedLabel, jql }],
      vscode.ConfigurationTarget.Global,
    );
    return { ok: true };
  }

  async removeQuery(label: string): Promise<void> {
    const current = this.getSavedQueries();
    const filtered = current.filter((query) => query.label.toLowerCase() !== label.toLowerCase());
    await vscode.workspace
      .getConfiguration('devAssistant.jira')
      .update('savedQueries', filtered, vscode.ConfigurationTarget.Global);
  }
}
