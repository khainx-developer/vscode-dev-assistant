import * as vscode from 'vscode';

export interface DevUtilityCommand {
  /** Must match a command id declared in package.json's contributes.commands */
  id: string;
  handler: (editor: vscode.TextEditor, context: vscode.ExtensionContext) => void | Promise<void>;
}
