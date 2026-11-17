import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'child_process';
import * as vscode from 'vscode';
import {
  AI_CLI_MISSING_MESSAGE,
  AI_CLI_UNAUTHENTICATED_MESSAGE,
  AiUnavailableError,
  type AiCancellation,
  type LanguageModelPort,
} from '../../services/ai/aiAssistant';
import type { ChatModelInfo } from '../../services/ai/aiSettings';
import type { PromptMessage } from '../../services/ai/prompts';

/**
 * Hard-coded ask/print-only argv — no write/shell/edit modes.
 * `--trust` is required for non-interactive headless runs (not the same as `--force`/`--yolo`).
 */
export const CURSOR_CLI_ASK_PRINT_ARGS = ['-p', '--mode', 'ask', '--output-format', 'text', '--trust'] as const;

const CANDIDATE_BINARIES = ['agent', 'cursor-agent'] as const;
const DEFAULT_MODEL: ChatModelInfo = {
  id: 'auto',
  name: 'Auto',
  vendor: 'cursor-cli',
  family: 'auto',
};

export interface CursorCliStatus {
  available: boolean;
  authenticated: boolean;
  binary: string | null;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcessWithoutNullStreams;

export interface CursorCliClientOptions {
  spawn?: SpawnFn;
  env?: NodeJS.ProcessEnv;
  /** Override PATH probing (tests). Return the binary name to use, or null if missing. */
  resolveBinary?: () => Promise<string | null>;
  /** Workspace folder for cwd / `--workspace` (defaults to the first VS Code folder). */
  workspacePath?: () => string | undefined;
}

/**
 * Process-spawning AI adapter for the Cursor Agent CLI. Never calls `vscode.lm`.
 * Invokes only ask/print (read-only) mode; prompts go on stdin to avoid Windows argv limits.
 */
export class CursorCliClient implements LanguageModelPort {
  private readonly spawn: SpawnFn;
  private readonly env: NodeJS.ProcessEnv;
  private readonly resolveBinary: () => Promise<string | null>;
  private readonly workspacePath: () => string | undefined;
  private cachedBinary: string | null | undefined;

  constructor(options: CursorCliClientOptions = {}) {
    this.spawn = options.spawn ?? ((command, args, opts) => nodeSpawn(command, [...args], opts) as ChildProcessWithoutNullStreams);
    this.env = options.env ?? process.env;
    this.resolveBinary = options.resolveBinary ?? (() => detectBinaryOnPath(this.spawn, this.env));
    this.workspacePath = options.workspacePath
      ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
  }

  async getStatus(): Promise<CursorCliStatus> {
    const binary = await this.ensureBinary();
    if (!binary) {
      return { available: false, authenticated: false, binary: null };
    }
    if (hasApiKey(this.env)) {
      return { available: true, authenticated: true, binary };
    }
    const authenticated = await this.probeAuth(binary);
    return { available: true, authenticated, binary };
  }

  async listModels(): Promise<ChatModelInfo[]> {
    const status = await this.getStatus();
    if (!status.available || !status.binary) return [];

    const listed = await this.probeModels(status.binary);
    if (listed.length > 0) return listed;
    return [DEFAULT_MODEL];
  }

  async sendRequest(
    modelId: string,
    messages: PromptMessage[],
    onText: (chunk: string) => void,
    token?: AiCancellation,
  ): Promise<string> {
    const status = await this.getStatus();
    if (!status.available || !status.binary) {
      throw new AiUnavailableError('cliMissing', AI_CLI_MISSING_MESSAGE);
    }
    if (!status.authenticated) {
      throw new AiUnavailableError('cliUnauthenticated', AI_CLI_UNAUTHENTICATED_MESSAGE);
    }

    const args: string[] = [...CURSOR_CLI_ASK_PRINT_ARGS];
    const workspace = this.workspacePath()?.trim();
    if (workspace) {
      args.push('--workspace', workspace);
    }
    const model = modelId?.trim();
    if (model && model !== 'auto') {
      args.push('--model', model);
    }

    const prompt = messages.map((message) => message.content).join('\n\n').trim();
    return this.runAskPrint(status.binary, args, prompt, onText, token, workspace);
  }

  private async ensureBinary(): Promise<string | null> {
    if (this.cachedBinary !== undefined) return this.cachedBinary;
    this.cachedBinary = await this.resolveBinary();
    return this.cachedBinary;
  }

  private probeAuth(binary: string): Promise<boolean> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (value: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      let child: ChildProcessWithoutNullStreams;
      try {
        child = this.spawn(binary, ['status'], {
          env: this.env,
          shell: process.platform === 'win32',
          windowsHide: true,
        });
      } catch {
        finish(false);
        return;
      }

      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        finish(false);
      }, 8_000);

