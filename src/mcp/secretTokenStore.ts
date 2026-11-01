import * as vscode from 'vscode';
import type { McpServerId } from './types';

export class McpSecretTokenStore {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly serverId: McpServerId,
  ) {}

  async getClientInformation(): Promise<unknown | undefined> {
    return this.getJson(this.clientInformationKey());
  }

  async saveClientInformation(info: unknown): Promise<void> {
    await this.setJson(this.clientInformationKey(), info);
  }

  async getTokens(): Promise<unknown | undefined> {
    return this.getJson(this.tokensKey());
  }

  async saveTokens(tokens: unknown): Promise<void> {
    await this.setJson(this.tokensKey(), tokens);
  }

  async getCodeVerifier(): Promise<string | undefined> {
    return this.context.secrets.get(this.codeVerifierKey());
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await this.context.secrets.store(this.codeVerifierKey(), verifier);
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.context.secrets.delete(this.clientInformationKey()),
      this.context.secrets.delete(this.tokensKey()),
      this.context.secrets.delete(this.codeVerifierKey()),
    ]);
  }

  private clientInformationKey(): string {
    return `devAssistant.mcp.${this.serverId}.clientInformation`;
  }

  private tokensKey(): string {
    return `devAssistant.mcp.${this.serverId}.tokens`;
  }

  private codeVerifierKey(): string {
    return `devAssistant.mcp.${this.serverId}.codeVerifier`;
  }

  private async getJson(key: string): Promise<unknown | undefined> {
    const raw = await this.context.secrets.get(key);
    if (raw === undefined) {
      return undefined;
    }
    return JSON.parse(raw);
  }

  private async setJson(key: string, value: unknown): Promise<void> {
    await this.context.secrets.store(key, JSON.stringify(value));
  }
}
