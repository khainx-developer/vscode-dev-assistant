import type { EvidenceItem, EvidenceKind } from './types';

export interface EvidenceCommentInput {
  author: string;
  body: string;
  url?: string;
  createdAt?: string;
}

export interface EvidenceThreadInput {
  id?: string;
  is_resolved?: boolean;
  is_outdated?: boolean;
  path?: string;
  line?: number | null;
  url?: string;
  comments: EvidenceCommentInput[];
}

export interface EvidenceCheckInput {
  name: string;
  conclusion?: string | null;
  summary?: string;
  detailsUrl?: string;
  logExcerpt?: string;
  failedTests?: string[];
}

export interface EvidencePrInput {
  repoKey: string;
  number: number;
  title: string;
  url: string;
  author?: string;
  body?: string;
  reviewState?: string;
  requestedReviewers?: string[];
  checkStatus?: string | null;
}

export interface EvidenceTicketInput {
  key: string;
  summary: string;
  url: string;
  status?: string;
  assignee?: string | null;
  acceptanceCriteria?: string;
  comments?: EvidenceCommentInput[];
}

export interface BuildEvidenceInput {
  pr?: EvidencePrInput;
  ticket?: EvidenceTicketInput;
  threads?: EvidenceThreadInput[];
  checks?: EvidenceCheckInput[];
}

export interface EvidenceBundle {
  items: EvidenceItem[];
  links: Record<string, string>;
}

function pushItem(
  items: EvidenceItem[],
  links: Record<string, string>,
  id: string,
  kind: EvidenceKind,
  label: string,
  text: string,
  url?: string,
): void {
  const item: EvidenceItem = { id, kind, label, text };
  if (url) {
    item.url = url;
    links[id] = url;
  }
  items.push(item);
}

function isOpenThread(thread: EvidenceThreadInput): boolean {
  return thread.is_resolved !== true && thread.is_outdated !== true;
}

function formatThreadText(thread: EvidenceThreadInput): string {
  const locationParts = [
    thread.path ? `file ${thread.path}` : null,
    typeof thread.line === 'number' ? `line ${thread.line}` : null,
  ].filter(Boolean);
  const location = locationParts.length > 0 ? ` (${locationParts.join(', ')})` : '';
  const comments = (thread.comments ?? [])
    .map((comment) => `${comment.author}: ${comment.body}`)
    .join('\n');
  return `Review thread${location}\n${comments}`.trim();
}

function formatCheckText(check: EvidenceCheckInput): string {
  const parts = [
    `Check "${check.name}"`,
    check.conclusion ? `conclusion ${check.conclusion}` : null,
    check.summary?.trim() ? `summary: ${check.summary.trim()}` : null,
  ].filter(Boolean);

  const lines = [parts.join(', ')];
  if (check.failedTests?.length) {
    lines.push(`Failed tests: ${check.failedTests.join(', ')}`);
  }
  if (check.logExcerpt?.trim()) {
    lines.push('Log excerpt:', check.logExcerpt.trim());
  }
  return lines.join('\n');
}

export function buildEvidence(input: BuildEvidenceInput): EvidenceBundle {
  const items: EvidenceItem[] = [];
  const links: Record<string, string> = {};

  if (input.pr) {
    const pr = input.pr;
    const facts = [
      `${pr.repoKey}#${pr.number} "${pr.title}"`,
      pr.author ? `author ${pr.author}` : null,
      pr.reviewState ? `review ${pr.reviewState}` : null,
      pr.checkStatus ? `checks ${pr.checkStatus}` : null,
      pr.requestedReviewers?.length
        ? `requested reviewers: ${pr.requestedReviewers.join(', ')}`
        : null,
      pr.body?.trim() ? `description:\n${pr.body.trim()}` : null,
    ].filter(Boolean);
    pushItem(items, links, 'pr', 'pr', `${pr.repoKey}#${pr.number}`, facts.join('\n'), pr.url);
  }

  if (input.ticket) {
    const ticket = input.ticket;
    if (ticket.acceptanceCriteria?.trim()) {
      pushItem(
        items,
        links,
        'ac',
        'acceptance',
        `Acceptance criteria for ${ticket.key}`,
        ticket.acceptanceCriteria.trim(),
        ticket.url,
      );
    }

    let ticketCommentIndex = 1;
    for (const comment of ticket.comments ?? []) {
      const id = `t${ticketCommentIndex}`;
      ticketCommentIndex += 1;
      pushItem(
        items,
        links,
        id,
        'comment',
        `${ticket.key} comment by ${comment.author}`,
        comment.body,
        comment.url ?? ticket.url,
      );
    }
  }

  let threadIndex = 1;
  for (const thread of input.threads ?? []) {
    if (!isOpenThread(thread)) {
      continue;
    }
    const id = `c${threadIndex}`;
    threadIndex += 1;
    const firstComment = thread.comments[0];
    const label = firstComment
      ? `Review thread by ${firstComment.author}`
      : 'Review thread';
    const url = thread.url ?? firstComment?.url;
    pushItem(items, links, id, 'thread', label, formatThreadText(thread), url);
  }

  for (const check of input.checks ?? []) {
    const name = check.name.trim();
    if (!name) {
      continue;
    }
    const id = `check:${name}`;
    const kind: EvidenceKind = check.logExcerpt?.trim() ? 'log' : 'check';
    pushItem(items, links, id, kind, `Check ${name}`, formatCheckText(check), check.detailsUrl);
  }

  return { items, links };
}

export function evidenceIds(bundle: EvidenceBundle): string[] {
  return bundle.items.map((item) => item.id);
}

export function evidenceText(bundle: EvidenceBundle): string {
  return bundle.items
    .map((item) => `[${item.id}] ${item.label}\n${item.text}`)
    .join('\n\n');
}
