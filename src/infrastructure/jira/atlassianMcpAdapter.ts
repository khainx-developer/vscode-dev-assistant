import type { McpConnectionService } from '../mcp/connectionService';
import type { McpToolError } from '../../shared/mcpTypes';
import type {
  JiraBlockedByIssue,
  JiraCommentSummary,
  JiraCommentVisibility,
  JiraSubtask,
  JiraTask,
} from '../../shared/jiraTypes';

type AccessibleResource = { cloudId: string; url: string };

type AccessibleResourcesResult = { data: { resources: AccessibleResource[] } };

type JiraStatusPayload = {
  name: string;
  statusCategory?: { key?: string; name?: string } | null;
};

type SearchJqlSubtask = {
  key: string;
  fields: {
    summary: string;
    status: JiraStatusPayload;
  };
};

type SearchJqlLinkedIssue = {
  key?: string;
  fields?: {
    summary?: string;
    status?: JiraStatusPayload;
  };
};

type SearchJqlIssueLink = {
  type?: { name?: string; inward?: string; outward?: string };
  inwardIssue?: SearchJqlLinkedIssue;
  outwardIssue?: SearchJqlLinkedIssue;
};

type SearchJqlIssue = {
  key: string;
  fields: {
    summary: string;
    status: JiraStatusPayload;
    assignee: { displayName: string } | null;
    duedate?: string | null;
    updated: string;
    description?: unknown;
    subtasks?: SearchJqlSubtask[];
    issuelinks?: SearchJqlIssueLink[];
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

export function flattenAdf(value: unknown): string {
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
  if (value.type === 'heading') {
    const levelRaw = isRecord(value.attrs) && typeof value.attrs.level === 'number' ? value.attrs.level : 2;
    const level = Math.min(6, Math.max(1, levelRaw));
    return `${'#'.repeat(level)} ${content.replace(/\n+$/, '')}\n`;
  }
  return value.type === 'paragraph' || value.type === 'listItem'
    ? `${content}\n`
    : content;
}

/** Normalize a Jira description/body: string as-is, ADF flattened, anything else empty. */
export function normalizeDescription(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (isRecord(value) && (value.type === 'doc' || Array.isArray(value.content))) {
    return flattenAdf(value).replace(/\n+$/, '');
  }
  return '';
}

/**
 * Prefer an optional custom-field value (string/ADF) when present; else the
 * `## Acceptance Criteria` section in the description; else the full description.
 */
export function extractAcceptanceCriteria(description: unknown, customField?: unknown): string {
  if (customField !== undefined && customField !== null && !Array.isArray(customField)) {
    const fromCustom = normalizeDescription(customField).trim();
    if (fromCustom) return fromCustom;
  }

  const text = normalizeDescription(description);
  if (!text.trim()) return '';

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let start = -1;
  let headingLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (match && /^acceptance\s+criteria$/i.test(match[2].trim())) {
      start = i + 1;
      headingLevel = match[1].length;
      break;
    }
  }

  if (start < 0) return text.trim();

  const section: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const match = /^(#{1,6})\s+/.exec(lines[i]);
    if (match && match[1].length <= headingLevel) break;
    section.push(lines[i]);
  }
  return section.join('\n').trim() || text.trim();
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

function mapSubtask(siteUrl: string, subtask: SearchJqlSubtask): JiraSubtask {
  return {
    key: subtask.key,
    summary: subtask.fields.summary,
    status: subtask.fields.status.name,
    url: `${siteUrl}/browse/${subtask.key}`,
  };
}

function mapStatusCategory(
  status: JiraStatusPayload | undefined,
): JiraTask['statusCategory'] {
  const category = status?.statusCategory;
  if (!category || typeof category !== 'object') {
    return undefined;
  }
  const key = typeof category.key === 'string' ? category.key : undefined;
  const name = typeof category.name === 'string' ? category.name : undefined;
  if (!key && !name) {
    return undefined;
  }
  return { key, name };
}

/**
 * True for the inward ("is blocked by") side of a Blocks-style link.
 * Matches via type.inward / type.name wording; does not rely on one exact string.
 */
function isBlockedByLink(link: SearchJqlIssueLink): boolean {
  if (!link.inwardIssue) return false;
  const inward = typeof link.type?.inward === 'string' ? link.type.inward.trim().toLowerCase() : '';
  const name = typeof link.type?.name === 'string' ? link.type.name.trim().toLowerCase() : '';
  if (inward.includes('blocked by')) return true;
  if (name === 'blocks' || name === 'block') return true;
  return false;
}

function mapBlockedByIssue(siteUrl: string, linked: SearchJqlLinkedIssue): JiraBlockedByIssue | null {
  if (typeof linked.key !== 'string' || !linked.key.trim()) return null;
  // MCP may trim linked-issue fields; keep the key so the ticket still flags.
  const summary = typeof linked.fields?.summary === 'string' ? linked.fields.summary : '';
  const statusName = typeof linked.fields?.status?.name === 'string' ? linked.fields.status.name : '';
  const statusCategory = mapStatusCategory(linked.fields?.status);
  return {
    key: linked.key,
    summary,
    status: statusName,
    ...(statusCategory ? { statusCategory } : {}),
    url: `${siteUrl}/browse/${linked.key}`,
  };
}

/** Missing or malformed issuelinks → empty list; never throws. */
function mapBlockedBy(siteUrl: string, issuelinks: SearchJqlIssueLink[] | undefined): JiraBlockedByIssue[] {
  if (!Array.isArray(issuelinks)) return [];
  const blockers: JiraBlockedByIssue[] = [];
  for (const link of issuelinks) {
    if (!link || typeof link !== 'object') continue;
    if (!isBlockedByLink(link) || !link.inwardIssue) continue;
    const mapped = mapBlockedByIssue(siteUrl, link.inwardIssue);
    if (mapped) blockers.push(mapped);
  }
  return blockers;
}

function mapIssue(siteUrl: string, issue: SearchJqlIssue): JiraTask {
  const statusCategory = mapStatusCategory(issue.fields.status);
  const blockedBy = mapBlockedBy(siteUrl, issue.fields.issuelinks);
  const description = normalizeDescription(issue.fields.description).trim();
  const acceptanceCriteria = extractAcceptanceCriteria(issue.fields.description).trim();
  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    ...(statusCategory ? { statusCategory } : {}),
    assignee: issue.fields.assignee?.displayName ?? null,
    dueDate: issue.fields.duedate ?? null,
    updatedAt: issue.fields.updated,
    ...(description ? { description } : {}),
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
    subtasks: (issue.fields.subtasks ?? []).map((subtask) => mapSubtask(siteUrl, subtask)),
    ...(blockedBy.length > 0 ? { blockedBy } : {}),
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
        fields: ['summary', 'status', 'assignee', 'duedate', 'updated', 'description', 'subtasks', 'issuelinks'],
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
