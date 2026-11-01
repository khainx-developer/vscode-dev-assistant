import type { McpConnectionService } from '../mcp/connectionService';
import type { McpToolError } from '../mcp/types';
import type { JiraTask } from './types';

type AccessibleResource = { cloudId: string; url: string };

type AccessibleResourcesResult = { data: { resources: AccessibleResource[] } };

type SearchJqlIssue = {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    assignee: { displayName: string } | null;
    duedate?: string | null;
  };
};

type SearchJqlResult = { data: { issues: SearchJqlIssue[] } };

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '').toLowerCase();
}

// Every Atlassian MCP tool result is the SDK's raw CallToolResult shape
// (`{ content: [{ type: 'text', text: '<json>' }] }`), not the already-parsed payload — confirmed
// live (DecisionLog.md, "resources.find is not a function"). Unwrap+parse that text here rather
// than casting the raw result directly, which is the bug TASK-009's own risk note anticipated.
function parseToolResultText<T>(result: unknown): T {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
  const text = content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Unexpected Atlassian MCP tool result: no text content.');
  }
  return JSON.parse(text) as T;
}

function mapIssue(siteUrl: string, issue: SearchJqlIssue): JiraTask {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    assignee: issue.fields.assignee?.displayName ?? null,
    dueDate: issue.fields.duedate ?? null,
    url: `${siteUrl}/browse/${issue.key}`,
    prLink: { kind: 'not-available' },
  };
}

export const AtlassianMcpAdapter = {
  async validateConnection(
    connectionService: McpConnectionService,
    siteUrl: string,
  ): Promise<{ ok: true; siteId: string } | { ok: false; reason: string }> {
    const raw = parseToolResultText<AccessibleResourcesResult>(
      await connectionService.callTool('atlassian', 'getAccessibleAtlassianResources', {}),
    );

    const normalizedTarget = normalizeUrl(siteUrl);
    const match = raw.data.resources.find((resource) => normalizeUrl(resource.url) === normalizedTarget);
    if (!match) {
      return { ok: false, reason: 'Could not find an accessible Jira site at that URL.' };
    }
    return { ok: true, siteId: match.cloudId };
  },

  async validateQuery(
    connectionService: McpConnectionService,
    siteId: string,
    jql: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      await connectionService.callTool('atlassian', 'searchJiraIssuesUsingJql', {
        cloudId: siteId,
        jql,
        maxResults: 1,
        fields: ['summary'],
      });
      return { ok: true };
    } catch (error) {
      const toolError = error as McpToolError;
      if (toolError?.category === 'invalid-entry') {
        return { ok: false, reason: toolError.detail };
      }
      throw error;
    }
  },

  async fetchIssues(
    connectionService: McpConnectionService,
    siteId: string,
    jql: string,
    siteUrl: string,
  ): Promise<JiraTask[]> {
    const result = parseToolResultText<SearchJqlResult>(
      await connectionService.callTool('atlassian', 'searchJiraIssuesUsingJql', {
        cloudId: siteId,
        jql,
        maxResults: 50,
        fields: ['summary', 'status', 'assignee', 'duedate'],
      }),
    );

    return result.data.issues.map((issue) => mapIssue(siteUrl, issue));
  },
};
