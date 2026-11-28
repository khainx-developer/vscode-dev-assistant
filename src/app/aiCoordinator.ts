import * as vscode from 'vscode';
import { AiAssistant, AiUnavailableError, type AiResult } from '../services/ai/aiAssistant';
import {
  defaultAiProviderForHost,
  isCursorHost,
  modelLabel,
  pickConfiguredModel,
  sortModelsForPicker,
  type AiProvider,
  type ChatModelInfo,
} from '../services/ai/aiSettings';
import { AI_NO_MODEL_SELECTED_MESSAGE } from '../services/ai/aiAssistant';
import { buildReviewPrompt } from '../services/ai/prompts';
import { buildStandupSnapshot } from '../services/ai/standupSnapshot';
import { AnalysisService } from '../services/analysis/analysisService';
import {
  analysisItemKey,
  analysisStateFromInboxItem,
  buildEvidenceForAnalysis,
  computeInboxItemStateHash,
} from '../services/analysis/inboxEvidence';
import {
  applyManualDoneMarks,
  trackActions,
  type ActionTrackStatus,
} from '../services/analysis/actionTracker';
import { AUTO_ANALYSIS_BACKOFF_MS, planAutoAnalysis } from '../services/analysis/planner';
import type { AttentionInboxItem } from '../services/attention/attentionInboxBuilder';
import { AiConfigStore } from '../infrastructure/ai/aiConfigStore';
import { ChatHandoff } from '../infrastructure/ai/chatHandoff';
import { CursorCliClient } from '../infrastructure/ai/cursorCliClient';
import { LanguageModelClient } from '../infrastructure/ai/languageModelClient';
import type { AnalysisStore } from '../infrastructure/analysis/analysisStore';
import type { GitHubAuthService } from '../infrastructure/github/auth';
import {
  GithubMcpAdapter,
  areCiLogsAvailable,
} from '../infrastructure/github/githubMcpAdapter';
import type { McpConnectionService } from '../infrastructure/mcp/connectionService';
import type { FailedJobLogsResult, PullRequestCheckRun } from '../shared/githubTypes';
import type {
  AiRunState,
  AiViewState,
  AnalysisSnapshotEntry,
  SessionCommand,
} from '../shared/messages';
import { toAnalysisView } from './analysisCardView';
import type { AiCommandHandler, DashboardSession, SessionSurface } from './dashboardSession';

export interface AiCoordinatorGitHubPorts {
  auth: GitHubAuthService;
  mcp: McpConnectionService;
}

