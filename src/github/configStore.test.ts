import * as assert from 'assert';
import * as vscode from 'vscode';
import { GitHubAuthService } from './auth';
import { GithubMcpAdapter } from './githubMcpAdapter';
import { GitHubConfigStore } from './configStore';
import { GitHubSession } from './types';
import type { McpConnectionService } from '../mcp/connectionService';

function stubConfiguration(initial: { monitoredRepos?: string[]; monitoredAuthors?: string[] }) {
  const store: Record<string, string[]> = {
    monitoredRepos: initial.monitoredRepos ?? [],
    monitoredAuthors: initial.monitoredAuthors ?? [],
  };
  const original = vscode.workspace.getConfiguration;
  (vscode.workspace as any).getConfiguration = (section?: string) => {
    if (section !== 'devAssistant.github') {
      return original.call(vscode.workspace, section);
    }
    return {
      get: (key: string, defaultValue: string[]) => store[key] ?? defaultValue,
      update: async (key: string, value: string[]) => {
        store[key] = value;
      },
    } as unknown as vscode.WorkspaceConfiguration;
  };
  return { store, restore: () => ((vscode.workspace as any).getConfiguration = original) };
}

function fakeAuthService(session: GitHubSession | undefined): GitHubAuthService {
  return { getSession: async () => session } as unknown as GitHubAuthService;
}

const fakeConnectionService = {} as unknown as McpConnectionService;

suite('GitHubConfigStore', () => {
  let restore: () => void;
  let originalValidateRepo: typeof GithubMcpAdapter.validateRepo;
  let originalValidateAuthor: typeof GithubMcpAdapter.validateAuthor;

  setup(() => {
    originalValidateRepo = GithubMcpAdapter.validateRepo;
    originalValidateAuthor = GithubMcpAdapter.validateAuthor;
  });

  teardown(() => {
    restore?.();
    GithubMcpAdapter.validateRepo = originalValidateRepo;
    GithubMcpAdapter.validateAuthor = originalValidateAuthor;
  });

  test('addRepo_invalidFormat_returnsFailure', async () => {
    ({ restore } = stubConfiguration({}));
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeConnectionService);

    const result = await store.addRepo('not-valid');

    assert.deepStrictEqual(result, { ok: false, reason: 'Must be in the form owner/repo.' });
  });

  test('addRepo_duplicate_returnsFailure', async () => {
    ({ restore } = stubConfiguration({ monitoredRepos: ['owner/repo'] }));
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeConnectionService);

    const result = await store.addRepo('owner/repo');

    assert.deepStrictEqual(result, { ok: false, reason: 'This repo is already monitored.' });
  });

  test('addRepo_notSignedIn_returnsFailure', async () => {
    ({ restore } = stubConfiguration({}));
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeConnectionService);

    const result = await store.addRepo('owner/repo');

    assert.deepStrictEqual(result, { ok: false, reason: 'Sign in with GitHub first.' });
  });

  test('GitHubConfigStore_addRepo_rejectsWhenAdapterReturnsInvalid', async () => {
    ({ restore } = stubConfiguration({}));
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    GithubMcpAdapter.validateRepo = async () => false;
    const store = new GitHubConfigStore(fakeAuthService(session), fakeConnectionService);

    const result = await store.addRepo('owner/repo');

    assert.deepStrictEqual(result, { ok: false, reason: 'Repo not found or not accessible.' });
  });

  test('addRepo_validRepo_callsAdapterAndPersists', async () => {
    const s = stubConfiguration({});
    restore = s.restore;
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const calls: Array<{ connectionService: McpConnectionService }> = [];
    GithubMcpAdapter.validateRepo = async (connectionService) => {
      calls.push({ connectionService });
      return true;
    };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeConnectionService);

    const result = await store.addRepo('owner/repo');

    assert.deepStrictEqual(result, { ok: true });
    assert.deepStrictEqual(s.store.monitoredRepos, ['owner/repo']);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].connectionService, fakeConnectionService);
  });

  test('GitHubConfigStore_addAuthor_rejectsWhitespace', async () => {
    ({ restore } = stubConfiguration({}));
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeConnectionService);

    const result = await store.addAuthor('bad name');

    assert.deepStrictEqual(result, { ok: false, reason: 'Must be a single username with no spaces.' });
  });

  test('addAuthor_selfAdd_returnsFailure', async () => {
    ({ restore } = stubConfiguration({}));
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeConnectionService);

    const result = await store.addAuthor('me');

    assert.deepStrictEqual(result, { ok: false, reason: "That's you — no need to add yourself." });
  });

  test('GitHubConfigStore_addAuthor_rejectsDuplicate', async () => {
    ({ restore } = stubConfiguration({ monitoredAuthors: ['octocat'] }));
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeConnectionService);

    const result = await store.addAuthor('octocat');

    assert.deepStrictEqual(result, { ok: false, reason: 'This author is already monitored.' });
  });

  test('GitHubConfigStore_addAuthor_rejectsWhenAdapterReturnsInvalid', async () => {
    ({ restore } = stubConfiguration({}));
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    GithubMcpAdapter.validateAuthor = async () => false;
    const store = new GitHubConfigStore(fakeAuthService(session), fakeConnectionService);

    const result = await store.addAuthor('octocat');

    assert.deepStrictEqual(result, { ok: false, reason: 'GitHub user not found.' });
  });

  test('addAuthor_validAuthor_callsAdapterAndPersists', async () => {
    const s = stubConfiguration({});
    restore = s.restore;
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const calls: Array<{ connectionService: McpConnectionService }> = [];
    GithubMcpAdapter.validateAuthor = async (connectionService) => {
      calls.push({ connectionService });
      return true;
    };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeConnectionService);

    const result = await store.addAuthor('octocat');

    assert.deepStrictEqual(result, { ok: true });
    assert.deepStrictEqual(s.store.monitoredAuthors, ['octocat']);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].connectionService, fakeConnectionService);
  });

  test('GitHubConfigStore_removeRepo_removesMatchingEntry', async () => {
    const s = stubConfiguration({ monitoredRepos: ['owner/repo', 'other/thing'] });
    restore = s.restore;
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeConnectionService);

    await store.removeRepo('owner', 'repo');

    assert.deepStrictEqual(s.store.monitoredRepos, ['other/thing']);
  });

  test('GitHubConfigStore_removeAuthor_removesMatchingEntry', async () => {
    const s = stubConfiguration({ monitoredAuthors: ['octocat', 'other'] });
    restore = s.restore;
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeConnectionService);

    await store.removeAuthor('octocat');

    assert.deepStrictEqual(s.store.monitoredAuthors, ['other']);
  });

  test('GitHubConfigStore_getConfig_parsesStoredStrings', async () => {
    ({ restore } = stubConfiguration({ monitoredRepos: ['owner/repo'], monitoredAuthors: ['octocat'] }));
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeConnectionService);

    const config = store.getConfig();

    assert.deepStrictEqual(config, {
      monitoredRepos: [{ owner: 'owner', repo: 'repo' }],
      monitoredAuthors: [{ username: 'octocat' }],
    });
  });
});
