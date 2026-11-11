import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import { normalizeAiProvider, pickDefaultModel, type AiProvider, type ChatModelInfo } from './aiSettings';
import {
  buildExplainItemPrompt,
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

/** Port implemented by `infrastructure/ai/languageModelClient.ts` (the only `vscode.lm` caller). */
export interface LanguageModelPort {
  listModels(): Promise<ChatModelInfo[]>;
  sendRequest(
    modelId: string,
    messages: PromptMessage[],
    onText: (chunk: string) => void,
    token?: AiCancellation,
  ): Promise<string>;
}

export interface AiSettingsSnapshot {
  provider: unknown;
  model: string | undefined;
}

export type AiUnavailableReason = 'disabled' | 'noModels';

export const AI_DISABLED_MESSAGE = 'AI is turned off. Turn it on in DevMate Kit → Setup → AI assistant.';
export const AI_NO_MODELS_MESSAGE =
  'No language model available — install/enable GitHub Copilot Chat, or another LM provider, then pick a model in Setup.';

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

/** DevMate's AI use-cases. Pure orchestration over a port — testable without a VS Code window. */
export class AiAssistant {
  constructor(
    private readonly port: LanguageModelPort,
    private readonly readSettings: () => AiSettingsSnapshot,
  ) {}

  get provider(): AiProvider {
    return normalizeAiProvider(this.readSettings().provider);
  }

  async resolveModel(): Promise<ChatModelInfo> {
    if (this.provider === 'none') {
      throw new AiUnavailableError('disabled', AI_DISABLED_MESSAGE);
    }
    const model = pickDefaultModel(await this.port.listModels(), this.readSettings().model);
    if (!model) {
      throw new AiUnavailableError('noModels', AI_NO_MODELS_MESSAGE);
    }
    return model;
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

  explainItem(item: AttentionInboxItem, now: number, options: AiRunOptions = {}): Promise<AiResult> {
    return this.run(buildExplainItemPrompt(item, now), options);
  }

  private async run(messages: PromptMessage[], options: AiRunOptions): Promise<AiResult> {
    const model = await this.resolveModel();
    const text = await this.port.sendRequest(model.id, messages, options.onText ?? (() => undefined), options.token);
    return { model, text: text.trim() };
  }
}