      child.stdout.on('data', (chunk: Buffer | string) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk: Buffer | string) => { stderr += String(chunk); });
      child.on('error', () => {
        clearTimeout(timer);
        finish(false);
      });
      child.on('close', () => {
        clearTimeout(timer);
        const text = `${stdout}\n${stderr}`;
        if (/not\s+authenticated|not\s+logged\s+in|please\s+log\s+in|login\s+required/i.test(text)) {
          finish(false);
          return;
        }
        finish(/logged\s+in|authenticated/i.test(text));
      });
    });
  }

  private probeModels(binary: string): Promise<ChatModelInfo[]> {
    return new Promise((resolve) => {
      let stdout = '';
      let settled = false;
      const finish = (models: ChatModelInfo[]): void => {
        if (settled) return;
        settled = true;
        resolve(models);
      };

      let child: ChildProcessWithoutNullStreams;
      try {
        child = this.spawn(binary, ['--list-models'], {
          env: this.env,
          shell: process.platform === 'win32',
          windowsHide: true,
        });
      } catch {
        finish([]);
        return;
      }

      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        finish([]);
      }, 10_000);

      child.stdout.on('data', (chunk: Buffer | string) => { stdout += String(chunk); });
      child.on('error', () => {
        clearTimeout(timer);
        finish([]);
      });
      child.on('close', () => {
        clearTimeout(timer);
        finish(parseCursorCliModelList(stdout));
      });
    });
  }

  private runAskPrint(
    binary: string,
    args: string[],
    prompt: string,
    onText: (chunk: string) => void,
    token?: AiCancellation,
    workspace?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = this.spawn(binary, args, {
          env: this.env,
          // Extension-host cwd is often the Cursor install dir; pin to the workspace.
          cwd: workspace || undefined,
          shell: process.platform === 'win32',
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(toSpawnError(error));
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      const cancelSub = token?.onCancellationRequested(() => {
        try { child.kill(); } catch { /* ignore */ }
      });

      const finish = (error?: Error, text?: string): void => {
        if (settled) return;
        settled = true;
        cancelSub?.dispose();
        if (error) reject(error);
        else resolve(text ?? '');
      };

      child.stdout.on('data', (chunk: Buffer | string) => {
        const piece = String(chunk);
        stdout += piece;
        onText(piece);
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk);
      });
      child.on('error', (error) => {
        finish(toSpawnError(error));
      });
      child.on('close', (code) => {
        if (token?.isCancellationRequested) {
          finish(new vscode.CancellationError());
          return;
        }
        const combined = `${stdout}\n${stderr}`;
        if (isAuthFailure(combined)) {
          finish(new AiUnavailableError('cliUnauthenticated', AI_CLI_UNAUTHENTICATED_MESSAGE));
          return;
        }
        if (code && code !== 0 && !stdout.trim()) {
          const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
          finish(new Error(
            /workspace\s+trust\s+required/i.test(detail)
              ? 'Cursor Agent CLI needs workspace trust for headless runs. DevMate passes --trust automatically — update the CLI, then try again.'
              : /unknown|unrecognized|invalid.*(mode|option|flag)/i.test(detail)
              ? `Cursor Agent CLI flags look unsupported in this version (${detail}). Update the CLI or switch AI provider in Setup.`
              : `Cursor Agent CLI failed: ${detail}`,
          ));
          return;
        }
        finish(undefined, stdout);
      });

      try {
        child.stdin.end(prompt, 'utf8');
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

function hasApiKey(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.CURSOR_API_KEY?.trim());
}

async function detectBinaryOnPath(spawn: SpawnFn, env: NodeJS.ProcessEnv): Promise<string | null> {
  for (const name of CANDIDATE_BINARIES) {
    if (await canRun(spawn, name, env)) return name;
  }
  return null;
}

function canRun(spawn: SpawnFn, binary: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(binary, ['--version'], {
        env,
        shell: process.platform === 'win32',
        windowsHide: true,
      });
    } catch {
      finish(false);
      return;
    }

    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      finish(false);
    }, 5_000);

    child.on('error', () => {
      clearTimeout(timer);
      finish(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish(code === 0);
    });
  });
}

/** Exported for unit tests — CLI help text must never become fake picker rows. */
export function parseCursorCliModelList(stdout: string): ChatModelInfo[] {
  const models: ChatModelInfo[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^available models/i.test(trimmed)) continue;
    // Help / usage lines from mismatched CLI builds (e.g. `--list-models` printing --model docs).
    if (/--model|\/model\b|parameterized models|interactive mode/i.test(trimmed)) continue;
    if (/[<>]/.test(trimmed)) continue;

    // Prefer "id - Display Name"
    const dashed = /^([a-zA-Z0-9._/-]+)\s+[-–—]\s+(.+)$/.exec(trimmed);
    if (dashed) {
      addParsedModel(models, seen, dashed[1], dashed[2].trim());
      continue;
    }

    // Bare slug ids only (must contain . _ / or -) — rejects sentence words like "use".
    const bare = /^([a-zA-Z0-9]+(?:[._/-][a-zA-Z0-9]+)+)$/.exec(trimmed);
    if (bare) addParsedModel(models, seen, bare[1], bare[1]);
  }
  return models;
}

function addParsedModel(
  models: ChatModelInfo[],
  seen: Set<string>,
  id: string,
  name: string,
): void {
  if (seen.has(id) || id.toLowerCase() === 'available') return;
  seen.add(id);
  models.push({ id, name: name || id, vendor: 'cursor-cli', family: id });
}

function isAuthFailure(text: string): boolean {
  return /not\s+authenticated|not\s+logged\s+in|please\s+log\s+in|login\s+required|authentication\s+required/i.test(text);
}

function toSpawnError(error: unknown): Error {
  if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
    return new AiUnavailableError('cliMissing', AI_CLI_MISSING_MESSAGE);
  }
  return error instanceof Error ? error : new Error(String(error));
}
