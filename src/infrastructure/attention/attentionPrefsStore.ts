import type * as vscode from 'vscode';
import { pruneExpiredSnoozes, type SnoozeMap } from '../../services/attention/snooze';
import type { KnownItems } from '../../services/attention/notificationPlanner';

const SNOOZE_KEY = 'devMateKit.attention.snoozes';
const KNOWN_ITEMS_KEY = 'devMateKit.attention.knownItems';

/** Per-user attention preferences kept in extension globalState (survive reloads, not synced). */
export class AttentionPrefsStore {
  constructor(private readonly memento: Pick<vscode.Memento, 'get' | 'update'>) {}

  getSnoozes(now: number): SnoozeMap {
    const stored = this.memento.get<SnoozeMap>(SNOOZE_KEY, {});
    return pruneExpiredSnoozes(isRecord(stored) ? stored : {}, now);
  }

  async snooze(key: string, until: number, now: number): Promise<void> {
    await this.memento.update(SNOOZE_KEY, { ...this.getSnoozes(now), [key]: until });
  }

  async unsnooze(key: string, now: number): Promise<void> {
    const next = this.getSnoozes(now);
    delete next[key];
    await this.memento.update(SNOOZE_KEY, next);
  }

  /** `null` until the first refresh has been baselined. */
  getKnownItems(): KnownItems | null {
    const stored = this.memento.get<KnownItems | undefined>(KNOWN_ITEMS_KEY, undefined);
    return isRecord(stored) ? stored : null;
  }

  async setKnownItems(items: KnownItems): Promise<void> {
    await this.memento.update(KNOWN_ITEMS_KEY, items);
  }
}

function isRecord(value: unknown): value is Record<string, number> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
