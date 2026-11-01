import * as assert from 'assert';
import * as vscode from 'vscode';
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

suite('McpSecretTokenStore', () => {
  test('getClientInformation_whenUnset_returnsUndefined', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'atlassian');
    assert.strictEqual(await store.getClientInformation(), undefined);
  });

  test('saveClientInformation_thenGet_roundTrips', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'atlassian');
    const info = { clientId: 'abc', clientSecret: 'xyz' };

    await store.saveClientInformation(info);

    assert.deepStrictEqual(await store.getClientInformation(), info);
  });

  test('getTokens_whenUnset_returnsUndefined', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'github');
    assert.strictEqual(await store.getTokens(), undefined);
  });

  test('saveTokens_thenGet_roundTrips', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'github');
    const tokens = { accessToken: 'at', refreshToken: 'rt' };

    await store.saveTokens(tokens);

    assert.deepStrictEqual(await store.getTokens(), tokens);
  });

  test('getCodeVerifier_whenUnset_returnsUndefined', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'atlassian');
    assert.strictEqual(await store.getCodeVerifier(), undefined);
  });

  test('saveCodeVerifier_thenGet_roundTrips', async () => {
    const store = new McpSecretTokenStore(makeContext(), 'atlassian');

    await store.saveCodeVerifier('verifier-value');

    assert.strictEqual(await store.getCodeVerifier(), 'verifier-value');
  });

  test('clear_removesAllThreeKeys_forThisServerOnly', async () => {
    const context = makeContext();
    const atlassian = new McpSecretTokenStore(context, 'atlassian');
    const github = new McpSecretTokenStore(context, 'github');

    await atlassian.saveClientInformation({ clientId: 'a' });
    await atlassian.saveTokens({ accessToken: 'a' });
    await atlassian.saveCodeVerifier('a-verifier');
    await github.saveClientInformation({ clientId: 'g' });
    await github.saveTokens({ accessToken: 'g' });
    await github.saveCodeVerifier('g-verifier');

    await atlassian.clear();

    assert.strictEqual(await atlassian.getClientInformation(), undefined);
    assert.strictEqual(await atlassian.getTokens(), undefined);
    assert.strictEqual(await atlassian.getCodeVerifier(), undefined);
    assert.deepStrictEqual(await github.getClientInformation(), { clientId: 'g' });
    assert.deepStrictEqual(await github.getTokens(), { accessToken: 'g' });
    assert.strictEqual(await github.getCodeVerifier(), 'g-verifier');
  });
});
