/**
 * AI runtime settings. DevMate never talks to an AI vendor directly: it uses whatever chat models
 * the editor registers with the VS Code Language Model API (GitHub Copilot, Claude exposed through
 * Copilot or a BYOK provider, …). So the only provider choice is on/off.
 */
export type AiProvider = 'none' | 'vscodeLm';

/** Legacy value written by DevMate ≤ 0.0.6 — read as `vscodeLm`. */
const LEGACY_COPILOT = 'githubCopilot';

export function normalizeAiProvider(raw: unknown): AiProvider {
  return raw === 'vscodeLm' || raw === LEGACY_COPILOT ? 'vscodeLm' : 'none';
}

export function isLegacyProviderValue(raw: unknown): boolean {
  return raw === LEGACY_COPILOT;
}

export interface ChatModelInfo {
  id: string;
  name: string;
  vendor: string;
  family: string;
  maxInputTokens?: number;
}

/**
 * Pick the model to use: the saved one if the host still offers it (matched by id, then by name
 * or family for values saved by older versions), else the first Copilot model, else the first
 * model at all. Returns undefined when the host offers no models.
 */
export function pickDefaultModel(models: ChatModelInfo[], savedModel: string | undefined | null): ChatModelInfo | undefined {
  if (models.length === 0) return undefined;
  const saved = savedModel?.trim();
  if (saved) {
    const exact = models.find((model) => model.id === saved);
    if (exact) return exact;
    const loose = models.find((model) => model.name === saved || model.family === saved);
    if (loose) return loose;
  }
  return models.find((model) => model.vendor === 'copilot') ?? models[0];
}

/** Copilot models first, then everything else, each group alphabetical — stable for a picker. */
export function sortModelsForPicker(models: ChatModelInfo[]): ChatModelInfo[] {
  return [...models].sort((left, right) => {
    const leftCopilot = left.vendor === 'copilot' ? 0 : 1;
    const rightCopilot = right.vendor === 'copilot' ? 0 : 1;
    if (leftCopilot !== rightCopilot) return leftCopilot - rightCopilot;
    return (left.name || left.id).localeCompare(right.name || right.id);
  });
}

export function modelLabel(model: ChatModelInfo): string {
  const vendor = model.vendor === 'copilot' ? 'GitHub Copilot' : model.vendor;
  return `${model.name || model.family || model.id} · ${vendor}`;
}
