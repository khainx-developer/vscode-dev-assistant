export type ToolCategory = 'generators' | 'encoders' | 'formatters' | 'converters';

export interface ToolAction {
  id: string;
  label: string;
}

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: ToolCategory;
  tags: string[];
  needsInput: boolean;
  inputPlaceholder?: string;
  actions: ToolAction[];
  /** Pure transform. Throw an Error with a user-facing message on invalid input. */
  run: (actionId: string, input: string) => string;
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  generators: 'Generators',
  encoders: 'Encoders',
  formatters: 'Formatters',
  converters: 'Converters',
};
