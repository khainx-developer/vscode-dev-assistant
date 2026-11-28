import type { ActionKind } from './types';

/** Stable id for an analysis action: kind plus its sorted evidence ids. */
export function buildActionKey(kind: ActionKind, evidence: readonly string[]): string {
  const sorted = [...evidence].map((id) => id.trim()).filter(Boolean).sort();
  return `${kind}:${sorted.join(',')}`;
}
