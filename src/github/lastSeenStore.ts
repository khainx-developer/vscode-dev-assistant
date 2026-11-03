import * as vscode from 'vscode';

const STORAGE_KEY = 'devMateKit.github.lastSeen';

export function prKey(repoKey: string, number: number): string {
  return `${repoKey}#${number}`;
}

export class LastSeenStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private readAll(): Record<string, number> {
    return this.context.globalState.get<Record<string, number>>(STORAGE_KEY, {});
  }

  get(key: string): number | undefined {
    return this.readAll()[key];
  }

  markSeen(key: string, at: number = Date.now()): void {
    const record = this.readAll();
    record[key] = at;
    void this.context.globalState.update(STORAGE_KEY, record);
  }

  ensureBaseline(key: string): void {
    if (this.get(key) === undefined) {
      this.markSeen(key);
    }
  }

  getAll(): Map<string, number> {
    return new Map(Object.entries(this.readAll()));
  }
}
