import { DevUtilityCommand } from '../commandTypes';
import { transformSelections } from '../utils/textEdit';
import { toUpperCase, toLowerCase, toCamelCase, toSnakeCase, toKebabCase } from '../core/caseTransform';

export const caseTransformCommands: DevUtilityCommand[] = [
  {
    id: 'devUtilities.toUpperCase',
    handler: async (editor) => {
      await transformSelections(editor, toUpperCase);
    },
  },
  {
    id: 'devUtilities.toLowerCase',
    handler: async (editor) => {
      await transformSelections(editor, toLowerCase);
    },
  },
  {
    id: 'devUtilities.toCamelCase',
    handler: async (editor) => {
      await transformSelections(editor, toCamelCase);
    },
  },
  {
    id: 'devUtilities.toSnakeCase',
    handler: async (editor) => {
      await transformSelections(editor, toSnakeCase);
    },
  },
  {
    id: 'devUtilities.toKebabCase',
    handler: async (editor) => {
      await transformSelections(editor, toKebabCase);
    },
  },
];
