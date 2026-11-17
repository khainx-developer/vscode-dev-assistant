import * as vscode from 'vscode';
import { AiAssistant, AiUnavailableError, type AiResult } from '../services/ai/aiAssistant';
import {
  cloneThreadsRecord,
  emptyThread,
  pruneThreadMap,
  toPromptHistory,
  trimStoredMessages,
} from '../services/ai/cardChat';
import {
  defaultAiProviderForHost,
  isCursorHost,
  modelLabel,
  pickDefaultModel,
  sortModelsForPicker,
  type AiProvider,
  type ChatModelInfo,
} from '../services/ai/aiSettings';
import { appendEditorHandoffTranscript, buildReviewPrompt } from '../services/ai/prompts';
import { buildStandupSnapshot } from '../services/ai/standupSnapshot';
import { AiConfigStore } from '../infrastructure/ai/aiConfigStore';
import { ChatHandoff } from '../infrastructure/ai/chatHandoff';
import { CursorCliClient } from '../infrastructure/ai/cursorCliClient';
import { LanguageModelClient } from '../infrastructure/ai/languageModelClient';
import type { AiCardThread, AiRunKind, AiRunState, AiViewState, SessionCommand } from '../shared/messages';
import type { AiCommandHandler, DashboardSession, SessionSurface } from './dashboardSession';

const STREAM_THROTTLE_MS = 120;

