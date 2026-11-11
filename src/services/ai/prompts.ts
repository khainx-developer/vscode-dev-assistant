import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import { reasonLabel } from '../attention/reasonLabels';
import type { AttentionItem, PullRequestSummary } from '../../shared/githubTypes';
import type { JiraTask } from '../../shared/jiraTypes';

/**
 * Prompt templates and context builders for DevMate's AI use-cases.
 *
 * Everything sent to a model goes through these builders, which copy a short allow-list of
 * fields (titles, keys, statuses, reasons, dates, short comment excerpts). Raw provider payloads,
 * access tokens, OAuth state and URLs never reach the prompt.
 */

export const MAX_CONTEXT_ITEMS = 20;
export const MAX_COMMENT_CHARS = 200;
export const MAX_TITLE_CHARS = 140;

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SECRET_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

/** Defense in depth: comment text is user-authored and could contain pasted credentials. */
export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((value, pattern) => value.replace(pattern, '[redacted]'), text);
}

export function clip(text: string | null | undefined, max: number): string {
  const singleLine = redactSecrets(String(text ?? '')).replace(/\s+/g, ' ').trim();
  return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

export function relativeAge(iso: string | null | undefined, now: number): string {
  if (!iso) return 'unknown';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 'unknown';
  const minutes = Math.max(0, Math.round((now - parsed) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const PRIORITY_LABELS: Record<AttentionInboxItem['priority'], string> = {
  1: 'urgent',
  2: 'new activity',
  3: 'waiting on you',
  4: 'normal',
};

function describePr(pr: PullRequestSummary, now: number): string {
  const facts = [
    `${pr.repoKey}#${pr.number} "${clip(pr.title, MAX_TITLE_CHARS)}"`,
    `author ${pr.author}`,
    pr.draft ? 'draft' : null,
    pr.state !== 'OPEN' ? pr.state.toLowerCase() : null,
    pr.checkStatus ? `checks ${pr.checkStatus.toLowerCase()}` : null,
    pr.mergeable === 'CONFLICTING' ? 'has merge conflicts' : null,
    `updated ${relativeAge(pr.updatedAt, now)}`,
  ];
  return facts.filter(Boolean).join(', ');
}

function describeTask(task: JiraTask, now: number): string {
  const facts = [
    `${task.key} "${clip(task.summary, MAX_TITLE_CHARS)}"`,
    `status ${task.status}`,
    task.assignee ? `assignee ${task.assignee}` : 'unassigned',
    task.dueDate ? `due ${task.dueDate}` : null,
    task.updatedAt ? `updated ${relativeAge(task.updatedAt, now)}` : null,
  ];
  return facts.filter(Boolean).join(', ');
}

/** One compact, numbered block per inbox item. */
export function describeInboxItem(item: AttentionInboxItem, index: number, now: number): string {
  const lines: string[] = [];
  const head = item.jiraTask ? `Jira ${describeTask(item.jiraTask, now)}` : item.pr ? `PR ${describePr(item.pr, now)}` : 'Item';
  lines.push(`${index + 1}. [${PRIORITY_LABELS[item.priority]}] ${head}`);
  lines.push(`   Why flagged: ${item.reasons.map((reason) => reasonLabel(reason).label).join('; ') || 'linked work'}`);
  for (const related of item.relatedPRs.slice(0, 3)) {
    lines.push(`   Linked PR: ${describePr(related.pr, now)}`);
  }
  const comment = item.jiraLatestUnreadComment ?? item.prLatestUnreadComment;
  if (comment) {
    lines.push(`   Latest unread comment by ${comment.authorIdentity}: "${clip(comment.bodyText, MAX_COMMENT_CHARS)}"`);
  }
  return lines.join('\n');
}

export function buildInboxContext(items: AttentionInboxItem[], now: number): string {
  if (items.length === 0) return 'The attention inbox is empty.';
  const shown = items.slice(0, MAX_CONTEXT_ITEMS);
  const omitted = items.length - shown.length;
  return [
    `Attention inbox (${items.length} item${items.length === 1 ? '' : 's'}, highest priority first):`,
    ...shown.map((item, index) => describeInboxItem(item, index, now)),
    omitted > 0 ? `(${omitted} lower-priority item${omitted === 1 ? '' : 's'} omitted.)` : '',
  ].filter(Boolean).join('\n');
}

const GUARDRAILS = [
  'Only use the facts provided below. Do not invent tickets, people, or pull requests.',
  'Refer to work by its key or repo#number so the developer can find it.',
  'Write in plain, calm English. Use Markdown. Keep it short.',
].join(' ');

export function buildNextStepsPrompt(items: AttentionInboxItem[], now: number, me: { github: string | null; jira: string | null }): PromptMessage[] {
  const identity = [me.github ? `GitHub user "${me.github}"` : null, me.jira ? `Jira user "${me.jira}"` : null]
    .filter(Boolean).join(' and ') || 'the developer';
  return [{
    role: 'user',
    content: [
      `You are a pragmatic engineering lead helping ${identity} decide what to work on next.`,
      GUARDRAILS,
      '',
      'Reply with exactly this structure:',
      '**Start here:** one sentence naming the single best first action and why.',
      '',
      '### Plan',
      '3 to 7 numbered bullets, most important first. Each bullet: the action (review, reply, fix checks, resolve conflict, update Jira…), the item key, and a short reason.',
      '',
      'Prefer unblocking teammates (reviews they wait on) and fixing red items (failing checks, changes requested, conflicts, overdue) before new activity.',
      'If the inbox is empty, say so in one sentence and suggest a sensible focus.',
      '',
      buildInboxContext(items, now),
    ].join('\n'),
  }];
}

export function buildExplainItemPrompt(item: AttentionInboxItem, now: number): PromptMessage[] {
  const explanations = item.reasons
    .map((reason) => `- ${reasonLabel(reason).label}: ${reasonLabel(reason).explanation}`)
    .join('\n');
  return [{
    role: 'user',
    content: [
      'Explain to a developer why this item is in their attention inbox and what they should do next.',
      GUARDRAILS,
      '',
      'Reply with:',
      '1. **Why it is flagged** — one or two sentences.',
      '2. **Suggested next step** — one concrete human action (e.g. review the PR, reply to the comment, fix the failing checks, rebase to resolve conflicts, update the Jira status or due date).',
      '3. Optionally, one short tip.',
      '',
      'Item:',
      describeInboxItem(item, 0, now),
      '',
      'What the flags mean:',
      explanations || '- Linked work that may need follow-up.',
    ].join('\n'),
  }];
}

export interface StandupSnapshot {
  me: { github: string | null; jira: string | null };
  myPullRequests: AttentionItem[];
  reviewingPullRequests: AttentionItem[];
  myTasks: JiraTask[];
  attention: AttentionInboxItem[];
}

export function buildStandupPrompt(snapshot: StandupSnapshot, now: number): PromptMessage[] {
  const myPrs = snapshot.myPullRequests.slice(0, MAX_CONTEXT_ITEMS)
    .map((item) => `- ${describePr(item.pr, now)}; review state ${item.reviewState.replace(/_/g, ' ')}`);
  const reviewing = snapshot.reviewingPullRequests.slice(0, MAX_CONTEXT_ITEMS)
    .map((item) => `- ${describePr(item.pr, now)}`);
  const tasks = snapshot.myTasks.slice(0, MAX_CONTEXT_ITEMS).map((task) => `- ${describeTask(task, now)}`);
  const blockers = snapshot.attention
    .filter((item) => item.priority === 1)
    .slice(0, 10)
    .map((item) => describeInboxItem(item, 0, now).replace(/^1\. /, '- '));

  return [{
    role: 'user',
    content: [
      'Write a daily standup update for a developer from the work data below.',
      GUARDRAILS,
      `Today is ${new Date(now).toDateString()}.`,
      '',
      'Use exactly these Markdown headings and 2–5 bullets under each:',
      '## Yesterday',
      'Work that moved recently (updated in roughly the last working day): PRs opened, updated or merged; tickets that changed.',
      '## Today',
      'What is planned next: open PRs to land, reviews owed to teammates, tickets in progress or due soon.',
      '## Blockers',
      'Failing checks, changes requested, merge conflicts, overdue or stale items. Write "None" if there are none.',
      'Do not add any other sections, preamble, or sign-off.',
      '',
      `My pull requests (${myPrs.length}):`,
      ...(myPrs.length ? myPrs : ['- none']),
      '',
      `Teammates' pull requests I am watching (${reviewing.length}):`,
      ...(reviewing.length ? reviewing : ['- none']),
      '',
      `My Jira tickets (${tasks.length}):`,
      ...(tasks.length ? tasks : ['- none']),
      '',
      'Urgent attention items:',
      ...(blockers.length ? blockers : ['- none']),
    ].join('\n'),
  }];
}
