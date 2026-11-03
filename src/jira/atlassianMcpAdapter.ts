import type { McpConnectionService } from '../mcp/connectionService';
import type { McpToolError } from '../mcp/types';
import type { JiraCommentSummary, JiraCommentVisibility, JiraTask } from './types';

type AccessibleResource = { cloudId: string; url: string };

type AccessibleResourcesResult = { data: { resources: AccessibleResource[] } };

type SearchJqlIssue = {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    assignee: { displayName: string } | null;
    duedate?: string | null;
    updated: string;
  };
};

type SearchJqlResult = { data: { issues: SearchJqlIssue[] } };

type JiraCommentPayload = {
  id: string;
  author: { displayName: string };
  body: unknown;
  created: string;
  visibility?: JiraCommentVisibility | null;
};

type JiraCommentPage = {
  data: {
    comments: JiraCommentPayload[];
    total: number;
    isLast: boolean;
  };
};

const MAX_CONCURRENT_ATLASSIAN_CALLS = 2;
const inFlightAtlassianCalls = new Map<string, Promise<unknown>>();
const queuedAtlassianCalls: Array<() => void> = [];
let activeAtlassianCalls = 0;

async function callAtlassianTool(
  connectionService: McpConnectionService,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const key = JSON.stringify([name, args]);
  const inFlight = inFlightAtlassianCalls.get(key);
  if (inFlight) return inFlight;

  const request = (async () => {
    if (activeAtlassianCalls >= MAX_CONCURRENT_ATLASSIAN_CALLS) {
      await new Promise<void>((resolve) => queuedAtlassianCalls.push(resolve));
    } else {
      activeAtlassianCalls++;
    }
    try {
      return await connectionService.callTool('atlassian', name, args);
    } finally {
      const next = queuedAtlassianCalls.shift();
      if (next) next();
      else activeAtlassianCalls--;
    }
  })();
  inFlightAtlassianCalls.set(key, request);

  try {
    return await request;
  } finally {
    if (inFlightAtlassianCalls.get(key) === request) {
      inFlightAtlassianCalls.delete(key);
    }
  }
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '').toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Every Atlassian MCP tool result is the SDK's raw CallToolResult shape
// (`{ content: [{ type: 'text', text: '<json>' }] }`), not the already-parsed payload — confirmed
// live (DecisionLog.md, "resources.find is not a function"). Unwrap+parse that text here rather
// than casting the raw result directly, which is the bug TASK-009's own risk note anticipated.
function parseToolResultText<T>(result: unknown): T {
  const toolResult = result as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
  const content = toolResult?.content;
  const text = content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Unexpected Atlassian MCP tool result: no text content.');
  }
  if (toolResult.isError) {
    throw new Error('Atlassian MCP tool returned an error result.');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Atlassian MCP tool returned non-JSON text.');
  }
}

function parseCommentPage(result: unknown): JiraCommentPage {
  const payload = parseToolResultText<unknown>(result);
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error('Atlassian MCP comment result is missing its data envelope.');
  }

  const { comments, total, isLast } = payload.data;
  if (
    !Array.isArray(comments)
    || typeof total !== 'number'
    || !Number.isInteger(total)
    || total < 0
    || typeof isLast !== 'boolean'
  ) {
    throw new Error('Atlassian MCP comment result has malformed page metadata.');
  }

  return { data: { comments: comments as JiraCommentPayload[], total, isLast } };
}

function flattenAdf(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(flattenAdf).join('');
  }
  if (!isRecord(value)) {
    return '';
  }

  if (value.type === 'text') {
    if (typeof value.text !== 'string') {
      throw new Error('Jira comment contains a malformed ADF text node.');
    }
    return value.text;
  }
  if (value.type === 'hardBreak') {
    return '\n';
  }
  if (value.content !== undefined && !Array.isArray(value.content)) {
    throw new Error('Jira comment contains malformed ADF content.');
  }

  const content = Array.isArray(value.content) ? value.content.map(flattenAdf).join('') : '';
  return value.type === 'paragraph' || value.type === 'heading' || value.type === 'listItem'
    ? `${content}\n`
    : content;
}

function mapJiraComment(raw: JiraCommentPayload, siteUrl: string, issueKey: string): JiraCommentSummary {
  if (
    !isRecord(raw)
    || typeof raw.id !== 'string'
    || !isRecord(raw.author)
    || typeof raw.author.displayName !== 'string'
    || (typeof raw.body !== 'string' && (!isRecord(raw.body) || !Array.isArray(raw.body.content)))
    || typeof raw.created !== 'string'
    || !Number.isFinite(Date.parse(raw.created))
  ) {
    throw new Error('Atlassian MCP comment result contains a malformed comment.');
  }

  let visibility: JiraCommentVisibility | null = null;
  if (raw.visibility !== undefined && raw.visibility !== null) {
    if (
      !isRecord(raw.visibility)
      || typeof raw.visibility.type !== 'string'
      || typeof raw.visibility.value !== 'string'
    ) {
      throw new Error('Atlassian MCP comment result contains malformed visibility.');
    }
    visibility = { type: raw.visibility.type, value: raw.visibility.value };
  }

  const body = typeof raw.body === 'string' ? raw.body : flattenAdf(raw.body).replace(/\n+$/, '');
  return {
    id: raw.id,
    author: raw.author.displayName,
    body,
    createdAt: raw.created,
    visibility,
    url: `${siteUrl}/browse/${issueKey}`,
  };
}

function mapIssue(siteUrl: string, issue: SearchJqlIssue): JiraTask {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    assignee: issue.fields.assignee?.displayName ?? null,
    dueDate: issue.fields.duedate ?? null,
    updatedAt: issue.fields.updated,
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
      await callAtlassianTool(connectionService, 'getAccessibleAtlassianResources', {}),
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
      await callAtlassianTool(connectionService, 'searchJiraIssuesUsingJql', {
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
      await callAtlassianTool(connectionService, 'searchJiraIssuesUsingJql', {
        cloudId: siteId,
        jql,
        maxResults: 50,
        fields: ['summary', 'status', 'assignee', 'duedate', 'updated'],
      }),
    );

    return result.data.issues.map((issue) => mapIssue(siteUrl, issue));
  },

  async fetchIssueComments(
    connectionService: McpConnectionService,
    siteId: string,
    issueKey: string,
    siteUrl: string,
    seenAt: number | undefined,
  ): Promise<JiraCommentSummary[]> {
    const comments: JiraCommentSummary[] = [];
    let startAt = 0;

    for (;;) {
      const page = parseCommentPage(
        await callAtlassianTool(connectionService, 'listJiraIssueComments', {
          cloudId: siteId,
          issueIdOrKey: issueKey,
          startAt,
          maxResults: 100,
          orderBy: '-created',
        }),
      );
      const mappedComments = page.data.comments.map((comment) => mapJiraComment(comment, siteUrl, issueKey));
      comments.push(...mappedComments);

      if (
        seenAt === undefined
        || page.data.isLast
        || mappedComments.some((comment) => Date.parse(comment.createdAt) < seenAt)
      ) {
        return comments;
      }
      if (page.data.comments.length === 0) {
        throw new Error('Atlassian MCP comment result made no progress before the last page.');
      }

      startAt += page.data.comments.length;
    }
  },
};
