import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import type { AnalysisActionView, AnalysisSnapshotEntry } from '../../shared/messages';
import type { ActionKind } from './types';

/** Kind sort order for the Action Center list (lower index = earlier). */
export const NEXT_ACTION_KIND_ORDER: readonly ActionKind[] = [
  'fix-ci',
  'code-change',
  'answer-question',
  'reply',
  'review-context',
  'decide',
  'follow-up',
];

export const NEXT_ACTIONS_DEFAULT_LIMIT = 8;

const KIND_RANK = new Map<string, number>(
  NEXT_ACTION_KIND_ORDER.map((kind, index) => [kind, index]),
);

export interface NextActionRow {
  itemKey: string;
  /** Short ticket/PR id shown next to the title (e.g. WEB-123 or acme/web#42). */
  itemDisplayKey: string;
  itemTitle: string;
  itemPriority: number;
  latestRelevantAt: string | null;
  /** Index of the action in the analysis.actions array (for Copy prompt / draft). */
  actionIndex: number;
  actionKey: string;
  kind: ActionKind;
  title: string;
  link?: string;
  openLabel?: string;
  handoffPrompt?: string;
  /** Engine track status after filtering: open or progress (done/dropped excluded). */
  status: 'open' | 'progress';
}

export interface BuildNextActionsInput {
  items: readonly AttentionInboxItem[];
  /** Per-item analysis snapshot (ready/stale); missing keys are ignored. */
  analysisByKey: Readonly<Record<string, AnalysisSnapshotEntry | undefined>>;
}

function itemDisplayKey(item: AttentionInboxItem): string {
  if (item.jiraTask) return item.jiraTask.key;
  if (item.pr) return `${item.pr.repoKey}#${item.pr.number}`;
  return item.key;
}

function itemTitle(item: AttentionInboxItem): string {
  if (item.jiraTask) return item.jiraTask.summary;
  if (item.pr) return item.pr.title;
  return 'Attention item';
}

function kindRank(kind: string): number {
  return KIND_RANK.get(kind) ?? NEXT_ACTION_KIND_ORDER.length;
}

function recencyMs(value: string | null): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function isOpenTrackStatus(status: string | undefined): status is 'open' | 'progress' {
  return status === 'open' || status === 'progress' || status === undefined;
}

/**
 * Flat list of open actions across ready analyses only (not stale/done/dropped/none).
 * Sorted by item priority, then kind order, then item recency (newest first).
 */
export function buildNextActions(input: BuildNextActionsInput): NextActionRow[] {
  const rows: NextActionRow[] = [];

  for (const item of input.items) {
    const entry = input.analysisByKey[item.key];
    if (!entry || entry.status !== 'ready' || !entry.analysis) {
      continue;
    }

    const actionStatus = entry.actionStatus ?? {};
    entry.analysis.actions.forEach((action: AnalysisActionView, actionIndex: number) => {
      if (action.kind === 'none') return;
      const status = actionStatus[action.actionKey] ?? 'open';
      if (status === 'done' || status === 'dropped') return;
      if (!isOpenTrackStatus(status)) return;

      rows.push({
        itemKey: item.key,
        itemDisplayKey: itemDisplayKey(item),
        itemTitle: itemTitle(item),
        itemPriority: item.priority,
        latestRelevantAt: item.latestRelevantAt,
        actionIndex,
        actionKey: action.actionKey,
        kind: action.kind,
        title: action.title,
        link: action.link,
        openLabel: action.openLabel,
        handoffPrompt: action.handoffPrompt,
        status,
      });
    });
  }

  rows.sort((a, b) => {
    if (a.itemPriority !== b.itemPriority) {
      return a.itemPriority - b.itemPriority;
    }
    const kindDiff = kindRank(a.kind) - kindRank(b.kind);
    if (kindDiff !== 0) return kindDiff;
    return recencyMs(b.latestRelevantAt) - recencyMs(a.latestRelevantAt);
  });

  return rows;
}

/** Cap the list for the default view; full length is available via Show all. */
export function limitNextActions(
  rows: readonly NextActionRow[],
  limit: number = NEXT_ACTIONS_DEFAULT_LIMIT,
): { visible: NextActionRow[]; total: number; truncated: boolean } {
  const cap = Math.max(0, Math.floor(limit));
  const total = rows.length;
  if (total <= cap) {
    return { visible: [...rows], total, truncated: false };
  }
  return { visible: rows.slice(0, cap), total, truncated: true };
}
