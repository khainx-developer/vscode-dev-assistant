import type { AttentionInboxItem } from './attentionInboxBuilder';

export type SnoozeOption = '1h' | 'laterToday' | 'tomorrow';

export const SNOOZE_OPTIONS: ReadonlyArray<{ id: SnoozeOption; label: string }> = [
  { id: '1h', label: 'For 1 hour' },
  { id: 'laterToday', label: 'Until later today' },
  { id: 'tomorrow', label: 'Until tomorrow morning' },
];

/** Snooze key -> epoch ms when the snooze expires. */
export type SnoozeMap = Record<string, number>;

const HOUR_MS = 60 * 60 * 1000;
const LATER_TODAY_HOUR = 17;
const TOMORROW_HOUR = 9;

export function isSnoozeOption(value: unknown): value is SnoozeOption {
  return value === '1h' || value === 'laterToday' || value === 'tomorrow';
}

/**
 * When a snooze picked at `now` (local time) should end.
 * - 1h: exactly one hour.
 * - laterToday: 17:00 today, or 3 hours from now when it is already past 14:00.
 * - tomorrow: 09:00 tomorrow.
 */
export function computeSnoozeUntil(option: SnoozeOption, now: number): number {
  switch (option) {
    case '1h':
      return now + HOUR_MS;
    case 'laterToday': {
      const evening = new Date(now);
      evening.setHours(LATER_TODAY_HOUR, 0, 0, 0);
      return evening.getTime() - now >= 3 * HOUR_MS ? evening.getTime() : now + 3 * HOUR_MS;
    }
    case 'tomorrow': {
      const morning = new Date(now);
      morning.setDate(morning.getDate() + 1);
      morning.setHours(TOMORROW_HOUR, 0, 0, 0);
      return morning.getTime();
    }
  }
}

/**
 * Stable key for snoozing an inbox item. An item's full key changes when its linked PRs change
 * (`jira:…|github:…`), so snooze on the primary source only: the Jira ticket when present,
 * otherwise the pull request.
 */
export function snoozeKeyFor(item: Pick<AttentionInboxItem, 'key'>): string {
  return item.key.split('|')[0];
}

export function pruneExpiredSnoozes(snoozes: SnoozeMap, now: number): SnoozeMap {
  return Object.fromEntries(Object.entries(snoozes).filter(([, until]) => until > now));
}

export interface SnoozedInboxItem {
  item: AttentionInboxItem;
  snoozeKey: string;
  until: number;
}

export function partitionSnoozed(
  items: AttentionInboxItem[],
  snoozes: SnoozeMap,
  now: number,
): { active: AttentionInboxItem[]; snoozed: SnoozedInboxItem[] } {
  const active: AttentionInboxItem[] = [];
  const snoozed: SnoozedInboxItem[] = [];
  for (const item of items) {
    const snoozeKey = snoozeKeyFor(item);
    const until = snoozes[snoozeKey];
    if (until !== undefined && until > now) {
      snoozed.push({ item, snoozeKey, until });
    } else {
      active.push(item);
    }
  }
  return { active, snoozed };
}
