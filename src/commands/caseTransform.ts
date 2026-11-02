import { DevUtilityCommand } from '../commandTypes';
import { transformSelections } from '../utils/textEdit';
import { toUpperCase, toLowerCase, toCamelCase, toSnakeCase, toKebabCase } from '../core/caseTransform';

export const caseTransformCommands: DevUtilityCommand[] = [
  {
    id: 'devAssistant.toUpperCase',
    handler: async (editor) => {
      await transformSelections(editor, toUpperCase);
    },
  },
  {
    id: 'devAssistant.toLowerCase',
    handler: async (editor) => {
      await transformSelections(editor, toLowerCase);
    },
  },
  {
    id: 'devAssistant.toCamelCase',
    handler: async (editor) => {
      await transformSelections(editor, toCamelCase);
    },
  },
  {
    id: 'devAssistant.toSnakeCase',
    handler: async (editor) => {
      await transformSelections(editor, toSnakeCase);
    },
  },
  {
    id: 'devAssistant.toKebabCase',
    handler: async (editor) => {
      await transformSelections(editor, toKebabCase);
    },
  },
];
