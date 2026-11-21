/**
 * Resolves the string passed to a tool's `run` from editor state.
 * Tools with `needsInput: false` always get an empty string.
 * Otherwise: non-empty selection text, or the whole document when the selection is empty.
 */
export function resolveToolInput(
  needsInput: boolean,
  selectionEmpty: boolean,
  selectionText: string,
  documentText: string,
): string {
  if (!needsInput) {
    return '';
  }
  return selectionEmpty ? documentText : selectionText;
}
