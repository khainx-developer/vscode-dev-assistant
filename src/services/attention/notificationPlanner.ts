import type { AttentionInboxItem } from './attentionInboxBuilder';
import { reasonLabel } from './reasonLabels';
import { snoozeKeyFor } from './snooze';

/** Snooze-style key -> epoch ms the item was last seen in the inbox. */
export type KnownItems = Record<string, number>;

/**
 * How long an item is remembered after it leaves the inbox. A provider that fails one refresh
 * and recovers on the next would otherwise make every one of its items "new" again.
 */
export const KNOWN_ITEM_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export interface NotificationPlan {
  newItems: AttentionInboxItem[];
  nextKnown: KnownItems;
}

/**
 * Decide which inbox items are new since the last refresh.
 * `known === null` means there is no baseline yet (first run ever): remember everything and
 * notify about nothing, so installing the extension does not fire a burst of toasts.
 */
export function planNotifications(
  known: KnownItems | null,
  items: AttentionInboxItem[],
  now: number,
): NotificationPlan {
  const nextKnown: KnownItems = {};
  if (known) {
    for (const [key, seenAt] of Object.entries(known)) {
      if (now - seenAt < KNOWN_ITEM_RETENTION_MS) nextKnown[key] = seenAt;
    }
  }

  const newItems: AttentionInboxItem[] = [];
  for (const item of items) {
    const key = snoozeKeyFor(item);
    if (known && nextKnown[key] === undefined) newItems.push(item);
    nextKnown[key] = now;
  }
  return { newItems, nextKnown };
}

export function itemTitle(item: AttentionInboxItem): string {
  if (item.jiraTask) return `${item.jiraTask.key} ${item.jiraTask.summary}`;
  if (item.pr) return `#${item.pr.number} ${item.pr.title}`;
  return 'Attention item';
}

export function itemUrl(item: AttentionInboxItem): string | undefined {
  return item.jiraTask?.url ?? item.pr?.url;
}

/** Toast copy: one item names itself; several are batched into a single message. */
export function notificationMessage(newItems: AttentionInboxItem[]): string | null {
  if (newItems.length === 0) return null;
  if (newItems.length === 1) {
    const item = newItems[0];
    const reason = item.reasons[0] ? reasonLabel(item.reasons[0]).label : 'Needs attention';
    return `DevMate: ${reason} — ${truncate(itemTitle(item), 80)}`;
  }
  return `DevMate: ${newItems.length} items need your attention.`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
