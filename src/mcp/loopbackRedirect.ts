import * as http from 'http';
import type { AddressInfo } from 'net';

const DEFAULT_TIMEOUT_MS = 120000;

export type LoopbackRedirectError = {
  category: 'auth-expired' | 'invalid-entry' | 'network';
  detail: string;
};

export class LoopbackRedirectServer {
  private server: http.Server | undefined;
  private timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  async start(
    expectedState: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<{ redirectUri: string; result: Promise<{ code: string }> }> {
    let settled = false;
    let resolve!: (value: { code: string }) => void;
    let reject!: (reason: LoopbackRedirectError) => void;
    const result = new Promise<{ code: string }>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const settleWith = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      this.stop();
      action();
    };

    let redirectUri = '';
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirectUri);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const params = url.searchParams;
      const error = params.get('error');
      if (error) {
        const detail = params.get('error_description') ?? error;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('Authorization failed. You can close this window and return to VS Code.');
        settleWith(() => reject({ category: 'auth-expired', detail }));
        return;
      }

      if (params.get('state') !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('Invalid state. You can close this window and return to VS Code.');
        settleWith(() => reject({ category: 'invalid-entry', detail: 'OAuth state mismatch' }));
        return;
      }

      const code = params.get('code') ?? '';
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('You can close this window and return to VS Code.');
      settleWith(() => resolve({ code }));
    });
    this.server = server;

    await new Promise<void>((resolveListening) => {
      server.listen(0, '127.0.0.1', resolveListening);
    });
    const port = (server.address() as AddressInfo).port;
    redirectUri = `http://127.0.0.1:${port}/callback`;

    this.timeoutHandle = setTimeout(() => {
      settleWith(() => reject({ category: 'network', detail: 'OAuth callback timed out' }));
    }, timeoutMs);

    return { redirectUri, result };
  }

  stop(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
    if (this.server && this.server.listening) {
      this.server.close();
    }
    this.server = undefined;
  }
}
