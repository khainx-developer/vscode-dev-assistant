// Webview ↔ extension-host bridge. Message shapes are defined in src/shared/messages.ts.

// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();

export function post(message) {
  vscode.postMessage(message);
}

export function onMessage(handler) {
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && typeof message.command === 'string') handler(message);
  });
}

/** Per-webview UI state (selected tab, expanded sections…) that survives reloads. */
export function loadUiState(defaults) {
  try {
    return { ...defaults, ...(vscode.getState() || {}) };
  } catch {
    return { ...defaults };
  }
}

export function saveUiState(state) {
  try {
    vscode.setState(state);
  } catch {
    // Persisting UI state is a convenience only.
  }
}

export function readBootData() {
  const element = document.getElementById('boot-data');
  if (!element) return {};
  try {
    return JSON.parse(element.textContent || '{}');
  } catch {
    return {};
  }
}
