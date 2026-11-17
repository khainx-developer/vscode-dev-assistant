import * as vscode from 'vscode';

export const REFRESH_INTERVAL_MINUTES = 10;
export const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_MINUTES * 60 * 1000;

export interface RefreshVisibilityHost {
  readonly visible: boolean;
  readonly onDidChangeVisibility: vscode.Event<void>;
}

export class RefreshScheduler {
  private intervalHandle: ReturnType<typeof setInterval> | undefined;
  private readonly visibilitySubscription: vscode.Disposable;

  constructor(view: RefreshVisibilityHost, private readonly onRefresh: () => Promise<void>) {
    this.visibilitySubscription = view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.handleBecameVisible();
      } else {
        this.pauseTimer();
      }
    });
    if (view.visible) {
      void this.handleBecameVisible();
    }
  }

  private async handleBecameVisible(): Promise<void> {
    await this.onRefresh();
    this.startTimer();
  }

  private startTimer(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => void this.onRefresh(), REFRESH_INTERVAL_MS);
  }

  private pauseTimer(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  async triggerManualRefresh(): Promise<void> {
    await this.onRefresh();
  }

  dispose(): void {
    this.pauseTimer();
    this.visibilitySubscription.dispose();
  }
}
