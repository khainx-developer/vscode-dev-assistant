import * as vscode from 'vscode';
import { DevUtilityCommand } from '../commandTypes';
import { insertAtCursor, transformSelections } from '../textEdit';
import { generateUuid } from '../../services/textTools/uuid';
import { currentUnixTimestamp, unixTimestampToIso } from '../../services/textTools/timestamp';

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
