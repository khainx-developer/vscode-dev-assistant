import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  McpClientFactory,
  McpClientLike,
  McpConnectionService,
  McpTransportLike,
  UnauthorizedError,
} from './connectionService';
import { createOAuthClientProvider } from './oauthClientProvider';
import type { McpServerId } from './types';

// Compiled test lives at out/mcp/connectionService.test.js; the repo root (where .mcp.json
// lives) is two directories up.
const REPO_ROOT = path.join(__dirname, '..', '..');

function makeContext(): vscode.ExtensionContext {
  const secrets = new Map<string, string>();
  return {
    extensionPath: REPO_ROOT,
    secrets: {
      get: (key: string) => Promise.resolve(secrets.get(key)),
      store: (key: string, value: string) => {
        secrets.set(key, value);
        return Promise.resolve();
      },
      delete: (key: string) => {
        secrets.delete(key);
        return Promise.resolve();
      },
    },
  } as unknown as vscode.ExtensionContext;
}

type FakeProvider = Awaited<ReturnType<typeof createOAuthClientProvider>>;

function makeFakeProvider(redirectCalls: URL[]): FakeProvider {
  let resolveCode!: (value: { code: string }) => void;
  const authorizationResult = new Promise<{ code: string }>((resolve) => {
    resolveCode = resolve;
  });
  return {
    authorizationResult,
    redirectUrl: 'http://127.0.0.1:0/callback',
    clientMetadata: {
      redirect_uris: ['http://127.0.0.1:0/callback'],
      token_endpoint_auth_method: 'none',
    },
    clientInformation: () => Promise.resolve(undefined),
    saveClientInformation: () => Promise.resolve(),
    tokens: () => Promise.resolve(undefined),
    saveTokens: () => Promise.resolve(),
    codeVerifier: () => Promise.resolve('verifier'),
    saveCodeVerifier: () => Promise.resolve(),
    redirectToAuthorization: (url: URL) => {
      redirectCalls.push(url);
      resolveCode({ code: 'auth-code' });
      return Promise.resolve();
    },
  } as unknown as FakeProvider;
}

