import * as vscode from 'vscode';

export interface DevUtilityCommand {
  /** Must match a command id declared in package.json's contributes.commands */
  id: string;
  /**
   * When false, the handler runs even with no active editor (editor may be undefined).
   * Defaults to true.
   */
  requiresEditor?: boolean;
  handler: (editor: vscode.TextEditor, context: vscode.ExtensionContext) => void | Promise<void>;
}
