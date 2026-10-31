import * as vscode from 'vscode';
import { DevUtilityCommand } from '../commandTypes';
import { transformSelections } from '../utils/textEdit';
import { formatJson, jsonEscapeString } from '../core/json';

export const jsonCommands: DevUtilityCommand[] = [
  {
    id: 'devUtilities.formatJson',
    handler: async (editor) => {
      await transformSelections(editor, (text) => {
        try {
          return formatJson(text);
        } catch (err) {
          vscode.window.showErrorMessage(`Dev Utilities: Invalid JSON - ${(err as Error).message}`);
          return text;
        }
      });
    },
  },
  {
    id: 'devUtilities.toJsonEscapedString',
    handler: async (editor) => {
      await transformSelections(editor, jsonEscapeString);
    },
  },
];
