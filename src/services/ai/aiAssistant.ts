import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import { normalizeAiProvider, pickConfiguredModel, type AiProvider, type ChatModelInfo } from './aiSettings';
import {
  buildChatAboutItemPrompt,
  buildNextStepsPrompt,
  buildStandupPrompt,
  type PromptMessage,
  type StandupSnapshot,
} from './prompts';

/** Minimal cancellation shape; `vscode.CancellationToken` satisfies it structurally. */
export interface AiCancellation {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => unknown): { dispose(): unknown };
}

/** Port implemented by `infrastructure/ai/languageModelClient.ts` and `cursorCliClient.ts`. */
export interface LanguageModelPort {
  listModels(): Promise<ChatModelInfo[]>;
  sendRequest(
    modelId: string,
    messages: PromptMessage[],
    onText: (chunk: string) => void,
    token?: AiCancellation,
  ): Promise<string>;
}

/** Optional status probe used when provider is `cursorCli`. */
export interface CursorCliPort extends LanguageModelPort {
  getStatus(): Promise<{ available: boolean; authenticated: boolean }>;
}

export interface AiSettingsSnapshot {
  provider: unknown;
  model: string | undefined;
}

export type AiUnavailableReason =
  | 'disabled'
  | 'noModelSelected'
  | 'noModels'
  | 'cliMissing'
  | 'cliUnauthenticated';

export const AI_DISABLED_MESSAGE = 'AI is turned off. Turn it on in DevMate Kit → Setup → AI assistant.';
export const AI_NO_MODEL_SELECTED_MESSAGE =
  'No AI model selected. Choose a model in DevMate Kit → Setup → AI assistant.';
export const AI_NO_MODELS_MESSAGE =
  'No language model available — install/enable GitHub Copilot Chat, or another LM provider, then pick a model in Setup.';
export const AI_CLI_MISSING_MESSAGE =
  'Cursor Agent CLI was not found on PATH. Install it (`agent` / `cursor-agent`), then choose Cursor Agent CLI again in Setup.';
export const AI_CLI_UNAUTHENTICATED_MESSAGE =
  'Cursor Agent CLI is installed but not logged in. Run `agent login` (or set CURSOR_API_KEY), then try again.';

export class AiUnavailableError extends Error {
  constructor(readonly reason: AiUnavailableReason, message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export interface AiResult {
  model: ChatModelInfo;
  text: string;
}

export interface AiRunOptions {
  onText?: (chunk: string) => void;
  token?: AiCancellation;
}

export interface AiAssistantPorts {
  vscodeLm: LanguageModelPort;
  cursorCli: CursorCliPort;
}

/** DevMate's AI use-cases. Pure orchestration over ports — testable without a VS Code window. */
export class AiAssistant {
  constructor(
    private readonly ports: AiAssistantPorts,
    private readonly readSettings: () => AiSettingsSnapshot,
  ) {}

  get provider(): AiProvider {
    return normalizeAiProvider(this.readSettings().provider);
  }

  private get port(): LanguageModelPort {
    return this.provider === 'cursorCli' ? this.ports.cursorCli : this.ports.vscodeLm;
  }

  async resolveModel(): Promise<ChatModelInfo> {
    if (this.provider === 'none') {
      throw new AiUnavailableError('disabled', AI_DISABLED_MESSAGE);
    }
    const saved = this.readSettings().model?.trim();
    if (!saved || /--model|\/model\b|</.test(saved)) {
      throw new AiUnavailableError('noModelSelected', AI_NO_MODEL_SELECTED_MESSAGE);
    }
    if (this.provider === 'cursorCli') {
      const status = await this.ports.cursorCli.getStatus();
      if (!status.available) {
        throw new AiUnavailableError('cliMissing', AI_CLI_MISSING_MESSAGE);
      }
      if (!status.authenticated) {
        throw new AiUnavailableError('cliUnauthenticated', AI_CLI_UNAUTHENTICATED_MESSAGE);
      }
    }
    const models = await this.port.listModels();
    const configured = pickConfiguredModel(models, saved);
    if (configured) {
      return configured;
    }
    // Cursor CLI accepts free-form --model ids that may not appear in the listed set.
    if (this.provider === 'cursorCli') {
      return { id: saved, name: saved, vendor: 'cursor-cli', family: saved };
    }
    if (models.length === 0) {
      throw new AiUnavailableError('noModels', AI_NO_MODELS_MESSAGE);
    }
    throw new AiUnavailableError('noModelSelected', AI_NO_MODEL_SELECTED_MESSAGE);
  }

  whatShouldIDoNext(
    items: AttentionInboxItem[],
    me: { github: string | null; jira: string | null },
    now: number,
    options: AiRunOptions = {},
  ): Promise<AiResult> {
    return this.run(buildNextStepsPrompt(items, now, me), options);
  }

  standupSummary(snapshot: StandupSnapshot, now: number, options: AiRunOptions = {}): Promise<AiResult> {
    return this.run(buildStandupPrompt(snapshot, now), options);
  }

  /**
   * Multi-turn Q&A about one card. `history` is the conversation so far (including the latest
   * user question). Snapshot + guardrails are rebuilt each call so answers stay fresh.
   */
  chatAboutItem(
    item: AttentionInboxItem,
    history: PromptMessage[],
    me: { github: string | null; jira: string | null },
    now: number,
    options: AiRunOptions = {},
  ): Promise<AiResult> {
    return this.run(buildChatAboutItemPrompt(item, history, me, now), options);
  }

  private async run(messages: PromptMessage[], options: AiRunOptions): Promise<AiResult> {
    const model = await this.resolveModel();
    const text = await this.port.sendRequest(model.id, messages, options.onText ?? (() => undefined), options.token);
    return { model, text: text.trim() };
  }
}