export interface AiUiHooks {
  /** Reveal the dashboard (inbox-wide AI results like "what next" render there). */
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
  private readonly threads = new Map<string, AiCardThread>();
  private chatKeyRunning: string | null = null;
  private cancellation: vscode.CancellationTokenSource | undefined;
  private cliAvailable = false;
  private cliAuthenticated = false;
  private cliStatusLoading = false;
  private modelsLoadGeneration = 0;
  private readonly chatHandoff: ChatHandoff;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly session: DashboardSession,
    private readonly config: AiConfigStore,
    private readonly vscodeLm: LanguageModelClient,
    private readonly cursorCli: CursorCliClient,
    private readonly hooks: AiUiHooks,
    chatHandoff?: ChatHandoff,
  ) {
    this.assistant = new AiAssistant(
      { vscodeLm, cursorCli },
      () => config.read(),
    );
    this.chatHandoff = chatHandoff ?? new ChatHandoff();
    this.disposables.push(
      LanguageModelClient.onDidChangeModels(() => {
        // Only re-list once the user has asked for the list (model access is user-initiated).
        if (this.models !== null && this.config.getProvider() === 'vscodeLm') void this.loadModels();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (AiConfigStore.affects(event)) {
          void this.ensureProviderFitsHost();
          if (isCursorHost(vscode.env.appName)) void this.refreshCliStatus();
          this.publish();
        }
      }),
    );
    void this.ensureProviderFitsHost().then(() => {
      if (isCursorHost(vscode.env.appName)) void this.refreshCliStatus();
      this.publish();
    });
  }

  // ── AiCommandHandler ────────────────────────────────────────────────────

  async handleCommand(message: SessionCommand): Promise<void> {
    switch (message.command) {
      case 'ai.whatNext':
        return this.whatShouldIDoNext();
      case 'ai.explain':
        return this.explain(message.key);
      case 'ai.reviewInChat':
        return this.reviewInChat(message.key, message.template);
      case 'ai.chat.send':
        return this.chatSend(message.key, message.text);
      case 'ai.chat.clear':
        return this.chatClear(message.key);
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
      case 'ai.setProvider': {
        let provider = normalizeProviderChoice(message.provider);
        // Cursor Agent CLI is only offered inside Cursor.
        if (provider === 'cursorCli' && !isCursorHost(vscode.env.appName)) provider = 'vscodeLm';
        const previous = this.config.getProvider();
        await this.config.setProvider(provider);
        if (previous !== provider) await this.config.setModel('');
        this.models = null;
        if (provider === 'vscodeLm' || provider === 'cursorCli') await this.loadModels();
        if (isCursorHost(vscode.env.appName)) await this.refreshCliStatus();
        this.publish();
        return;
      }
      case 'ai.setModel':
        if (this.config.getProvider() === 'cursorCli') {
          // CLI model ids are free-form; accept any non-empty id (stale ids are omitted at spawn).
          if (message.modelId.trim()) {
            await this.config.setModel(message.modelId.trim());
            this.publish();
          }
          return;
        }
        if (this.models?.some((model) => model.id === message.modelId)) {
          await this.config.setModel(message.modelId);
          this.publish();
        }
        return;
      case 'ai.loadModels':
        return this.loadModels();
      case 'ai.cliTerminal':
        return this.openCliTerminal(message.action);
    }
  }

  replay(surface: SessionSurface): void {
    void surface.postMessage({ command: 'ai.state', state: this.viewState() });
  }

  selectedModelName(): string | null {
    if (this.config.getProvider() === 'cursorCli') {
      const model = this.models ? pickDefaultModel(this.models, this.config.getModel()) : undefined;
      if (model) return modelLabel(model);
      const saved = this.config.getModel()?.trim();
      // Ignore leftover CLI help / usage text accidentally persisted as a model id.
      if (!saved || /--model|\/model\b|</.test(saved)) return null;
      return `${saved} · Cursor Agent CLI`;
    }
    const editorModels = this.models?.filter((model) => model.vendor !== 'cursor-cli') ?? null;
    const model = editorModels ? pickDefaultModel(editorModels, this.config.getModel()) : undefined;
    return model ? modelLabel(model) : null;
  }

  cliStatus(): { available: boolean; authenticated: boolean } {
    return { available: this.cliAvailable, authenticated: this.cliAuthenticated };
  }

  // ── Use-cases ───────────────────────────────────────────────────────────

  async whatShouldIDoNext(): Promise<void> {
    if (!this.ensureMonitoring()) return;
    this.hooks.revealDashboard();
    await this.ensureData();
    const items = this.session.getInbox().items ?? [];
    const github = this.session.getGitHubState();
    const jira = this.session.getJiraState();
    await this.execute('whatNext', 'What should I do next?', (token, onText) =>
      this.assistant.whatShouldIDoNext(items, { github: github?.me ?? null, jira: jira?.currentUser ?? null }, Date.now(), { token, onText }));
  }

  /** Explain is part of the per-card Ask AI chat — not the top-of-dashboard AI panel. */
  async explain(key: string): Promise<void> {
    if (this.run?.kind === 'explain') {
      this.run = null;
      this.publish();
    }
    await this.chatSend(key, 'Explain');
  }

  /** Copy an editor-chat hand-off prompt (MCP guidance + item URL + optional Ask AI transcript). Does not use AiAssistant. */
  async reviewInChat(key: string, template?: string): Promise<void> {
    if (!this.ensureMonitoring()) return;
    const item = this.session.findItem(key);
    if (!item) {
      void vscode.window.showInformationMessage('DevMate: That item is no longer in your inbox.');
      return;
    }
    const base = buildReviewPrompt(item, template ?? 'review', this.config.getReviewPrompt());
    const thread = this.threads.get(key);
    const prompt = appendEditorHandoffTranscript(base, thread?.messages);
    await this.chatHandoff.send(prompt);
  }

  /** Append a user question on a card thread and stream the assistant reply. */
  async chatSend(key: string, text: string): Promise<void> {
    if (!this.ensureMonitoring()) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const item = this.session.findItem(key);
    if (!item) {
      void vscode.window.showInformationMessage('DevMate: That item is no longer in your inbox.');
      return;
    }

    pruneThreadMap(this.threads, key);
    const thread = this.threads.get(key) ?? emptyThread(key);
    const withoutEmptyAssistant = thread.messages.filter(
      (message, index, all) => !(index === all.length - 1 && message.role === 'assistant' && message.text === ''),
    );
    thread.messages = trimStoredMessages([...withoutEmptyAssistant, { role: 'user', text: trimmed }]);
    thread.error = undefined;
    thread.setupHint = undefined;
    this.threads.set(key, thread);

    this.hooks.revealDashboard();
    const github = this.session.getGitHubState();
    const jira = this.session.getJiraState();
    const history = toPromptHistory(thread.messages);
    await this.executeChat(key, (token, onText) =>
      this.assistant.chatAboutItem(
        // Re-resolve the item at send time so the snapshot stays fresh if inbox refreshed mid-flight.
        this.session.findItem(key) ?? item,
        history,
        { github: github?.me ?? null, jira: jira?.currentUser ?? null },
        Date.now(),
        { token, onText },
      ));
  }

  /** Reset one card's chat thread. */
  chatClear(key: string): void {
    if (this.chatKeyRunning === key) {
      this.cancellation?.cancel();
      this.chatKeyRunning = null;
    }
    this.threads.delete(key);
    this.publish();
  }

  async standup(): Promise<void> {
    if (!this.ensureMonitoring()) return;
    if (!(await this.ensureEnabled())) return;

    // Keep the progress notification only for generation. Opening the doc / waiting on
    // "Copy to clipboard" must happen after withProgress returns, or the toast never closes.
    let result: AiResult | undefined;
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
          result = await this.assistant.standupSummary(snapshot, Date.now(), { token });
        } catch (error) {
          if (!token.isCancellationRequested) this.showAiError(error);
        }
      },
    );
    if (!result) return;

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
  }

  /** Quick-pick model selection (command palette). */
  async pickModel(): Promise<void> {
    if (this.config.getProvider() === 'none') {
      const defaultProvider = defaultAiProviderForHost(vscode.env.appName);
      const enable = await vscode.window.showInformationMessage(
        defaultProvider === 'cursorCli'
          ? 'DevMate: AI is off. Turn it on to use Cursor Agent CLI, or choose editor language models in Setup.'
          : isCursorHost(vscode.env.appName)
            ? 'DevMate: AI is off. Turn it on to use models from this editor, or choose Cursor Agent CLI in Setup.'
            : 'DevMate: AI is off. Turn it on to use language models from this editor (Setup).',
        'Turn on AI',
        'Open Setup',
      );
      if (enable === 'Open Setup') {
        this.hooks.revealSetup();
        return;
      }
      if (!enable) return;
      await this.config.setProvider(defaultProvider);
    }
    await this.loadModels();
    const models = this.models ?? [];
    if (models.length === 0) {
      void vscode.window.showWarningMessage(`DevMate: ${noModelsMessage(this.config.getProvider())}`);
      return;
    }
    const current = pickDefaultModel(models, this.config.getModel());
    const picked = await vscode.window.showQuickPick(
      models.map((model) => ({
        label: model.name || model.id,
        description: model.vendor === 'copilot'
          ? 'GitHub Copilot'
          : model.vendor === 'cursor-cli'
          ? 'Cursor Agent CLI'
          : model.vendor,
        detail: model.id === current?.id ? 'Currently selected' : undefined,
        model,
      })),
      {
        title: 'DevMate Kit: AI model',
        placeHolder: this.config.getProvider() === 'cursorCli'
          ? 'Models from Cursor Agent CLI'
          : 'Models available in this editor',
      },
    );
    if (picked) {
      await this.config.setModel(picked.model.id);
      this.publish();
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private beginWork(): vscode.CancellationTokenSource {
    this.cancellation?.cancel();
    this.cancellation?.dispose();
    if (this.chatKeyRunning) {
      const prior = this.threads.get(this.chatKeyRunning);
      if (prior?.status === 'running') {
        prior.status = 'idle';
        this.threads.set(this.chatKeyRunning, prior);
      }
      this.chatKeyRunning = null;
    }
    const source = new vscode.CancellationTokenSource();
    this.cancellation = source;
    return source;
  }

  private async execute(
    kind: AiRunKind,
    title: string,
    work: (token: vscode.CancellationToken, onText: (chunk: string) => void) => Promise<AiResult>,
  ): Promise<void> {
    const source = this.beginWork();
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
          error: errorMessage(error, this.config.getProvider()),
          setupHint: error instanceof AiUnavailableError,
        };
      }
    } finally {
      if (this.cancellation === source) this.cancellation = undefined;
      source.dispose();
      this.publish();
    }
  }

  private async executeChat(
    key: string,
    work: (token: vscode.CancellationToken, onText: (chunk: string) => void) => Promise<AiResult>,
  ): Promise<void> {
    // Card chat owns per-item answers; drop a leftover top-panel Explain run if present.
    if (this.run?.kind === 'explain') this.run = null;
    const source = this.beginWork();
    const thread = this.threads.get(key);
    if (!thread) {
      source.dispose();
      if (this.cancellation === source) this.cancellation = undefined;
      return;
    }
    thread.messages.push({ role: 'assistant', text: '' });
    thread.status = 'running';
    thread.modelName = undefined;
    this.threads.set(key, thread);
    this.chatKeyRunning = key;
    this.publish();

    let lastPublish = 0;
    const onText = (chunk: string): void => {
      const current = this.threads.get(key);
      if (!current || this.chatKeyRunning !== key) return;
      const last = current.messages[current.messages.length - 1];
      if (!last || last.role !== 'assistant') return;
      last.text += chunk;
      this.threads.set(key, current);
      const now = Date.now();
      if (now - lastPublish > STREAM_THROTTLE_MS) {
        lastPublish = now;
        this.publish();
      }
    };

    try {
      const result = await work(source.token, onText);
      if (this.chatKeyRunning !== key) return;
      const current = this.threads.get(key);
      if (!current) return;
      const last = current.messages[current.messages.length - 1];
      if (last?.role === 'assistant') last.text = result.text;
      current.status = 'idle';
      current.modelName = modelLabel(result.model);
      current.messages = trimStoredMessages(current.messages);
      this.threads.set(key, current);
    } catch (error) {
      if (this.chatKeyRunning !== key) return;
      const current = this.threads.get(key);
      if (!current) return;
      if (source.token.isCancellationRequested || error instanceof vscode.CancellationError) {
        current.status = 'idle';
      } else {
        current.status = 'error';
        current.error = errorMessage(error, this.config.getProvider());
        current.setupHint = error instanceof AiUnavailableError;
      }
      this.threads.set(key, current);
    } finally {
      if (this.chatKeyRunning === key) this.chatKeyRunning = null;
      if (this.cancellation === source) this.cancellation = undefined;
      source.dispose();
      this.publish();
    }
  }

  private ensureMonitoring(): boolean {
    if (this.session.isMonitoringEnabled()) return true;
    this.session.notifyPaused();
    return false;
  }

  private async ensureEnabled(): Promise<boolean> {
    if (this.config.getProvider() !== 'none') return true;
    const defaultProvider = defaultAiProviderForHost(vscode.env.appName);
    const choice = await vscode.window.showInformationMessage(
      defaultProvider === 'cursorCli'
        ? 'DevMate: AI is off. Use Cursor Agent CLI, or choose editor language models in Setup.'
        : isCursorHost(vscode.env.appName)
          ? 'DevMate: AI is off. Use language models from this editor, or choose Cursor Agent CLI in Setup.'
          : 'DevMate: AI is off. Use language models from this editor (Setup).',
      'Turn on AI',
      'Open Setup',
    );
    if (choice === 'Turn on AI') {
      await this.config.setProvider(defaultProvider);
      return true;
    }
    if (choice === 'Open Setup') this.hooks.revealSetup();
    return false;
  }

  private async ensureData(): Promise<void> {
    if (!this.session.hasData()) await this.session.refreshAll({ notify: false });
  }

  private async loadModels(): Promise<void> {
    const generation = ++this.modelsLoadGeneration;
    this.modelsLoading = true;
    this.publish();
    try {
      const provider = this.config.getProvider();
      let models: ChatModelInfo[];
      if (provider === 'cursorCli' && isCursorHost(vscode.env.appName)) {
        await this.refreshCliStatus();
        models = sortModelsForPicker(await this.cursorCli.listModels());
      } else {
        models = sortModelsForPicker(await this.vscodeLm.listModels());
      }
      if (generation !== this.modelsLoadGeneration) return;
      this.models = models;
    } finally {
      if (generation === this.modelsLoadGeneration) {
        this.modelsLoading = false;
        this.publish();
      }
    }
  }

  /** VS Code must not keep a persisted Cursor Agent CLI backend. */
  private async ensureProviderFitsHost(): Promise<void> {
    if (isCursorHost(vscode.env.appName)) return;
    if (this.config.getProvider() !== 'cursorCli') return;
    await this.config.setProvider('vscodeLm');
    await this.config.setModel('');
    this.models = null;
  }

  private async refreshCliStatus(): Promise<void> {
    if (this.cliStatusLoading) return;
    this.cliStatusLoading = true;
    try {
      const status = await this.cursorCli.getStatus();
      this.cliAvailable = status.available;
      this.cliAuthenticated = status.authenticated;
    } catch {
      this.cliAvailable = false;
      this.cliAuthenticated = false;
    } finally {
      this.cliStatusLoading = false;
      this.session.refreshSetupStatus();
    }
  }

  private openCliTerminal(action: 'install' | 'login'): void {
    const terminal = vscode.window.createTerminal('DevMate Kit — Cursor Agent CLI');
    if (action === 'login') {
      terminal.sendText('agent login');
    } else if (process.platform === 'win32') {
      terminal.sendText('echo Install Cursor Agent CLI from https://cursor.com/docs/cli/overview then reopen this terminal');
    } else {
      terminal.sendText('curl https://cursor.com/install -fsS | bash');
    }
    terminal.show();
  }

  private showAiError(error: unknown): void {
    if (error instanceof AiUnavailableError) {
      void vscode.window.showWarningMessage(`DevMate: ${error.message}`, 'Open Setup').then((choice) => {
        if (choice) this.hooks.revealSetup();
      });
      return;
    }
    void vscode.window.showErrorMessage(`DevMate: ${errorMessage(error, this.config.getProvider())}`);
  }

  private viewState(): AiViewState {
    const cursorHost = isCursorHost(vscode.env.appName);
    const provider: AiProvider = this.config.getProvider();
    const modelsForProvider = provider === 'cursorCli'
      ? this.models
      : this.models?.filter((model) => model.vendor !== 'cursor-cli') ?? this.models;
    const selected = modelsForProvider ? pickDefaultModel(modelsForProvider, this.config.getModel()) : undefined;
    const lmUnsupported = !LanguageModelClient.isSupported();
    const lmEmpty = modelsForProvider !== null && modelsForProvider.length === 0;
    const suggestCursorCli = cursorHost
      && provider !== 'cursorCli'
      && (lmUnsupported || (provider === 'vscodeLm' && lmEmpty) || (provider === 'none' && (lmUnsupported || lmEmpty)));
    const defaultEnableProvider = defaultAiProviderForHost(vscode.env.appName);
    const savedModel = this.config.getModel();
    const selectedModelId = selected?.id
      ?? (savedModel && !/--model|\/model\b|</.test(savedModel) ? savedModel : null);

    return {
      provider,
      supported: LanguageModelClient.isSupported(),
      selectedModelId,
      models: modelsForProvider,
      modelsLoading: this.modelsLoading,
      run: this.run,
      threads: cloneThreadsRecord(this.threads),
      cliAvailable: this.cliAvailable,
      cliAuthenticated: this.cliAuthenticated,
      suggestCursorCli,
      defaultEnableProvider,
      cursorHost,
    };
  }

  private publish(): void {
    this.session.broadcast({ command: 'ai.state', state: this.viewState() });
    this.session.refreshSetupStatus();
  }

  dispose(): void {
    this.cancellation?.cancel();
    this.cancellation?.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

function normalizeProviderChoice(raw: unknown): AiProvider {
  if (raw === 'vscodeLm') return 'vscodeLm';
  if (raw === 'cursorCli') return 'cursorCli';
  return 'none';
}

function noModelsMessage(provider: AiProvider): string {
  if (provider === 'cursorCli') {
    return 'No models reported by Cursor Agent CLI. Check `agent --list-models`, or leave the model blank for Auto.';
  }
  if (isCursorHost(vscode.env.appName)) {
    return LanguageModelClient.isSupported()
      ? 'No language models are available in this editor. Install or sign in to GitHub Copilot Chat (or another language-model provider), then try again — or choose Cursor Agent CLI in Setup.'
      : 'This editor does not expose a language-model API. Choose Cursor Agent CLI in Setup if `agent` is on your PATH.';
  }
  return LanguageModelClient.isSupported()
    ? 'No language models are available in this editor. Install or sign in to GitHub Copilot Chat (or another language-model provider), then try again.'
    : 'This editor does not expose a language-model API for DevMate to use.';
}

function errorMessage(error: unknown, provider: AiProvider): string {
  if (error instanceof AiUnavailableError && error.reason === 'noModels' && provider === 'vscodeLm' && !LanguageModelClient.isSupported()) {
    return noModelsMessage(provider);
  }
  return error instanceof Error && error.message ? error.message : 'The AI request failed.';
}
