import * as vscode from 'vscode';
import { DevUtilityCommand } from '../commandTypes';
import { transformSelections } from '../textEdit';
import { formatJson, jsonEscapeString } from '../../services/textTools/json';

export const jsonCommands: DevUtilityCommand[] = [
  {
    id: 'devMateKit.formatJson',
    handler: async (editor) => {
      await transformSelections(editor, (text) => {
        try {
          return formatJson(text);
        } catch (err) {
          vscode.window.showErrorMessage(`DevMate Kit: Invalid JSON - ${(err as Error).message}`);
          return text;
        }
      });
    },
  },
  {
    id: 'devMateKit.toJsonEscapedString',
    handler: async (editor) => {
      await transformSelections(editor, jsonEscapeString);
    },
  },
];
