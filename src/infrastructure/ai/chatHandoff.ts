import * as vscode from 'vscode';

export type ChatHandoffMethod = 'clipboard';

export interface ChatHandoffResult {
  method: ChatHandoffMethod;
}

export interface ChatHandoffDeps {
  writeClipboard: (text: string) => Thenable<void>;
  showInformationMessage: (message: string) => Thenable<string | undefined>;
  setStatusBarMessage: (text: string, hideAfterTimeout: number) => void;
}

const DEFAULT_DEPS: ChatHandoffDeps = {
  writeClipboard: (text) => vscode.env.clipboard.writeText(text),
  showInformationMessage: (message) => vscode.window.showInformationMessage(message),
  setStatusBarMessage: (text, hideAfterTimeout) => {
    void vscode.window.setStatusBarMessage(text, hideAfterTimeout);
  },
};

/**
 * Copies an editor-chat hand-off prompt to the clipboard with toast feedback.
 * Host chat command IDs (VS Code / Cursor) are unverified, so clipboard is the primary path —
 * paste into Copilot Chat, Cursor chat, or any MCP-capable agent.
 */
export class ChatHandoff {
  private readonly deps: ChatHandoffDeps;

  constructor(deps: Partial<ChatHandoffDeps> = {}) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
  }

  async send(prompt: string): Promise<ChatHandoffResult> {
    const text = prompt.trim() || '(empty prompt)';
    await this.deps.writeClipboard(text);
    this.deps.setStatusBarMessage('$(check) DevMate: Prompt copied — paste into chat', 4000);
    void this.deps.showInformationMessage('DevMate: Prompt copied — paste into editor chat (Ctrl/Cmd+V).');
    return { method: 'clipboard' };
  }
}
