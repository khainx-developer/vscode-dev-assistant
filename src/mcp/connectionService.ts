import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { McpErrorMapper } from './errorMapper';
import { createOAuthClientProvider } from './oauthClientProvider';
import { McpSecretTokenStore } from './secretTokenStore';
import type { McpServerId } from './types';

export { UnauthorizedError };

const SERVER_CONFIG_KEYS: Record<McpServerId, string> = {
  atlassian: 'com.atlassian/atlassian-mcp-server',
  github: 'io.github.github/github-mcp-server',
};

export interface McpClientLike {
  connect(transport: McpTransportLike): Promise<void>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
}

export interface McpTransportLike {
  finishAuth(authorizationCode: string): Promise<void>;
  close(): Promise<void>;
}

export type McpClientFactory = (
  url: string,
  authProvider: OAuthClientProvider,
  extraHeaders?: Record<string, string>,
) => { client: McpClientLike; transport: McpTransportLike };

function defaultCreateClientPair(
  url: string,
  authProvider: OAuthClientProvider,
  extraHeaders?: Record<string, string>,
): { client: McpClientLike; transport: McpTransportLike } {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    authProvider,
    requestInit: extraHeaders ? { headers: extraHeaders } : undefined,
  });
  const client = new Client({ name: 'dev-assistant', version: '0.0.1' });
  // The real SDK's `Client.connect`/`Transport` types are mutually self-referential and more
  // specific than this module's minimal structural interfaces; both real instances satisfy
  // McpClientLike/McpTransportLike's actual contract (connect/callTool/close,
  // finishAuth/close) at runtime.
  return { client: client as unknown as McpClientLike, transport: transport as unknown as McpTransportLike };
}

function readServerUrls(context: vscode.ExtensionContext): Map<McpServerId, string> {
  const configPath = path.join(context.extensionPath, '.mcp.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    mcpServers: Record<string, { url: string }>;
  };
  const urls = new Map<McpServerId, string>();
  for (const [serverId, configKey] of Object.entries(SERVER_CONFIG_KEYS) as [McpServerId, string][]) {
    urls.set(serverId, config.mcpServers[configKey].url);
  }
  return urls;
}

type AuthSession = {
  store: McpSecretTokenStore;
  provider: OAuthClientProvider & { authorizationResult: Promise<{ code: string }> };
};

export class McpConnectionService {
  private readonly serverUrls: Map<McpServerId, string>;
  private readonly inFlightConnect = new Map<McpServerId, Promise<void>>();
  private readonly authSessions = new Map<McpServerId, AuthSession>();
  private readonly connectedClients = new Map<McpServerId, { client: McpClientLike; transport: McpTransportLike }>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly createClientPair: McpClientFactory = defaultCreateClientPair,
    private readonly createProvider: typeof createOAuthClientProvider = createOAuthClientProvider,
  ) {
    this.serverUrls = readServerUrls(context);
  }

  async connect(serverId: McpServerId, opts?: { extraHeaders?: Record<string, string> }): Promise<void> {
    if (this.isConnected(serverId)) {
      return;
    }
    const inFlight = this.inFlightConnect.get(serverId);
    if (inFlight) {
      return inFlight;
    }
    const attempt = this.doConnect(serverId, opts).finally(() => {
      this.inFlightConnect.delete(serverId);
    });
    this.inFlightConnect.set(serverId, attempt);
    return attempt;
  }

  disconnect(serverId: McpServerId): Promise<void> {
    return this.doDisconnect(serverId);
  }

  isConnected(serverId: McpServerId): boolean {
    return this.connectedClients.has(serverId);
  }

  async callTool(serverId: McpServerId, name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected(serverId)) {
      await this.connect(serverId);
    }
    const connected = this.connectedClients.get(serverId);
    if (!connected) {
      throw McpErrorMapper.mapError(
        serverId,
        new Error(`Not connected to "${serverId}"`),
        this.serverUrls.get(serverId),
      );
    }
    try {
      return await connected.client.callTool({ name, arguments: args });
    } catch (error) {
      throw McpErrorMapper.mapError(serverId, error, this.serverUrls.get(serverId));
    }
  }

  async dispose(): Promise<void> {
    for (const serverId of this.serverUrls.keys()) {
      await this.doDisconnect(serverId);
    }
  }

  private async doConnect(serverId: McpServerId, opts?: { extraHeaders?: Record<string, string> }): Promise<void> {
    try {
      let session = this.authSessions.get(serverId);
      if (!session) {
        const store = new McpSecretTokenStore(this.context, serverId);
        const provider = await this.createProvider(serverId, store);
        session = { store, provider };
        this.authSessions.set(serverId, session);
      }

      const url = this.serverUrls.get(serverId);
      if (!url) {
        throw new Error(`No MCP server URL configured for "${serverId}"`);
      }

      let { client, transport } = this.createClientPair(url, session.provider, opts?.extraHeaders);
      try {
        await client.connect(transport);
      } catch (error) {
        if (!(error instanceof UnauthorizedError)) {
          throw error;
        }
        const { code } = await session.provider.authorizationResult;
        // `finishAuth` exchanges the code for tokens via the already-discovered transport
        // instance (cheap — reuses its cached discovery state), but `Client.connect()` calls
        // `transport.start()` internally, and a transport refuses to be started twice. The
        // actual reconnect-with-tokens attempt must use a fresh client+transport pair.
        await transport.finishAuth(code);
        ({ client, transport } = this.createClientPair(url, session.provider, opts?.extraHeaders));
        await client.connect(transport);
      }

      this.connectedClients.set(serverId, { client, transport });
    } catch (error) {
      throw McpErrorMapper.mapError(serverId, error, this.serverUrls.get(serverId));
    }
  }

  private async doDisconnect(serverId: McpServerId): Promise<void> {
    const connected = this.connectedClients.get(serverId);
    if (connected) {
      await connected.transport.close();
      this.connectedClients.delete(serverId);
    }

    const session = this.authSessions.get(serverId);
    if (session) {
      this.authSessions.delete(serverId);
      await session.store.clear();
    }
  }
}
