import type * as vscode from 'vscode';
import type { AnalysisStateSnapshot } from '../../services/analysis/stateHash';
import type { Analysis } from '../../services/analysis/types';
import type { AnalysisView } from '../../shared/messages';

const STORAGE_KEY = 'devMateKit.analysis.cache.v4';
const MARKS_KEY = 'devMateKit.analysis.manualDone.v1';
const MAX_ENTRIES = 200;
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface ManualDoneRecord {
  version: 1;
  /** `${itemKey}\n${actionKey}` → markedAt epoch ms */
  marks: Record<string, number>;
}

interface StoredEntry {
  analysis: Analysis;
  view?: AnalysisView;
  /** Inbox state the analysis was made for (done tracking). */
  stateSnapshot?: AnalysisStateSnapshot;
  storedAt: number;
}

interface StoreRecord {
  version: 4;
  entries: Record<string, StoredEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAnalysis(value: unknown): value is Analysis {
  if (!isRecord(value)) return false;
  return typeof value.itemKey === 'string'
    && typeof value.stateHash === 'string'
    && typeof value.situation === 'string'
    && typeof value.confidence === 'string'
    && Array.isArray(value.actions);
}

function isAnalysisView(value: unknown): value is AnalysisView {
  if (!isRecord(value)) return false;
  return typeof value.itemKey === 'string'
    && typeof value.stateHash === 'string'
    && typeof value.situation === 'string'
    && typeof value.confidence === 'string'
    && typeof value.analyzedAt === 'string'
    && Array.isArray(value.actions);
}

function isStateSnapshot(value: unknown): value is AnalysisStateSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.itemKey === 'string'
    && (value.headSha === null || typeof value.headSha === 'string')
    && Array.isArray(value.latestCommentIds)
    && typeof value.unresolvedThreadCount === 'number'
    && (value.reviewState === null || typeof value.reviewState === 'string')
    && isRecord(value.checkConclusions)
    && (value.jiraStatus === null || typeof value.jiraStatus === 'string');
}

function isStoredEntry(value: unknown): value is StoredEntry {
  if (!isRecord(value)) return false;
  if (typeof value.storedAt !== 'number' || !Number.isFinite(value.storedAt)) return false;
  if (!isAnalysis(value.analysis)) return false;
  if (value.view !== undefined && !isAnalysisView(value.view)) return false;
  if (value.stateSnapshot !== undefined && !isStateSnapshot(value.stateSnapshot)) return false;
  return true;
}

function readRecord(raw: unknown): StoreRecord {
  if (!isRecord(raw) || raw.version !== 4 || !isRecord(raw.entries)) {
    return { version: 4, entries: {} };
  }
  const entries: Record<string, StoredEntry> = {};
  for (const [key, value] of Object.entries(raw.entries)) {
    if (isStoredEntry(value)) {
      entries[key] = value;
    }
  }
  return { version: 4, entries };
}

export function manualDoneStorageKey(itemKey: string, actionKey: string): string {
  return `${itemKey}\n${actionKey}`;
}

