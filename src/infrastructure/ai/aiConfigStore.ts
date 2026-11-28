import * as vscode from 'vscode';
import { normalizeAiProvider, type AiProvider } from '../../services/ai/aiSettings';
import type { AiSettingsSnapshot } from '../../services/ai/aiAssistant';

const SECTION = 'devMateKit.ai';

/**
 * Reads/writes `devMateKit.ai.*`. The legacy provider value `githubCopilot` is still read (as
 * `vscodeLm`); any write uses the new value, so settings migrate the first time the user touches them.
 */
export class AiConfigStore {
  read(): AiSettingsSnapshot {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    const model = cfg.get<string>('model', '').trim();
    return { provider: cfg.get<string>('provider', 'none'), model: model || undefined };
  }

  getProvider(): AiProvider {
    return normalizeAiProvider(this.read().provider);
  }

  getModel(): string | undefined {
    return this.read().model;
  }

  /** Custom editor-chat hand-off template; empty means use the built-in default. */
  getReviewPrompt(): string | undefined {
    const value = vscode.workspace.getConfiguration(SECTION).get<string>('reviewPrompt', '').trim();
    return value || undefined;
  }

  /** Auto-analyze after refresh (Phase 2). Default true when AI is on. */
  getAnalysisAuto(): boolean {
    return vscode.workspace.getConfiguration(SECTION).get<boolean>('analysis.auto', true);
  }

  /** Cap on automatic analyses per refresh (Phase 2). */
  getAnalysisMaxAutoPerRefresh(): number {
    const value = vscode.workspace.getConfiguration(SECTION).get<number>('analysis.maxAutoPerRefresh', 3);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 3;
  }

  /** Prefer failed-job log tails for CI analysis when the GitHub connection exposes them. */
  getAnalysisIncludeCiLogs(): boolean {
    return vscode.workspace.getConfiguration(SECTION).get<boolean>('analysis.includeCiLogs', true);
  }

  async setProvider(provider: AiProvider): Promise<void> {
    await vscode.workspace.getConfiguration(SECTION).update('provider', provider, vscode.ConfigurationTarget.Global);
  }

  async setModel(modelId: string): Promise<void> {
    await vscode.workspace.getConfiguration(SECTION).update('model', modelId, vscode.ConfigurationTarget.Global);
  }

  static affects(event: vscode.ConfigurationChangeEvent): boolean {
    return event.affectsConfiguration(SECTION);
  }
}
