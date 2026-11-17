export type ToolCategory = 'code' | 'api' | 'debug';

export interface ToolAction {
  id: string;
  label: string;
}

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  /** Glyph id from the webview icon set (`src/ui/webview/shared/icons.js`). */
  icon: string;
  category: ToolCategory;
  tags: string[];
  needsInput: boolean;
  inputPlaceholder?: string;
  actions: ToolAction[];
  /** Pure transform. Throw an Error with a user-facing message on invalid input. */
  run: (actionId: string, input: string) => string;
}

export const CATEGORY_ORDER: ToolCategory[] = ['code', 'api', 'debug'];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  code: 'Code',
  api: 'API',
  debug: 'Debug',
};
