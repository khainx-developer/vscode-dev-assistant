import type * as vscode from 'vscode';
import type { Analysis } from '../../services/analysis/types';

const STORAGE_KEY = 'devMateKit.analysis.cache.v1';
const MAX_ENTRIES = 200;
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredEntry {
  analysis: Analysis;
  storedAt: number;
}

interface StoreRecord {
  version: 1;
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

function isStoredEntry(value: unknown): value is StoredEntry {
  if (!isRecord(value)) return false;
  return typeof value.storedAt === 'number'
    && Number.isFinite(value.storedAt)
    && isAnalysis(value.analysis);
}

function readRecord(raw: unknown): StoreRecord {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.entries)) {
    return { version: 1, entries: {} };
  }
  const entries: Record<string, StoredEntry> = {};
  for (const [key, value] of Object.entries(raw.entries)) {
    if (isStoredEntry(value)) {
      entries[key] = value;
    }
  }
  return { version: 1, entries };
}

/** Analysis cache in extension globalState: keyed by item + stateHash, 14-day TTL, max 200. */
export class AnalysisStore {
  constructor(
    private readonly memento: Pick<vscode.Memento, 'get' | 'update'>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(itemKey: string, stateHash: string): Analysis | undefined {
    const record = this.prune(this.read());
    const entry = record.entries[itemKey];
    if (!entry) return undefined;
    if (entry.analysis.stateHash !== stateHash) return undefined;
    return entry.analysis;
  }

  async set(itemKey: string, analysis: Analysis): Promise<void> {
    const now = this.now();
    const record = this.prune(this.read());
    record.entries[itemKey] = { analysis, storedAt: now };
    this.enforceCap(record);
    await this.memento.update(STORAGE_KEY, record);
  }

  async clear(): Promise<void> {
    await this.memento.update(STORAGE_KEY, { version: 1, entries: {} });
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
    return { version: 1, entries };
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
