import * as vscode from 'vscode';
import type { AiCancellation, LanguageModelPort } from '../../services/ai/aiAssistant';
import { AI_NO_MODELS_MESSAGE, AiUnavailableError } from '../../services/ai/aiAssistant';
import type { ChatModelInfo } from '../../services/ai/aiSettings';
import type { PromptMessage } from '../../services/ai/prompts';

const JUSTIFICATION = 'DevMate Kit uses a language model to summarize the pull requests and Jira tickets in your attention inbox.';

/**
 * The only module that calls `vscode.lm`. Lists whatever chat models the host registers
 * (Copilot, Claude via Copilot or a BYOK provider, …) — no vendor is hard-coded and no API keys
 * are stored by DevMate.
 */
export class LanguageModelClient implements LanguageModelPort {
  static isSupported(): boolean {
    return typeof vscode.lm?.selectChatModels === 'function';
  }

  /** Subscribe to the host's model list changing (e.g. Copilot signs in). */
  static onDidChangeModels(listener: () => void): vscode.Disposable {
    return vscode.lm?.onDidChangeChatModels?.(listener) ?? new vscode.Disposable(() => undefined);
  }

  async listModels(): Promise<ChatModelInfo[]> {
    if (!LanguageModelClient.isSupported()) return [];
    try {
      const models = await vscode.lm.selectChatModels();
      return models.map((model) => ({
        id: model.id,
        name: model.name,
        vendor: model.vendor,
        family: model.family,
        maxInputTokens: model.maxInputTokens,
      }));
    } catch {
      return [];
    }
  }

  async sendRequest(
    modelId: string,
    messages: PromptMessage[],
    onText: (chunk: string) => void,
    token?: AiCancellation,
  ): Promise<string> {
    if (!LanguageModelClient.isSupported()) {
      throw new AiUnavailableError('noModels', AI_NO_MODELS_MESSAGE);
    }
    const [model] = await vscode.lm.selectChatModels({ id: modelId });
    if (!model) {
      throw new AiUnavailableError('noModels', 'The selected AI model is no longer available. Pick another model in Setup.');
    }

    const chatMessages = messages.map((message) => message.role === 'assistant'
      ? vscode.LanguageModelChatMessage.Assistant(message.content)
      : vscode.LanguageModelChatMessage.User(message.content));

    const ownSource = token ? undefined : new vscode.CancellationTokenSource();
    const cancellation = (token as vscode.CancellationToken | undefined) ?? ownSource!.token;
    try {
      const response = await model.sendRequest(chatMessages, { justification: JUSTIFICATION }, cancellation);
      let text = '';
      for await (const fragment of response.text) {
        text += fragment;
        onText(fragment);
      }
      return text;
    } catch (error) {
      throw toFriendlyError(error);
    } finally {
      ownSource?.dispose();
    }
  }
}

function toFriendlyError(error: unknown): Error {
  if (error instanceof AiUnavailableError) return error;
  if (error instanceof vscode.CancellationError) return error;
  if (error instanceof vscode.LanguageModelError) {
    switch (error.code) {
      case vscode.LanguageModelError.NoPermissions.name:
        return new Error('DevMate Kit is not allowed to use this model yet. Run the AI action again and choose “Allow”.');
      case vscode.LanguageModelError.Blocked.name:
        return new Error('The AI provider blocked this request (quota or policy). Try again later or pick another model in Setup.');
      case vscode.LanguageModelError.NotFound.name:
        return new AiUnavailableError('noModels', 'The selected AI model is no longer available. Pick another model in Setup.');
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(message ? `The AI request failed: ${message}` : 'The AI request failed.');
}
