import * as vscode from 'vscode';
import { getNonce } from './nonce';

export type WebviewBundle = 'dashboard' | 'sidebar' | 'tool';

/** Root for bundled webview assets (`esbuild.js` writes them to `dist/webview`). */
export function webviewAssetRoot(extensionUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
}

/**
 * Minimal HTML shell for a webview: a strict CSP (scripts only with this page's nonce, styles
 * only from the extension), the bundle's CSS + JS, and optional boot data as inert JSON.
 * All markup is rendered client-side by the bundle in `src/ui/webview/<bundle>/`.
 */
export function renderWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  options: { bundle: WebviewBundle; title: string; bootData?: unknown },
): string {
  const nonce = getNonce();
  const root = webviewAssetRoot(extensionUri);
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(root, `${options.bundle}.js`));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(root, `${options.bundle}.css`));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  const boot = options.bootData === undefined ? '' : `<script type="application/json" id="boot-data">${escapeJsonForHtml(options.bootData)}</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(options.title)}</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="app" aria-live="polite"></div>
  ${boot}
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
