import { buildActionKey } from '../services/analysis/actionKey';
import type { EvidenceBundle } from '../services/analysis/evidence';
import { buildHandoffPrompt } from '../services/analysis/handoff';
import type { ActionKind, Analysis, EvidenceItem, ProposedAction } from '../services/analysis/types';
import type { AnalysisActionView, AnalysisView } from '../shared/messages';

function isJiraUrl(link: string): boolean {
  return /atlassian\.net|\/browse\//i.test(link);
}

function openLabelForLink(link: string): string {
  return isJiraUrl(link) ? 'Open in Jira' : 'Open PR';
}

function openLabelFor(kind: ActionKind, link: string | undefined): string | undefined {
  switch (kind) {
    case 'answer-question':
    case 'reply':
      return 'Open comment';
    case 'fix-ci':
      return 'Open check';
    case 'follow-up':
      return 'Open in Jira';
    case 'review-context':
      return link ? openLabelForLink(link) : undefined;
    case 'decide':
      if (link) return openLabelForLink(link);
      return 'Open';
    default:
      return undefined;
  }
}

function wantsHandoff(kind: ActionKind): boolean {
  return kind === 'code-change' || kind === 'fix-ci' || kind === 'review-context';
}

function resolveLink(
  action: ProposedAction,
  links: Record<string, string>,
  fallbacks: { prUrl?: string; ticketUrl?: string },
): string | undefined {
  for (const id of action.evidence) {
    const url = links[id];
    if (url) return url;
  }

  if (action.kind === 'fix-ci') {
    const checkId = Object.keys(links).find((id) => id.startsWith('check:'));
    if (checkId && links[checkId]) return links[checkId];
    return fallbacks.prUrl;
  }

  if (action.kind === 'follow-up') {
    return fallbacks.ticketUrl || links.ac;
  }

  if (action.kind === 'review-context' || action.kind === 'code-change') {
    return links.pr || fallbacks.prUrl;
  }

  if (action.kind === 'decide') {
    return fallbacks.ticketUrl || links.ac || links.pr || fallbacks.prUrl;
  }

  return links.pr || fallbacks.prUrl || links.ac || fallbacks.ticketUrl;
}

function checkMeta(evidence: EvidenceItem[], action: ProposedAction): { name?: string; url?: string; excerpt?: string } {
  const checkItems = evidence.filter((item) => item.kind === 'check' || item.kind === 'log');
  const matched = checkItems.find((item) => action.evidence.includes(item.id)) || checkItems[0];
  if (!matched) return {};
  const name = matched.id.startsWith('check:') ? matched.id.slice('check:'.length) : matched.label;
  return {
    name,
    url: matched.url,
    excerpt: matched.kind === 'log' ? matched.text : undefined,
  };
}

function quotedComments(evidence: EvidenceItem[], action: ProposedAction): Array<{ author: string; body: string }> {
  const comments: Array<{ author: string; body: string }> = [];
  for (const id of action.evidence) {
    const item = evidence.find((entry) => entry.id === id);
    if (!item || (item.kind !== 'comment' && item.kind !== 'thread')) continue;
    const authorMatch = item.label.match(/\bby\s+(.+)$/i);
    comments.push({
      author: authorMatch?.[1]?.trim() || 'commenter',
      body: item.text,
    });
  }
  return comments;
}

function enrichAction(
  action: ProposedAction,
  evidence: EvidenceBundle,
  itemKey: string,
  fallbacks: { prUrl?: string; ticketUrl?: string },
): AnalysisActionView {
  const link = resolveLink(action, evidence.links, fallbacks);
  const openLabel = link ? openLabelFor(action.kind, link) : undefined;
  const check = checkMeta(evidence.items, action);
  const view: AnalysisActionView = {
    kind: action.kind,
    actionKey: buildActionKey(action.kind, action.evidence),
    title: action.title,
    detail: action.detail,
    findings: action.findings,
    draft: action.draft,
    checklist: action.checklist,
    link,
    openLabel,
  };

  if (wantsHandoff(action.kind)) {
    view.handoffPrompt = buildHandoffPrompt({
      action,
      itemKey,
      prUrl: evidence.links.pr || fallbacks.prUrl,
      ticketUrl: evidence.links.ac || fallbacks.ticketUrl,
      checkName: check.name,
      checkUrl: check.url || (action.kind === 'fix-ci' ? link : undefined),
      excerpt: check.excerpt,
      comments: quotedComments(evidence.items, action),
    });
  }

  return view;
}

export function toAnalysisView(
  analysis: Analysis,
  evidence: EvidenceBundle,
  fallbacks: { prUrl?: string; ticketUrl?: string } = {},
  analyzedAt: string = new Date().toISOString(),
): AnalysisView {
  return {
    itemKey: analysis.itemKey,
    stateHash: analysis.stateHash,
    situation: analysis.situation,
    confidence: analysis.confidence,
    analyzedAt,
    actions: analysis.actions.map((action) => enrichAction(action, evidence, analysis.itemKey, fallbacks)),
  };
}
