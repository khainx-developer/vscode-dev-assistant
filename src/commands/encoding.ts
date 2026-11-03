import * as vscode from 'vscode';
import { DevUtilityCommand } from '../commandTypes';
import { transformSelections } from '../utils/textEdit';
import { base64Encode, base64Decode } from '../core/base64';
import { urlEncode, urlDecode } from '../core/url';

export const encodingCommands: DevUtilityCommand[] = [
  {
    id: 'devMateKit.base64Encode',
    handler: async (editor) => {
      await transformSelections(editor, base64Encode);
    },
  },
  {
    id: 'devMateKit.base64Decode',
    handler: async (editor) => {
      await transformSelections(editor, (text) => {
        try {
          return base64Decode(text);
        } catch {
          vscode.window.showErrorMessage('DevMate Kit: Selection is not valid Base64.');
          return text;
        }
      });
    },
  },
  {
    id: 'devMateKit.urlEncode',
    handler: async (editor) => {
      await transformSelections(editor, urlEncode);
    },
  },
  {
    id: 'devMateKit.urlDecode',
    handler: async (editor) => {
      await transformSelections(editor, (text) => {
        try {
          return urlDecode(text);
        } catch {
          vscode.window.showErrorMessage('DevMate Kit: Selection is not valid URL-encoded text.');
          return text;
        }
      });
    },
  },
];