function makeNeverConnectedClientPair(behavior: { requiresAuthOnce: boolean }): McpClientFactory {
  let connectCallCount = 0;
  const transport: McpTransportLike = {
    finishAuth: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
  return (_url, authProvider) => {
    const client: McpClientLike = {
      connect: async () => {
        connectCallCount += 1;
        if (behavior.requiresAuthOnce && connectCallCount === 1) {
          await authProvider.redirectToAuthorization(new URL('https://auth.example.com/authorize'));
          throw new UnauthorizedError();
        }
      },
      callTool: () => Promise.resolve({ ok: true }),
      close: () => Promise.resolve(),
    };
    return { client, transport };
  };
}

suite('McpConnectionService', () => {
  test('callTool_onUnconnectedServer_connectsFirst', async () => {
    const redirectCalls: URL[] = [];
    const service = new McpConnectionService(
      makeContext(),
      makeNeverConnectedClientPair({ requiresAuthOnce: false }),
      (_serverId: McpServerId) => Promise.resolve(makeFakeProvider(redirectCalls)),
    );

    assert.strictEqual(service.isConnected('atlassian'), false);
    const result = await service.callTool('atlassian', 'search', {});

    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(service.isConnected('atlassian'), true);
  });

  test('connect_twoConcurrentCallsForSameServer_opensOnlyOneBrowserWindow', async () => {
    const redirectCalls: URL[] = [];
    const service = new McpConnectionService(
      makeContext(),
      makeNeverConnectedClientPair({ requiresAuthOnce: true }),
      (_serverId: McpServerId) => Promise.resolve(makeFakeProvider(redirectCalls)),
    );

    await Promise.all([service.connect('github'), service.connect('github')]);

    assert.strictEqual(redirectCalls.length, 1);
    assert.strictEqual(service.isConnected('github'), true);
  });

  test('callTool_thrownError_isMappedThroughMcpErrorMapper', async () => {
    const redirectCalls: URL[] = [];
    const failingFactory: McpClientFactory = () => ({
      client: {
        connect: () => Promise.resolve(),
        callTool: () => Promise.reject({ status: 401, message: 'Token expired' }),
        close: () => Promise.resolve(),
      },
      transport: { finishAuth: () => Promise.resolve(), close: () => Promise.resolve() },
    });
    const service = new McpConnectionService(
      makeContext(),
      failingFactory,
      (_serverId: McpServerId) => Promise.resolve(makeFakeProvider(redirectCalls)),
    );

    await assert.rejects(
      service.callTool('atlassian', 'search', {}),
      {
        serverId: 'atlassian',
        category: 'auth-expired',
        detail: 'Token expired (endpoint: https://mcp.atlassian.com/v2/mcp; HTTP status: 401)',
      },
    );
  });

  test('disconnect_clearsStoredCredentials', async () => {
    const redirectCalls: URL[] = [];
    const context = makeContext();
    const service = new McpConnectionService(
      context,
      makeNeverConnectedClientPair({ requiresAuthOnce: false }),
      (_serverId: McpServerId) => Promise.resolve(makeFakeProvider(redirectCalls)),
    );

    await service.connect('atlassian');
    await (context.secrets as vscode.SecretStorage).store('devAssistant.mcp.atlassian.tokens', '{"access_token":"x"}');
    await service.disconnect('atlassian');

    assert.strictEqual(await context.secrets.get('devAssistant.mcp.atlassian.tokens'), undefined);
    assert.strictEqual(service.isConnected('atlassian'), false);
  });

  test('isConnected_reflectsState_withoutNetworkCall', async () => {
    const redirectCalls: URL[] = [];
    let factoryCalls = 0;
    const factory: McpClientFactory = (...args) => {
      factoryCalls += 1;
      return makeNeverConnectedClientPair({ requiresAuthOnce: false })(...args);
    };
    const service = new McpConnectionService(
      makeContext(),
      factory,
      (_serverId: McpServerId) => Promise.resolve(makeFakeProvider(redirectCalls)),
    );

    assert.strictEqual(service.isConnected('github'), false);
    assert.strictEqual(factoryCalls, 0);

    await service.connect('github');
    assert.strictEqual(service.isConnected('github'), true);
    assert.strictEqual(factoryCalls, 1);

    assert.strictEqual(service.isConnected('github'), true);
    assert.strictEqual(factoryCalls, 1);
  });

  test('connect_dcrRejected_propagatesAuthExpired_withoutFallback', async () => {
    const redirectCalls: URL[] = [];
    const rejectingFactory: McpClientFactory = () => ({
      client: {
        connect: () => Promise.reject({ status: 401, message: 'Dynamic client registration rejected' }),
        callTool: () => Promise.reject(new Error('should not be called')),
        close: () => Promise.resolve(),
      },
      transport: { finishAuth: () => Promise.resolve(), close: () => Promise.resolve() },
    });
    const service = new McpConnectionService(
      makeContext(),
      rejectingFactory,
      (_serverId: McpServerId) => Promise.resolve(makeFakeProvider(redirectCalls)),
    );

    await assert.rejects(
      service.connect('atlassian'),
      {
        serverId: 'atlassian',
        category: 'auth-expired',
        detail: 'Dynamic client registration rejected (endpoint: https://mcp.atlassian.com/v2/mcp; HTTP status: 401)',
      },
    );
    assert.strictEqual(service.isConnected('atlassian'), false);
    assert.strictEqual(redirectCalls.length, 0);
  });

  test('disconnect_thenConnect_buildsAFreshOAuthProvider_notTheEvictedOne', async () => {
    const redirectCalls: URL[] = [];
    let providerFactoryCalls = 0;
    const service = new McpConnectionService(
      makeContext(),
      makeNeverConnectedClientPair({ requiresAuthOnce: false }),
      (_serverId: McpServerId) => {
        providerFactoryCalls += 1;
        return Promise.resolve(makeFakeProvider(redirectCalls));
      },
    );

    await service.connect('atlassian');
    assert.strictEqual(providerFactoryCalls, 1);

    await service.disconnect('atlassian');
    await service.connect('atlassian');

    assert.strictEqual(providerFactoryCalls, 2);
  });
});
