import { DevUtilityCommand } from '../commandTypes';
import { transformSelections } from '../textEdit';
import { toUpperCase, toLowerCase, toCamelCase, toSnakeCase, toKebabCase } from '../../services/textTools/caseTransform';

export const caseTransformCommands: DevUtilityCommand[] = [
  {
    id: 'devMateKit.toUpperCase',
    handler: async (editor) => {
      await transformSelections(editor, toUpperCase);
    },
  },
  {
    id: 'devMateKit.toLowerCase',
    handler: async (editor) => {
      await transformSelections(editor, toLowerCase);
    },
  },
  {
    id: 'devMateKit.toCamelCase',
    handler: async (editor) => {
      await transformSelections(editor, toCamelCase);
    },
  },
  {
    id: 'devMateKit.toSnakeCase',
    handler: async (editor) => {
      await transformSelections(editor, toSnakeCase);
    },
  },
  {
    id: 'devMateKit.toKebabCase',
    handler: async (editor) => {
      await transformSelections(editor, toKebabCase);
    },
  },
];
