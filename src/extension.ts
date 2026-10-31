import * as vscode from 'vscode';
import { allCommands } from './commands';
import { getActiveEditorOrWarn } from './utils/textEdit';
import { SidebarProvider } from './views/SidebarProvider';
import { ToolPanel } from './panels/ToolPanel';

export function activate(context: vscode.ExtensionContext): void {
  for (const command of allCommands) {
    const disposable = vscode.commands.registerCommand(command.id, async () => {
      const editor = getActiveEditorOrWarn();
      if (!editor) {
        return;
      }
      try {
        await command.handler(editor, context);
      } catch (err) {
        vscode.window.showErrorMessage(`Dev Utilities: ${(err as Error).message}`);
      }
    });
    context.subscriptions.push(disposable);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('devUtilities.openTool', (toolId: string) => {
      ToolPanel.createOrShow(context.extensionUri, toolId);
    })
  );

  const sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('devUtilities.sidebar', sidebarProvider)
  );
}

export function deactivate(): void {}