/** Analysis cache in extension globalState: keyed by item + stateHash, 14-day TTL, max 200. */
export class AnalysisStore {
  constructor(
    private readonly memento: Pick<vscode.Memento, 'get' | 'update'>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(itemKey: string, stateHash: string): Analysis | undefined {
    const entry = this.lookup(itemKey, stateHash);
    return entry?.view ? entry.analysis : undefined;
  }

  getView(itemKey: string, stateHash: string): AnalysisView | undefined {
    const entry = this.lookup(itemKey, stateHash);
    return entry?.view;
  }

  /** Card-ready view for an item regardless of state hash (may be stale). */
  peekView(itemKey: string): AnalysisView | undefined {
    const record = this.prune(this.read());
    return record.entries[itemKey]?.view;
  }

  /** Analysed inbox snapshot stored next to the view, if present. */
  peekStateSnapshot(itemKey: string): AnalysisStateSnapshot | undefined {
    const record = this.prune(this.read());
    return record.entries[itemKey]?.stateSnapshot;
  }

  async set(itemKey: string, analysis: Analysis): Promise<void> {
    const now = this.now();
    const record = this.prune(this.read());
    record.entries[itemKey] = { analysis, storedAt: now };
    this.enforceCap(record);
    await this.memento.update(STORAGE_KEY, record);
  }

  async setView(
    itemKey: string,
    stateHash: string,
    view: AnalysisView,
    stateSnapshot?: AnalysisStateSnapshot,
  ): Promise<void> {
    const record = this.prune(this.read());
    const entry = record.entries[itemKey];
    if (!entry || entry.analysis.stateHash !== stateHash) return;
    entry.view = view;
    if (stateSnapshot) {
      entry.stateSnapshot = stateSnapshot;
    }
    await this.memento.update(STORAGE_KEY, record);
  }

  async clear(): Promise<void> {
    await this.memento.update(STORAGE_KEY, { version: 4, entries: {} });
    await this.memento.update(MARKS_KEY, { version: 1, marks: {} } satisfies ManualDoneRecord);
  }

  isManuallyDone(itemKey: string, actionKey: string): boolean {
    const marks = this.readMarks().marks;
    const markedAt = marks[manualDoneStorageKey(itemKey, actionKey)];
    return typeof markedAt === 'number' && markedAt >= this.now() - TTL_MS;
  }

  manualDoneActionKeys(itemKey: string): Set<string> {
    const cutoff = this.now() - TTL_MS;
    const prefix = `${itemKey}\n`;
    const keys = new Set<string>();
    for (const [storageKey, markedAt] of Object.entries(this.readMarks().marks)) {
      if (markedAt < cutoff) continue;
      if (!storageKey.startsWith(prefix)) continue;
      keys.add(storageKey.slice(prefix.length));
    }
    return keys;
  }

  async markDone(itemKey: string, actionKey: string): Promise<void> {
    const record = this.pruneMarks(this.readMarks());
    record.marks[manualDoneStorageKey(itemKey, actionKey)] = this.now();
    await this.memento.update(MARKS_KEY, record);
  }

  async unmarkDone(itemKey: string, actionKey: string): Promise<void> {
    const record = this.pruneMarks(this.readMarks());
    delete record.marks[manualDoneStorageKey(itemKey, actionKey)];
    await this.memento.update(MARKS_KEY, record);
  }

  private readMarks(): ManualDoneRecord {
    const raw = this.memento.get<unknown>(MARKS_KEY);
    if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.marks)) {
      return { version: 1, marks: {} };
    }
    const marks: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw.marks)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        marks[key] = value;
      }
    }
    return { version: 1, marks };
  }

  private pruneMarks(record: ManualDoneRecord): ManualDoneRecord {
    const cutoff = this.now() - TTL_MS;
    const marks: Record<string, number> = {};
    for (const [key, markedAt] of Object.entries(record.marks)) {
      if (markedAt >= cutoff) {
        marks[key] = markedAt;
      }
    }
    return { version: 1, marks };
  }

  private lookup(itemKey: string, stateHash: string): StoredEntry | undefined {
    const record = this.prune(this.read());
    const entry = record.entries[itemKey];
    if (!entry) return undefined;
    if (entry.analysis.stateHash !== stateHash) return undefined;
    return entry;
  }

  private read(): StoreRecord {
    return readRecord(this.memento.get<unknown>(STORAGE_KEY));
  }

  private prune(record: StoreRecord): StoreRecord {
    const cutoff = this.now() - TTL_MS;
    const entries: Record<string, StoredEntry> = {};
    for (const [key, entry] of Object.entries(record.entries)) {
      if (entry.storedAt >= cutoff) {
        entries[key] = entry;
      }
    }
    return { version: 4, entries };
  }

  private enforceCap(record: StoreRecord): void {
    const keys = Object.keys(record.entries);
    if (keys.length <= MAX_ENTRIES) return;
    const ordered = keys
      .map((key) => ({ key, storedAt: record.entries[key].storedAt }))
      .sort((a, b) => a.storedAt - b.storedAt);
    const drop = ordered.length - MAX_ENTRIES;
    for (let i = 0; i < drop; i += 1) {
      delete record.entries[ordered[i].key];
    }
  }
}
