import * as assert from 'assert';
import * as vscode from 'vscode';
import { AtlassianMcpAdapter } from './atlassianMcpAdapter';
import { JiraConnectionStore } from './connectionStore';
import type { McpConnectionService } from '../mcp/connectionService';

const VALID_SITE_URL = 'https://example.atlassian.net';

function stubConfiguration(initial: { siteUrl?: string; siteId?: string } = {}) {
  const settings: Record<string, string> = {
    siteUrl: initial.siteUrl ?? '',
    siteId: initial.siteId ?? '',
  };
  const original = vscode.workspace.getConfiguration;
  const workspace = vscode.workspace as unknown as {
    getConfiguration: typeof vscode.workspace.getConfiguration;
  };
  workspace.getConfiguration = ((section?: string) => {
    if (section !== 'devMateKit.jira') {
      return original.call(vscode.workspace, section);
    }
    return {
      get: (key: string, defaultValue: string) => settings[key] ?? defaultValue,
      update: async (key: string, value: unknown) => {
        settings[key] = String(value);
      },
    } as unknown as vscode.WorkspaceConfiguration;
  }) as typeof vscode.workspace.getConfiguration;

  return {
    settings,
    restore: () => {
      workspace.getConfiguration = original;
    },
  };
}

function fakeContext(secretStore: Map<string, string>): vscode.ExtensionContext {
  return {
    secrets: {
      get: async (key: string) => secretStore.get(key),
      store: async (key: string, value: string) => {
        secretStore.set(key, value);
      },
      delete: async (key: string) => {
        secretStore.delete(key);
      },
    },
  } as unknown as vscode.ExtensionContext;
}

function fakeConnectionService(opts: { connectThrows?: Error } = {}): {
  service: McpConnectionService;
  connectCalls: string[];
  disconnectCalls: string[];
} {
  const connectCalls: string[] = [];
  const disconnectCalls: string[] = [];
  const service = {
    connect: async (serverId: string) => {
      connectCalls.push(serverId);
      if (opts.connectThrows) {
        throw opts.connectThrows;
      }
    },
    disconnect: async (serverId: string) => {
      disconnectCalls.push(serverId);
    },
  } as unknown as McpConnectionService;
  return { service, connectCalls, disconnectCalls };
}

suite('JiraConnectionStore', () => {
  let restoreConfiguration: (() => void) | undefined;
  let originalValidateConnection: typeof AtlassianMcpAdapter.validateConnection;

  setup(() => {
    originalValidateConnection = AtlassianMcpAdapter.validateConnection;
  });

  teardown(() => {
    restoreConfiguration?.();
    restoreConfiguration = undefined;
    AtlassianMcpAdapter.validateConnection = originalValidateConnection;
  });

  test('getConnection_emptySettings_returnsUndefined', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const { service } = fakeConnectionService();
    const store = new JiraConnectionStore(fakeContext(new Map()), service);

    assert.strictEqual(await store.getConnection(), undefined);
  });

  test('getConnection_bothSettingsPresent_returnsConnection', async () => {
    const configuration = stubConfiguration({ siteUrl: VALID_SITE_URL, siteId: 'cloud-1' });
    restoreConfiguration = configuration.restore;
    const { service } = fakeConnectionService();
    const store = new JiraConnectionStore(fakeContext(new Map()), service);

    assert.deepStrictEqual(await store.getConnection(), { siteUrl: VALID_SITE_URL, siteId: 'cloud-1' });
  });

  test('saveConnection_invalidUrl_returnsFailure_withoutCallingConnectionService', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const { service, connectCalls } = fakeConnectionService();
    const store = new JiraConnectionStore(fakeContext(new Map()), service);

    const result = await store.saveConnection('http://example.com');

    assert.deepStrictEqual(result, { ok: false, reason: 'Site URL must start with https://.' });
    assert.strictEqual(connectCalls.length, 0);
  });

  test('saveConnection_validUrlAndMatchingSite_persistsAndReturnsOk', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const { service } = fakeConnectionService();
    AtlassianMcpAdapter.validateConnection = async () => ({ ok: true, siteId: 'cloud-1' });
    const store = new JiraConnectionStore(fakeContext(new Map()), service);

    const result = await store.saveConnection(VALID_SITE_URL);

    assert.deepStrictEqual(result, { ok: true });
    assert.deepStrictEqual(configuration.settings, { siteUrl: VALID_SITE_URL, siteId: 'cloud-1' });
  });

  test('saveConnection_validUrlNoMatchingSite_returnsFailure_withoutDisconnecting', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const { service, disconnectCalls } = fakeConnectionService();
    AtlassianMcpAdapter.validateConnection = async () => ({
      ok: false,
      reason: 'Could not find an accessible Jira site at that URL.',
    });
    const store = new JiraConnectionStore(fakeContext(new Map()), service);

    const result = await store.saveConnection(VALID_SITE_URL);

    assert.deepStrictEqual(result, { ok: false, reason: 'Could not find an accessible Jira site at that URL.' });
    assert.strictEqual(disconnectCalls.length, 0);
    assert.deepStrictEqual(configuration.settings, { siteUrl: '', siteId: '' });
  });

  test('clearConnection_clearsSettings_disconnects_andDeletesLegacySecret', async () => {
    const configuration = stubConfiguration({ siteUrl: VALID_SITE_URL, siteId: 'cloud-1' });
    restoreConfiguration = configuration.restore;
    const { service, disconnectCalls } = fakeConnectionService();
    const secretStore = new Map([['devMateKit.jira.apiToken', 'legacy-token']]);
    const store = new JiraConnectionStore(fakeContext(secretStore), service);

    await store.clearConnection();

    assert.deepStrictEqual(configuration.settings, { siteUrl: '', siteId: '' });
    assert.deepStrictEqual(disconnectCalls, ['atlassian']);
    assert.strictEqual(secretStore.has('devMateKit.jira.apiToken'), false);
  });

  test('saveConnection_onSuccess_deletesLegacySecretIfPresent', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const { service } = fakeConnectionService();
    AtlassianMcpAdapter.validateConnection = async () => ({ ok: true, siteId: 'cloud-1' });
    const secretStore = new Map([['devMateKit.jira.apiToken', 'legacy-token']]);
    const store = new JiraConnectionStore(fakeContext(secretStore), service);

    await store.saveConnection(VALID_SITE_URL);

    assert.strictEqual(secretStore.has('devMateKit.jira.apiToken'), false);
  });
});
