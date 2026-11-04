import * as vscode from 'vscode';

const STORAGE_KEY = 'devMateKit.comments.readState.v1';

interface CommentReadStateRecord {
  version: 1;
  sources: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCommentReadStateRecord(value: unknown): value is CommentReadStateRecord {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.sources)) {
    return false;
  }

  return Object.values(value.sources).every(
    (timestamp) => typeof timestamp === 'number' && Number.isFinite(timestamp),
  );
}

export class CommentReadStateStore {
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async getSeenAt(sourceKey: string): Promise<number | undefined> {
    await this.updateQueue;
    return this.readState().sources[sourceKey];
  }

  ensureBaseline(sourceKey: string, at: number): Promise<void> {
    return this.serializeUpdate((sources) => {
      if (sources[sourceKey] !== undefined) {
        return undefined;
      }

      return { ...sources, [sourceKey]: at };
    });
  }

  markSeen(sourceKey: string, at: number): Promise<void> {
    return this.serializeUpdate((sources) => ({ ...sources, [sourceKey]: at }));
  }

  reconcileSources(activeSourceKeys: Set<string>, complete: boolean): Promise<void> {
    if (!complete) {
      return Promise.resolve();
    }

    return this.serializeUpdate((sources) =>
      Object.fromEntries(
        Object.entries(sources).filter(([sourceKey]) => activeSourceKeys.has(sourceKey)),
      ),
    );
  }

  private readState(): CommentReadStateRecord {
    const stored = this.context.globalState.get<unknown>(STORAGE_KEY);
    if (stored === undefined) {
      return { version: 1, sources: {} };
    }
    if (!isCommentReadStateRecord(stored)) {
      throw new Error(`Invalid comment read-state data in globalState key "${STORAGE_KEY}".`);
    }

    return { version: 1, sources: { ...stored.sources } };
  }

  private serializeUpdate(
    update: (sources: Record<string, number>) => Record<string, number> | undefined,
  ): Promise<void> {
    const write = async (): Promise<void> => {
      const state = this.readState();
      const sources = update(state.sources);
      if (sources === undefined) {
        return;
      }

      const nextState: CommentReadStateRecord = {
        version: 1,
        sources,
      };
      await this.context.globalState.update(STORAGE_KEY, nextState);
    };

    const operation = this.updateQueue.then(write, write);
    this.updateQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
