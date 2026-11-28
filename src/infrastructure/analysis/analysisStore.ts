import type * as vscode from 'vscode';
import type { Analysis } from '../../services/analysis/types';
import type { AnalysisView } from '../../shared/messages';

const STORAGE_KEY = 'devMateKit.analysis.cache.v3';
const MAX_ENTRIES = 200;
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredEntry {
  analysis: Analysis;
  view?: AnalysisView;
  storedAt: number;
}

interface StoreRecord {
  version: 3;
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

function isStoredEntry(value: unknown): value is StoredEntry {
  if (!isRecord(value)) return false;
  if (typeof value.storedAt !== 'number' || !Number.isFinite(value.storedAt)) return false;
  if (!isAnalysis(value.analysis)) return false;
  if (value.view !== undefined && !isAnalysisView(value.view)) return false;
  return true;
}

function readRecord(raw: unknown): StoreRecord {
  if (!isRecord(raw) || raw.version !== 3 || !isRecord(raw.entries)) {
    return { version: 3, entries: {} };
  }
  const entries: Record<string, StoredEntry> = {};
  for (const [key, value] of Object.entries(raw.entries)) {
    if (isStoredEntry(value)) {
      entries[key] = value;
    }
  }
  return { version: 3, entries };
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

  async set(itemKey: string, analysis: Analysis): Promise<void> {
    const now = this.now();
    const record = this.prune(this.read());
    record.entries[itemKey] = { analysis, storedAt: now };
    this.enforceCap(record);
    await this.memento.update(STORAGE_KEY, record);
  }

  async setView(itemKey: string, stateHash: string, view: AnalysisView): Promise<void> {
    const record = this.prune(this.read());
    const entry = record.entries[itemKey];
    if (!entry || entry.analysis.stateHash !== stateHash) return;
    entry.view = view;
    await this.memento.update(STORAGE_KEY, record);
  }

  async clear(): Promise<void> {
    await this.memento.update(STORAGE_KEY, { version: 3, entries: {} });
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
    return { version: 3, entries };
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
