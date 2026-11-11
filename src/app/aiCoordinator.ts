import * as vscode from 'vscode';
import { AiAssistant, AiUnavailableError, type AiResult } from '../services/ai/aiAssistant';
import { modelLabel, pickDefaultModel, sortModelsForPicker, type AiProvider, type ChatModelInfo } from '../services/ai/aiSettings';
import { buildStandupSnapshot } from '../services/ai/standupSnapshot';
import { itemTitle } from '../services/attention/notificationPlanner';
import { AiConfigStore } from '../infrastructure/ai/aiConfigStore';
import { LanguageModelClient } from '../infrastructure/ai/languageModelClient';
import type { AiRunKind, AiRunState, AiViewState, SessionCommand } from '../shared/messages';
import type { AiCommandHandler, DashboardSession, SessionSurface } from './dashboardSession';

const STREAM_THROTTLE_MS = 120;

export interface AiUiHooks {
  /** Reveal the dashboard (AI results for "what next" / "explain" render there). */
  revealDashboard(): void;
  /** Reveal the sidebar Setup tab. */
  revealSetup(): void;
}

/**
 * Runs DevMate's AI use-cases against the shared session: owns the AI view state that the
 * dashboard renders, progress/cancellation, and the model picker for Setup.
 */
export class AiCoordinator implements AiCommandHandler, vscode.Disposable {
  private readonly assistant: AiAssistant;
  private models: ChatModelInfo[] | null = null;
  private modelsLoading = false;
  private run: AiRunState | null = null;
  private runCounter = 0;
  private cancellation: vscode.CancellationTokenSource | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly session: DashboardSession,
    private readonly config: AiConfigStore,
    private readonly client: LanguageModelClient,
    private readonly hooks: AiUiHooks,
  ) {
    this.assistant = new AiAssistant(client, () => config.read());
    this.disposables.push(
      LanguageModelClient.onDidChangeModels(() => {
        // Only re-list once the user has asked for the list (model access is user-initiated).
        if (this.models !== null) void this.loadModels();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (AiConfigStore.affects(event)) this.publish();
      }),
    );
  }

  // ── AiCommandHandler ────────────────────────────────────────────────────

  async handleCommand(message: SessionCommand): Promise<void> {
    switch (message.command) {
      case 'ai.whatNext':
        return this.whatShouldIDoNext();
      case 'ai.explain':
        return this.explain(message.key);
      case 'ai.standup':
        return this.standup();
      case 'ai.cancel':
        this.cancellation?.cancel();
        return;
      case 'ai.dismiss':
        this.cancellation?.cancel();
        this.run = null;
        this.publish();
        return;
      case 'ai.copy':
        if (this.run?.text) {
          await vscode.env.clipboard.writeText(this.run.text);
          void vscode.window.setStatusBarMessage('$(check) DevMate: Copied to clipboard', 2500);
        }
        return;
      case 'ai.setProvider':
        await this.config.setProvider(message.provider === 'vscodeLm' ? 'vscodeLm' : 'none');
        if (message.provider === 'vscodeLm') await this.loadModels();
        this.publish();
        return;
      case 'ai.setModel':
        if (this.models?.some((model) => model.id === message.modelId)) {
          await this.config.setModel(message.modelId);
          this.publish();
        }
        return;
      case 'ai.loadModels':
        return this.loadModels();
    }
  }

  replay(surface: SessionSurface): void {
    void surface.postMessage({ command: 'ai.state', state: this.viewState() });
  }

  selectedModelName(): string | null {
    const model = this.models ? pickDefaultModel(this.models, this.config.getModel()) : undefined;
    return model ? modelLabel(model) : null;
  }

  // ── Use-cases ───────────────────────────────────────────────────────────

  async whatShouldIDoNext(): Promise<void> {
    this.hooks.revealDashboard();
    await this.ensureData();
    const items = this.session.getInbox().items ?? [];
    const github = this.session.getGitHubState();
    const jira = this.session.getJiraState();
    await this.execute('whatNext', 'What should I do next?', (token, onText) =>
      this.assistant.whatShouldIDoNext(items, { github: github?.me ?? null, jira: jira?.currentUser ?? null }, Date.now(), { token, onText }));
  }

  async explain(key: string): Promise<void> {
    const item = this.session.findItem(key);
    if (!item) {
      void vscode.window.showInformationMessage('DevMate: That item is no longer in your inbox.');
      return;
    }
    this.hooks.revealDashboard();
    await this.execute('explain', `Explain: ${itemTitle(item)}`, (token, onText) =>
      this.assistant.explainItem(item, Date.now(), { token, onText }));
  }

  async standup(): Promise<void> {
    if (!(await this.ensureEnabled())) return;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'DevMate: Writing your standup summary…', cancellable: true },
      async (_progress, token) => {
        await this.ensureData();
        const snapshot = buildStandupSnapshot(
          this.session.getGitHubState(),
          this.session.getJiraState(),
          this.session.getInbox().items ?? [],
        );
        try {
          const result = await this.assistant.standupSummary(snapshot, Date.now(), { token });
          const header = `# Standup — ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}\n\n`;
          const footer = `\n\n---\n_Generated by DevMate Kit with ${modelLabel(result.model)}. Review before sharing._\n`;
          const markdown = header + result.text + footer;
          const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown });
          await vscode.window.showTextDocument(document, { preview: false });
          const choice = await vscode.window.showInformationMessage('DevMate: Standup summary ready.', 'Copy to clipboard');
          if (choice) {
            await vscode.env.clipboard.writeText(result.text);
            void vscode.window.setStatusBarMessage('$(check) DevMate: Standup copied', 2500);
          }
        } catch (error) {
          if (!token.isCancellationRequested) this.showAiError(error);
        }
      },
    );
  }

  /** Quick-pick model selection (command palette). */
  async pickModel(): Promise<void> {
    if (this.config.getProvider() === 'none') {
      const enable = await vscode.window.showInformationMessage(
        'DevMate: AI is off. Turn it on to use models from this editor?', 'Turn on AI');
      if (!enable) return;
      await this.config.setProvider('vscodeLm');
    }
    await this.loadModels();
    const models = this.models ?? [];
    if (models.length === 0) {
      void vscode.window.showWarningMessage(`DevMate: ${noModelsMessage()}`);
      return;
    }
    const current = pickDefaultModel(models, this.config.getModel());
    const picked = await vscode.window.showQuickPick(
      models.map((model) => ({
        label: model.name || model.id,
        description: model.vendor === 'copilot' ? 'GitHub Copilot' : model.vendor,
        detail: model.id === current?.id ? 'Currently selected' : undefined,
        model,
      })),
      { title: 'DevMate Kit: AI model', placeHolder: 'Models available in this editor' },
    );
    if (picked) {
      await this.config.setModel(picked.model.id);
      this.publish();
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async execute(
    kind: AiRunKind,
    title: string,
    work: (token: vscode.CancellationToken, onText: (chunk: string) => void) => Promise<AiResult>,
  ): Promise<void> {
    this.cancellation?.cancel();
    this.cancellation?.dispose();
    const source = new vscode.CancellationTokenSource();
    this.cancellation = source;
    const id = ++this.runCounter;
    this.run = { id, kind, title, status: 'running', text: '' };
    this.publish();

    let lastPublish = 0;
    const onText = (chunk: string): void => {
      if (!this.run || this.run.id !== id) return;
      this.run = { ...this.run, text: this.run.text + chunk };
      const now = Date.now();
      if (now - lastPublish > STREAM_THROTTLE_MS) {
        lastPublish = now;
        this.publish();
      }
    };

    try {
      const result = await work(source.token, onText);
      if (this.run?.id !== id) return;
      this.run = { ...this.run, status: 'done', text: result.text, modelName: modelLabel(result.model) };
    } catch (error) {
      if (this.run?.id !== id) return;
      if (source.token.isCancellationRequested || error instanceof vscode.CancellationError) {
        this.run = { ...this.run, status: 'cancelled' };
      } else {
        this.run = {
          ...this.run,
          status: 'error',
          error: errorMessage(error),
          setupHint: error instanceof AiUnavailableError,
        };
      }
    } finally {
      if (this.cancellation === source) this.cancellation = undefined;
      source.dispose();
      this.publish();
    }
  }

  private async ensureEnabled(): Promise<boolean> {
    if (this.config.getProvider() !== 'none') return true;
    const choice = await vscode.window.showInformationMessage(
      'DevMate: AI is off. It uses the language models already available in this editor (for example GitHub Copilot).',
      'Turn on AI',
      'Open Setup',
    );
    if (choice === 'Turn on AI') {
      await this.config.setProvider('vscodeLm');
      return true;
    }
    if (choice === 'Open Setup') this.hooks.revealSetup();
    return false;
  }

  private async ensureData(): Promise<void> {
    if (!this.session.hasData()) await this.session.refreshAll({ notify: false });
  }

  private async loadModels(): Promise<void> {
    this.modelsLoading = true;
    this.publish();
    try {
      this.models = sortModelsForPicker(await this.client.listModels());
    } finally {
      this.modelsLoading = false;
      this.publish();
    }
  }

  private showAiError(error: unknown): void {
    if (error instanceof AiUnavailableError) {
      void vscode.window.showWarningMessage(`DevMate: ${error.message}`, 'Open Setup').then((choice) => {
        if (choice) this.hooks.revealSetup();
      });
      return;
    }
    void vscode.window.showErrorMessage(`DevMate: ${errorMessage(error)}`);
  }

  private viewState(): AiViewState {
    const provider: AiProvider = this.config.getProvider();
    const selected = this.models ? pickDefaultModel(this.models, this.config.getModel()) : undefined;
    return {
      provider,
      supported: LanguageModelClient.isSupported(),
      selectedModelId: selected?.id ?? this.config.getModel() ?? null,
      models: this.models,
      modelsLoading: this.modelsLoading,
      run: this.run,
    };
  }

  private publish(): void {
    this.session.broadcast({ command: 'ai.state', state: this.viewState() });
  }

  dispose(): void {
    this.cancellation?.cancel();
    this.cancellation?.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

function noModelsMessage(): string {
  return LanguageModelClient.isSupported()
    ? 'No language models are available in this editor. Install or sign in to GitHub Copilot Chat (or another language-model provider), then try again.'
    : 'This editor does not expose a language-model API, so AI features are unavailable here.';
}

function errorMessage(error: unknown): string {
  if (error instanceof AiUnavailableError && error.reason === 'noModels' && !LanguageModelClient.isSupported()) {
    return noModelsMessage();
  }
  return error instanceof Error && error.message ? error.message : 'The AI request failed.';
}
