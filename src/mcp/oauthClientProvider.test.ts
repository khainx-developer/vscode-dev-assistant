import * as assert from 'assert';
import * as http from 'http';
import * as vscode from 'vscode';
import { createOAuthClientProvider } from './oauthClientProvider';
import { McpSecretTokenStore } from './secretTokenStore';

function makeContext(): vscode.ExtensionContext {
  const store = new Map<string, string>();
  return {
    secrets: {
      get: (key: string) => Promise.resolve(store.get(key)),
      store: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
      delete: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
    },
  } as unknown as vscode.ExtensionContext;
}

function get(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve();
    });
    req.on('error', reject);
  });
}

suite('createOAuthClientProvider', () => {
  test('clientMetadata_neverIncludesClientSecret', async () => {
    const provider = await createOAuthClientProvider('atlassian', new McpSecretTokenStore(makeContext(), 'atlassian'));

    assert.ok(!('client_secret' in provider.clientMetadata));
    assert.deepStrictEqual(provider.clientMetadata.redirect_uris, [provider.redirectUrl]);

    provider.authorizationResult.catch(() => undefined);
    await get(`${provider.redirectUrl}?error=cleanup`);
  });

  test('clientInformation_saveClientInformation_roundTripsThroughStore', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'atlassian');
    const provider = await createOAuthClientProvider('atlassian', store);
    const info = { client_id: 'abc' };

    await provider.saveClientInformation!(info);

    assert.deepStrictEqual(await provider.clientInformation(), info);

    provider.authorizationResult.catch(() => undefined);
    await get(`${provider.redirectUrl}?error=cleanup`);
  });

  test('tokens_saveTokens_roundTripsThroughStore', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'github');
    const provider = await createOAuthClientProvider('github', store);
    const tokens = { access_token: 'at', token_type: 'bearer' };

    await provider.saveTokens(tokens);

    assert.deepStrictEqual(await provider.tokens(), tokens);

    provider.authorizationResult.catch(() => undefined);
    await get(`${provider.redirectUrl}?error=cleanup`);
  });

  test('codeVerifier_saveCodeVerifier_roundTripsThroughStore', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'atlassian');
    const provider = await createOAuthClientProvider('atlassian', store);

    await provider.saveCodeVerifier('verifier-value');

    assert.strictEqual(await provider.codeVerifier(), 'verifier-value');

    provider.authorizationResult.catch(() => undefined);
    await get(`${provider.redirectUrl}?error=cleanup`);
  });

  test('redirectToAuthorization_callsOpenExternal_withExactUrl', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'atlassian');
    const provider = await createOAuthClientProvider('atlassian', store);
    const authUrl = new URL('https://auth.example.com/authorize?client_id=abc&state=xyz');

    const calls: vscode.Uri[] = [];
    const original = vscode.env.openExternal;
    (vscode.env as unknown as { openExternal: typeof vscode.env.openExternal }).openExternal = (uri: vscode.Uri) => {
      calls.push(uri);
      return Promise.resolve(true);
    };
    try {
      await provider.redirectToAuthorization!(authUrl);
    } finally {
      (vscode.env as unknown as { openExternal: typeof vscode.env.openExternal }).openExternal = original;
    }

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].toString(), vscode.Uri.parse(authUrl.toString()).toString());

    provider.authorizationResult.catch(() => undefined);
    await get(`${provider.redirectUrl}?error=cleanup`);
  });

  test('redirectToAuthorization_doesNotItselfParseOrFollowTheUrl', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'atlassian');
    const provider = await createOAuthClientProvider('atlassian', store);
    const authUrl = new URL('https://auth.example.com/authorize?client_id=abc&state=xyz');

    let receivedRawUri: vscode.Uri | undefined;
    const original = vscode.env.openExternal;
    (vscode.env as unknown as { openExternal: typeof vscode.env.openExternal }).openExternal = (uri: vscode.Uri) => {
      receivedRawUri = uri;
      return Promise.resolve(true);
    };
    try {
      await provider.redirectToAuthorization!(authUrl);
    } finally {
      (vscode.env as unknown as { openExternal: typeof vscode.env.openExternal }).openExternal = original;
    }

    assert.strictEqual(receivedRawUri?.query, 'client_id=abc&state=xyz');

    provider.authorizationResult.catch(() => undefined);
    await get(`${provider.redirectUrl}?error=cleanup`);
  });

  test('redirectUrl_returnsLoopbackServersUri_synchronously', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'atlassian');
    const provider = await createOAuthClientProvider('atlassian', store);

    assert.match(provider.redirectUrl as string, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    provider.authorizationResult.catch(() => undefined);
    await get(`${provider.redirectUrl}?error=cleanup`);
  });
});
