import * as vscode from 'vscode';
import { DevUtilityCommand } from '../commandTypes';
import { insertAtCursor, transformSelections } from '../utils/textEdit';
import { generateUuid } from '../core/uuid';
import { currentUnixTimestamp, unixTimestampToIso } from '../core/timestamp';

export const idAndTimeCommands: DevUtilityCommand[] = [
  {
    id: 'devMateKit.generateUuid',
    handler: async (editor) => {
      await insertAtCursor(editor, generateUuid());
    },
  },
  {
    id: 'devMateKit.dateToUnixTimestamp',
    handler: async (editor) => {
      await insertAtCursor(editor, currentUnixTimestamp());
    },
  },
  {
    id: 'devMateKit.unixTimestampToDate',
    handler: async (editor) => {
      await transformSelections(editor, (text) => {
        try {
          return unixTimestampToIso(text);
        } catch {
          vscode.window.showErrorMessage('DevMate Kit: Selection is not a valid Unix timestamp.');
          return text;
        }
      });
    },
  },
];
