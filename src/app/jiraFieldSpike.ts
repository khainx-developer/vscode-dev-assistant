import type { AppServices } from './container';

/**
 * Throwaway spike (see docs/roadmap.md, "Decisions needed"). Calls the Atlassian MCP with extra
 * fields and writes the *shape* of each result to the "DevMate Kit" output channel, so we can see
 * whether description, issue links and the Flagged field come back and in what format.
 * Output stays on this machine. Delete this file, its command and its package.json entry once
 * the answers are recorded in the docs.
 */

const SAMPLE_LIMIT = 300;

function unwrap(result: unknown): unknown {
  const text = (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
  if (typeof text !== 'string') {
    return result;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sample(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return 'undefined';
  return text.length > SAMPLE_LIMIT ? `${text.slice(0, SAMPLE_LIMIT)}… (${text.length} chars)` : text;
}

function describe(value: unknown): string {
  if (value === undefined) return 'MISSING';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') {
    const type = (value as { type?: unknown }).type;
    return typeof type === 'string' ? `object(type=${type})` : 'object';
  }
  return typeof value;
}

function errorText(error: unknown): string {
  return (error as { detail?: string })?.detail ?? (error as Error)?.message ?? String(error);
}

export async function runJiraFieldSpike(services: AppServices): Promise<void> {
  const { output, mcp, jiraConnection } = services;
  const log = (line: string): void => output.appendLine(`[jira-spike] ${line}`);
  output.show(true);

  const connection = await jiraConnection.getConnection();
  if (!connection) {
    log('No Jira connection. Connect Jira in Setup first.');
    return;
  }
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> =>
    unwrap(await mcp.callTool('atlassian', name, { cloudId: connection.siteId, ...args }));
  const issuesOf = (payload: unknown): Array<{ key: string; fields: Record<string, unknown> }> =>
    ((payload as { data?: { issues?: unknown[] } })?.data?.issues ?? []) as Array<{
      key: string;
      fields: Record<string, unknown>;
    }>;

  log('--- 1. Standard fields (description, issuelinks, labels, priority, issuetype) ---');
  let firstKey: string | undefined;
  try {
    const issues = issuesOf(await call('searchJiraIssuesUsingJql', {
      jql: 'assignee = currentUser() ORDER BY updated DESC',
      maxResults: 3,
      fields: ['summary', 'description', 'issuelinks', 'labels', 'priority', 'issuetype'],
    }));
    log(`issues returned: ${issues.length}`);
    firstKey = issues[0]?.key;
    for (const issue of issues) {
      log(`${issue.key}:`);
      for (const field of ['description', 'issuelinks', 'labels', 'priority', 'issuetype']) {
        log(`  ${field}: ${describe(issue.fields?.[field])} | ${sample(issue.fields?.[field])}`);
      }
    }
  } catch (error) {
    log(`FAILED: ${errorText(error)}`);
  }

  log('--- 2. All fields on one issue (looking for the Flagged custom field) ---');
  try {
    const [issue] = issuesOf(await call('searchJiraIssuesUsingJql', {
      jql: 'assignee = currentUser() ORDER BY updated DESC',
      maxResults: 1,
      fields: ['*all'],
    }));
    if (!issue) {
      log('no issue returned');
    } else {
      const custom = Object.entries(issue.fields ?? {}).filter(([key, value]) => key.startsWith('customfield_') && value !== null);
      log(`${issue.key}: ${Object.keys(issue.fields ?? {}).length} fields, ${custom.length} non-null custom fields`);
      for (const [key, value] of custom) {
        const flaggedHint = JSON.stringify(value).includes('Impediment') ? '  <-- looks like Flagged' : '';
        log(`  ${key}: ${describe(value)} | ${sample(value)}${flaggedHint}`);
      }
    }
  } catch (error) {
    log(`FAILED: ${errorText(error)}`);
  }

  log('--- 3. getJiraIssue (description format on a single issue) ---');
  if (!firstKey) {
    log('skipped: no issue key from step 1');
  } else {
    try {
      const payload = (await call('getJiraIssue', { issueIdOrKey: firstKey, fields: ['description', 'issuelinks'] })) as {
        data?: { fields?: Record<string, unknown> };
      };
      const fields = payload?.data?.fields ?? (payload as { fields?: Record<string, unknown> })?.fields;
      log(`${firstKey} description: ${describe(fields?.description)} | ${sample(fields?.description)}`);
      log(`${firstKey} issuelinks: ${describe(fields?.issuelinks)} | ${sample(fields?.issuelinks)}`);
    } catch (error) {
      log(`FAILED: ${errorText(error)}`);
    }
  }

  log('--- 4. JQL probes ---');
  for (const jql of ['flagged is not EMPTY', 'assignee = currentUser() AND statusCategory = "In Progress"']) {
    try {
      const issues = issuesOf(await call('searchJiraIssuesUsingJql', { jql, maxResults: 1, fields: ['summary'] }));
      log(`OK  "${jql}" -> ${issues.length} issue(s) returned`);
    } catch (error) {
      log(`ERR "${jql}" -> ${errorText(error)}`);
    }
  }

  log('--- done. Copy the lines above back to Claude (check for sensitive text first). ---');
}
