/**
 * AI runtime settings. DevMate never talks to a cloud model vendor with its own API keys:
 * it either uses whatever chat models the editor registers with the VS Code Language Model API
 * (`vscodeLm`), or spawns the Cursor Agent CLI in ask/print-only mode (`cursorCli`).
 */
export type AiProvider = 'none' | 'vscodeLm' | 'cursorCli';

/** Backend chosen when enabling AI from off — never `none`. */
export type AiEnableProvider = Exclude<AiProvider, 'none'>;

/** Legacy value written by DevMate ≤ 0.0.6 — read as `vscodeLm`. */
const LEGACY_COPILOT = 'githubCopilot';

export function normalizeAiProvider(raw: unknown): AiProvider {
  if (raw === 'vscodeLm' || raw === LEGACY_COPILOT) return 'vscodeLm';
  if (raw === 'cursorCli') return 'cursorCli';
  // Bare 'cursor' and other unknowns stay off — do not invent a fake host vendor.
  return 'none';
}

export function isLegacyProviderValue(raw: unknown): boolean {
  return raw === LEGACY_COPILOT;
}

/** True when `vscode.env.appName` (or similar) names Cursor. */
export function isCursorHost(appName: string | undefined | null): boolean {
  return (appName ?? '').toLowerCase().includes('cursor');
}

/**
 * Sensible backend when turning AI on from the package default (`none`).
 * Persisted Off stays Off until the user enables — this only picks what to enable *to*.
 */
export function defaultAiProviderForHost(appName: string | undefined | null): AiEnableProvider {
  return isCursorHost(appName) ? 'cursorCli' : 'vscodeLm';
}

export interface ChatModelInfo {
  id: string;
  name: string;
  vendor: string;
  family: string;
  maxInputTokens?: number;
}

/**
 * Resolve a user-chosen model only (id, then legacy name/family). No automatic fallback —
 * Analyze / auto-analysis require an explicit Setup selection.
 */
export function pickConfiguredModel(
  models: ChatModelInfo[],
  savedModel: string | undefined | null,
): ChatModelInfo | undefined {
  const saved = savedModel?.trim();
  if (!saved || models.length === 0) return undefined;
  const exact = models.find((model) => model.id === saved);
  if (exact) return exact;
  return models.find((model) => model.name === saved || model.family === saved);
}

/**
 * @deprecated Prefer pickConfiguredModel for AI runs. Kept for tests / legacy callers that
 * still document the old “first Copilot” fallback.
 */
export function pickDefaultModel(models: ChatModelInfo[], savedModel: string | undefined | null): ChatModelInfo | undefined {
  const configured = pickConfiguredModel(models, savedModel);
  if (configured) return configured;
  if (models.length === 0) return undefined;
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
  if (model.vendor === 'cursor-cli') {
    return `${model.name || model.family || model.id} · Cursor Agent CLI`;
  }
  const vendor = model.vendor === 'copilot' ? 'GitHub Copilot' : model.vendor;
  return `${model.name || model.family || model.id} · ${vendor}`;
}
