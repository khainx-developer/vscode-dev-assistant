import * as vscode from 'vscode';
import { DevUtilityCommand } from '../commandTypes';
import { insertAtCursor } from '../textEdit';
import { tools } from '../../services/toolRegistry';
import type { ToolAction, ToolDefinition } from '../../shared/toolTypes';
import { resolveToolInput } from './runToolInput';

interface ToolQuickPickItem extends vscode.QuickPickItem {
  tool: ToolDefinition;
}

interface ActionQuickPickItem extends vscode.QuickPickItem {
  action: ToolAction;
}

async function pickTool(): Promise<ToolDefinition | undefined> {
  const items: ToolQuickPickItem[] = tools.map((tool) => ({
    label: tool.title,
    description: tool.description,
    detail: tool.tags.join(', '),
    tool,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'DevMate Kit: Run Tool',
    placeHolder: 'Search tools by name, description, or tag',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.tool;
}

async function pickAction(tool: ToolDefinition): Promise<string | undefined> {
  if (tool.actions.length === 1) {
    return tool.actions[0].id;
  }

  const items: ActionQuickPickItem[] = tool.actions.map((action) => ({
    label: action.label,
    action,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: tool.title,
    placeHolder: 'Choose an action',
  });
  return picked?.action.id;
}

async function copyResult(text: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
  void vscode.window.showInformationMessage('DevMate Kit: Result copied to clipboard.');
}

async function runSelectedTool(editor: vscode.TextEditor | undefined): Promise<void> {
  const tool = await pickTool();
  if (!tool) {
    return;
  }

  const actionId = await pickAction(tool);
  if (!actionId) {
    return;
  }

  const selection = editor?.selection;
  const selectionEmpty = !selection || selection.isEmpty;
  const selectionText = editor && selection && !selection.isEmpty
    ? editor.document.getText(selection)
    : '';
  const documentText = editor?.document.getText() ?? '';

  const input = resolveToolInput(tool.needsInput, selectionEmpty, selectionText, documentText);

  let output: string;
  try {
    output = tool.run(actionId, input);
  } catch (err) {
    void vscode.window.showErrorMessage(`DevMate Kit: ${(err as Error).message}`);
    return;
  }

  // Text-output tools: replace a non-empty selection; otherwise copy.
  if (editor && selection && !selection.isEmpty) {
    await insertAtCursor(editor, output);
    return;
  }

  await copyResult(output);
}

export const runToolCommands: DevUtilityCommand[] = [
  {
    id: 'devMateKit.runTool',
    requiresEditor: false,
    handler: (async (editor: vscode.TextEditor | undefined) => {
      await runSelectedTool(editor);
    }) as DevUtilityCommand['handler'],
  },
];
