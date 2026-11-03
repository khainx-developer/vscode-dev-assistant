import * as vscode from 'vscode';

/**
 * Applies `transform` to every non-empty selection in the active editor.
 * If there is no selection (or it's empty), applies it to the whole line under the cursor.
 */
export async function transformSelections(
  editor: vscode.TextEditor,
  transform: (text: string) => string
): Promise<void> {
  const { document, selections } = editor;

  await editor.edit((editBuilder) => {
    for (const selection of selections) {
      if (selection.isEmpty) {
        const line = document.lineAt(selection.start.line);
        editBuilder.replace(line.range, transform(line.text));
      } else {
        editBuilder.replace(selection, transform(document.getText(selection)));
      }
    }
  });
}

export async function insertAtCursor(editor: vscode.TextEditor, text: string): Promise<void> {
  await editor.edit((editBuilder) => {
    for (const selection of editor.selections) {
      editBuilder.replace(selection, text);
    }
  });
}

export function getActiveEditorOrWarn(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('DevMate Kit: No active editor.');
  }
  return editor;
}