/** Optional CI evidence ports (tests inject fakes; production uses GithubMcpAdapter). */
export interface AiCoordinatorCiPorts {
  getCheckRuns(owner: string, repo: string, pullNumber: number): Promise<PullRequestCheckRun[]>;
  getFailedJobLogs(owner: string, repo: string, runId: string): Promise<FailedJobLogsResult>;
  areCiLogsAvailable(): boolean;
}

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
  private readonly analysis: AnalysisService;
  private models: ChatModelInfo[] | null = null;
  private modelsLoading = false;
  private run: AiRunState | null = null;
  private cancellation: vscode.CancellationTokenSource | undefined;
  private analysisCancellation: vscode.CancellationTokenSource | undefined;
  private autoBatchCancellation: vscode.CancellationTokenSource | undefined;
  private autoRunInFlight: Promise<void> | null = null;
  /** At most one planning pass queued while an automatic batch is already running. */
  private autoRerunRequested = false;
  private userAnalysisRunning = false;
  private readonly autoFailures = new Map<string, number>();
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
    private readonly analysisCache: AnalysisStore,
    private readonly hooks: AiUiHooks,
    private readonly github: AiCoordinatorGitHubPorts,
    chatHandoff?: ChatHandoff,
    private readonly ciPorts?: AiCoordinatorCiPorts,
  ) {
    this.assistant = new AiAssistant(
      { vscodeLm, cursorCli },
      () => config.read(),
    );
    this.analysis = new AnalysisService({
      ai: {
        complete: async (messages, token) => {
          const model = await this.assistant.resolveModel();
          const port = this.assistant.provider === 'cursorCli' ? this.cursorCli : this.vscodeLm;
          return port.sendRequest(model.id, messages, () => undefined, token);
        },
      },
      cache: analysisCache,
      metrics: { log: (line) => this.session.log(line) },
    });
    this.chatHandoff = chatHandoff ?? new ChatHandoff();
    this.disposables.push(
      LanguageModelClient.onDidChangeModels(() => {
        // Only re-list once the user has asked for the list (model access is user-initiated).
        if (this.models !== null && this.config.getProvider() === 'vscodeLm') void this.loadModels();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (AiConfigStore.affects(event)) {
          if (!this.isAiConfiguredToRun()) {
            this.cancelAnalysisWork();
          }
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
      case 'analysis.run':
        return this.runAnalysis(message.key, message.force === true);
      case 'analysis.markDone':
        return this.markActionDone(message.key, message.actionKey, true);
      case 'analysis.unmarkDone':
        return this.markActionDone(message.key, message.actionKey, false);
      case 'analysis.copyText':
        if (message.text) {
          await vscode.env.clipboard.writeText(message.text);
          void vscode.window.setStatusBarMessage('$(check) DevMate: Copied to clipboard', 2500);
        }
        return;
      case 'analysis.openLink':
        if (message.url) {
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        return;
      case 'ai.reviewInChat':
        return this.reviewInChat(message.key, message.template);
      case 'ai.standup':
        return this.standup();
      case 'ai.cancel':
        this.cancellation?.cancel();
        this.analysisCancellation?.cancel();
        this.autoBatchCancellation?.cancel();
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
    void surface.postMessage({ command: 'analysis.snapshot', entries: this.buildSnapshotEntries() });
  }

  selectedModelName(): string | null {
    const saved = this.config.getModel()?.trim();
    if (!saved || /--model|\/model\b|</.test(saved)) return null;
    if (this.config.getProvider() === 'cursorCli') {
      const model = this.models ? pickConfiguredModel(this.models, saved) : undefined;
      if (model) return modelLabel(model);
      return `${saved} · Cursor Agent CLI`;
    }
    const editorModels = this.models?.filter((model) => model.vendor !== 'cursor-cli') ?? null;
    const model = editorModels ? pickConfiguredModel(editorModels, saved) : undefined;
    return model ? modelLabel(model) : null;
  }

  /** Backend on and a non-empty model id chosen in Setup — required before any AI call. */
  private isAiConfiguredToRun(): boolean {
    if (this.config.getProvider() === 'none') return false;
    const saved = this.config.getModel()?.trim();
    return !!saved && !/--model|\/model\b|</.test(saved);
  }

  cliStatus(): { available: boolean; authenticated: boolean } {
    return { available: this.cliAvailable, authenticated: this.cliAuthenticated };
  }

  onInboxRecomputed(): Promise<void> {
    this.publishAnalysisSnapshot();
    return this.runAutomaticAnalyses();
  }

  private buildSnapshotEntries(): Record<string, AnalysisSnapshotEntry> {
    const items = this.session.getInbox().items ?? [];
    const entries: Record<string, AnalysisSnapshotEntry> = {};
    for (const item of items) {
      const itemKey = analysisItemKey(item);
      const view = this.analysisCache.peekView(itemKey);
      if (!view) continue;
      const currentHash = computeInboxItemStateHash(item);
      const actionStatus = this.actionStatusFor(item, itemKey, view.actions);
      entries[item.key] = {
        status: view.stateHash === currentHash ? 'ready' : 'stale',
        analysis: view,
        actionStatus,
      };
    }
    return entries;
  }

  private actionStatusFor(
    item: AttentionInboxItem,
    itemKey: string,
    actions: AnalysisSnapshotEntry['analysis']['actions'],
  ): Record<string, ActionTrackStatus> {
    const identity = {
      githubLogin: this.session.getGitHubState()?.me ?? null,
      jiraName: this.session.getJiraState()?.currentUser ?? null,
    };
    const snapshot = this.analysisCache.peekStateSnapshot(itemKey);
    const tracked = snapshot
      ? trackActions({
        actions: actions.map((action) => ({
          kind: action.kind,
          actionKey: action.actionKey,
          findings: action.findings,
        })),
        snapshot,
        item,
        identity,
      })
      : Object.fromEntries(actions.map((action) => [action.actionKey, 'open' as ActionTrackStatus]));
    return applyManualDoneMarks(tracked, this.analysisCache.manualDoneActionKeys(itemKey));
  }

  private async markActionDone(key: string, actionKey: string, done: boolean): Promise<void> {
    const item = this.session.findItem(key);
    if (!item || !actionKey) return;
    const itemKey = analysisItemKey(item);
    if (done) {
      await this.analysisCache.markDone(itemKey, actionKey);
    } else {
      await this.analysisCache.unmarkDone(itemKey, actionKey);
    }
    this.publishAnalysisSnapshot();
  }

  private publishAnalysisSnapshot(): void {
    this.session.broadcast({
      command: 'analysis.snapshot',
      entries: this.buildSnapshotEntries(),
    });
  }

  cancelAnalysisWork(): void {
    this.autoBatchCancellation?.cancel();
    this.analysisCancellation?.cancel();
    this.autoFailures.clear();
  }

  // ── Use-cases ───────────────────────────────────────────────────────────

  /** On-demand Analyze for one inbox card (Phase 1). */
  async runAnalysis(key: string, force = false): Promise<void> {
    if (!this.ensureMonitoring()) return;
    if (this.config.getProvider() === 'none') {
      this.session.broadcast({
        command: 'analysis.unavailable',
        key,
        reason: 'AI is turned off',
      });
      return;
    }
    if (!this.isAiConfiguredToRun()) {
      this.session.broadcast({
        command: 'analysis.unavailable',
        key,
        reason: AI_NO_MODEL_SELECTED_MESSAGE,
      });
      return;
    }

    const item = this.session.findItem(key);
    if (!item) {
      void vscode.window.showInformationMessage('DevMate: That item is no longer in your inbox.');
      return;
    }

    this.autoBatchCancellation?.cancel();
    this.analysisCancellation?.cancel();
    this.analysisCancellation?.dispose();
    this.analysisCancellation = undefined;

    const source = new vscode.CancellationTokenSource();
    this.analysisCancellation = source;
    this.userAnalysisRunning = true;
    try {
      await this.analyzeItem(item, {
        force,
        announceAnalyzing: true,
        token: source.token,
        showAiErrors: true,
      });
      this.publishAnalysisSnapshot();
    } finally {
      this.userAnalysisRunning = false;
      if (this.analysisCancellation === source) this.analysisCancellation = undefined;
      source.dispose();
    }
  }

  /**
   * Shared path for on-demand and automatic Analyze: evidence → AnalysisService → setView.
   * Automatic runs skip the analyzing flicker.
   */
  private async analyzeItem(
    item: AttentionInboxItem,
    options: {
      force: boolean;
      announceAnalyzing: boolean;
      token: vscode.CancellationToken;
      showAiErrors: boolean;
    },
  ): Promise<'ready' | 'cached' | 'unavailable' | 'cancelled'> {
    const key = item.key;
    const itemKey = analysisItemKey(item);
    const stateHash = computeInboxItemStateHash(item);
    const urls = { prUrl: item.pr?.url, ticketUrl: item.jiraTask?.url };

    if (!options.force) {
      const cachedView = this.analysisCache.getView(itemKey, stateHash);
      if (cachedView) {
        this.session.broadcast({
          command: 'analysis.result',
          key,
          analysis: cachedView,
        });
        return 'cached';
      }
    }

    const session = await this.github.auth.getSession(false);
    const ciLogsAvailable = this.ciPorts?.areCiLogsAvailable() ?? areCiLogsAvailable();
    const logEvidence = (line: string): void => this.session.log(line);
    const evidence = session
      ? await buildEvidenceForAnalysis(item, {
        includeCiLogs: this.config.getAnalysisIncludeCiLogs(),
        ciLogsAvailable,
        log: logEvidence,
        getCheckRuns: (owner, repo, pullNumber) =>
          this.ciPorts
            ? this.ciPorts.getCheckRuns(owner, repo, pullNumber)
            : GithubMcpAdapter.getCheckRuns(this.github.mcp, session, owner, repo, pullNumber),
        getFailedJobLogs: (owner, repo, runId) =>
          this.ciPorts
            ? this.ciPorts.getFailedJobLogs(owner, repo, runId)
            : GithubMcpAdapter.getFailedJobLogs(
              this.github.mcp,
              session,
              owner,
              repo,
              runId,
              logEvidence,
            ),
      })
      : await buildEvidenceForAnalysis(item, {
        includeCiLogs: false,
        ciLogsAvailable: false,
        log: logEvidence,
        getCheckRuns: async () => [],
        getFailedJobLogs: async () => ({ ok: false, reason: 'unavailable' }),
      });

    if (options.announceAnalyzing) {
      this.session.broadcast({ command: 'analysis.analyzing', key });
    }

    try {
      const outcome = await this.analysis.run({
        itemKey,
        stateHash,
        evidence,
        force: options.force,
        token: options.token,
      });
      if (options.token.isCancellationRequested || outcome.status === 'cancelled') {
        this.session.broadcast({
          command: 'analysis.unavailable',
          key,
          reason: 'cancelled',
        });
        return 'cancelled';
      }
      if (outcome.status === 'unavailable') {
        this.session.broadcast({
          command: 'analysis.unavailable',
          key,
          reason: outcome.error,
        });
        return 'unavailable';
      }
      const view = toAnalysisView(outcome.analysis, evidence, urls);
      await this.analysisCache.setView(
        itemKey,
        stateHash,
        view,
        analysisStateFromInboxItem(item),
      );
      this.session.broadcast({
        command: 'analysis.result',
        key,
        analysis: view,
      });
      return 'ready';
    } catch (error) {
      if (options.token.isCancellationRequested || error instanceof vscode.CancellationError) {
        this.session.broadcast({
          command: 'analysis.unavailable',
          key,
          reason: 'cancelled',
        });
        return 'cancelled';
      }
      this.session.broadcast({
        command: 'analysis.unavailable',
        key,
        reason: errorMessage(error, this.config.getProvider()),
      });
      if (options.showAiErrors && error instanceof AiUnavailableError) {
        this.showAiError(error);
      }
      return 'unavailable';
    }
  }

  private canRunAutomaticAnalysis(): boolean {
    if (!this.session.isMonitoringEnabled()) return false;
    if (!this.isAiConfiguredToRun()) return false;
    if (!this.config.getAnalysisAuto()) return false;
    if (this.userAnalysisRunning) return false;
    return true;
  }

  private async runAutomaticAnalyses(): Promise<void> {
    if (this.autoRunInFlight) {
      this.autoRerunRequested = true;
      return;
    }
    if (!this.canRunAutomaticAnalysis()) return;

    do {
      this.autoRerunRequested = false;
      const run = this.doAutomaticAnalyses();
      this.autoRunInFlight = run;
      try {
        await run;
      } finally {
        if (this.autoRunInFlight === run) this.autoRunInFlight = null;
      }
    } while (this.autoRerunRequested && this.canRunAutomaticAnalysis());

    // Drop a stale queue if we finished but can no longer auto-run (AI off, user Analyze, etc.).
    this.autoRerunRequested = false;
  }

  private async doAutomaticAnalyses(): Promise<void> {
    const inbox = this.session.getInbox();
    const items = inbox.items ?? [];
    const snoozedKeys = new Set(inbox.snoozed.map((entry) => entry.item.key));
    const now = Date.now();
    const planned = planAutoAnalysis({
      items,
      hasCachedView: (item) => {
        const itemKey = analysisItemKey(item);
        const stateHash = computeInboxItemStateHash(item);
        return !!this.analysisCache.getView(itemKey, stateHash);
      },
      snoozedKeys,
      lastAutoFailureAt: (item) => this.autoFailures.get(analysisItemKey(item)),
      maxAutoPerRefresh: this.config.getAnalysisMaxAutoPerRefresh(),
      now,
    });

    this.autoBatchCancellation?.cancel();
    this.autoBatchCancellation?.dispose();
    const batch = new vscode.CancellationTokenSource();
    this.autoBatchCancellation = batch;

    let ran = 0;
    try {
      for (const item of planned) {
        if (batch.token.isCancellationRequested || !this.canRunAutomaticAnalysis()) {
          break;
        }

        const source = new vscode.CancellationTokenSource();
        this.analysisCancellation = source;
        const link = batch.token.onCancellationRequested(() => source.cancel());
        try {
          const result = await this.analyzeItem(item, {
            force: false,
            announceAnalyzing: false,
            token: source.token,
            showAiErrors: false,
          });
          if (result === 'ready') {
            ran += 1;
            this.autoFailures.delete(analysisItemKey(item));
          } else if (result === 'unavailable') {
            this.autoFailures.set(analysisItemKey(item), Date.now());
          }
        } finally {
          link.dispose();
          if (this.analysisCancellation === source) this.analysisCancellation = undefined;
          source.dispose();
        }
      }
    } finally {
      if (this.autoBatchCancellation === batch) this.autoBatchCancellation = undefined;
      batch.dispose();
      this.session.log(`[analysis] auto: planned ${planned.length}, ran ${ran}`);
      this.publishAnalysisSnapshot();
    }

    // Prune stale backoff entries so the map cannot grow without bound.
    for (const [key, failedAt] of this.autoFailures) {
      if (now - failedAt >= AUTO_ANALYSIS_BACKOFF_MS) {
        this.autoFailures.delete(key);
      }
    }
  }

  /** Copy an editor-chat hand-off prompt (MCP guidance + item URL). Does not use AiAssistant. */
  async reviewInChat(key: string, template?: string): Promise<void> {
    if (!this.ensureMonitoring()) return;
    const item = this.session.findItem(key);
    if (!item) {
      void vscode.window.showInformationMessage('DevMate: That item is no longer in your inbox.');
      return;
    }
    const prompt = buildReviewPrompt(item, template ?? 'review', this.config.getReviewPrompt());
    await this.chatHandoff.send(prompt);
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
    const current = pickConfiguredModel(models, this.config.getModel());
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
    const savedModel = this.config.getModel()?.trim();
    const selected = modelsForProvider && savedModel
      ? pickConfiguredModel(modelsForProvider, savedModel)
      : undefined;
    const lmUnsupported = !LanguageModelClient.isSupported();
    const lmEmpty = modelsForProvider !== null && modelsForProvider.length === 0;
    const suggestCursorCli = cursorHost
      && provider !== 'cursorCli'
      && (lmUnsupported || (provider === 'vscodeLm' && lmEmpty) || (provider === 'none' && (lmUnsupported || lmEmpty)));
    const defaultEnableProvider = defaultAiProviderForHost(vscode.env.appName);
    // Only an explicit Setup choice counts — never invent a default selected model.
    const selectedModelId = selected?.id
      ?? (provider === 'cursorCli' && savedModel && !/--model|\/model\b|</.test(savedModel) ? savedModel : null);

    return {
      provider,
      supported: LanguageModelClient.isSupported(),
      selectedModelId,
      models: modelsForProvider,
      modelsLoading: this.modelsLoading,
      run: this.run,
      threads: {},
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
    this.cancelAnalysisWork();
    this.cancellation?.cancel();
    this.cancellation?.dispose();
    this.analysisCancellation?.dispose();
    this.autoBatchCancellation?.dispose();
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
