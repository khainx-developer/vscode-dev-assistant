import * as assert from 'assert';
import * as vscode from 'vscode';
import { GitHubAuthService } from './auth';
import { GitHubClient } from './client';
import { GitHubConfigStore } from './configStore';
import { GitHubSession } from './types';

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

function fakeClient(overrides: { validateRepo?: boolean; validateAuthor?: boolean }): typeof GitHubClient {
  return {
    validateRepo: async () => overrides.validateRepo ?? true,
    validateAuthor: async () => overrides.validateAuthor ?? true,
    fetchOpenPullRequests: async () => [],
    getRateLimitStatus: async () => ({ remaining: 5000, resetAt: '' }),
  } as unknown as typeof GitHubClient;
}

suite('GitHubConfigStore', () => {
  let restore: () => void;

  teardown(() => {
    restore?.();
  });

  test('GitHubConfigStore_addRepo_rejectsBadFormat', async () => {
    ({ restore } = stubConfiguration({}));
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeClient({}));

    const result = await store.addRepo('not-valid');

    assert.deepStrictEqual(result, { ok: false, reason: 'Must be in the form owner/repo.' });
  });

  test('GitHubConfigStore_addRepo_rejectsDuplicate', async () => {
    ({ restore } = stubConfiguration({ monitoredRepos: ['owner/repo'] }));
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeClient({}));

    const result = await store.addRepo('owner/repo');

    assert.deepStrictEqual(result, { ok: false, reason: 'This repo is already monitored.' });
  });

  test('GitHubConfigStore_addRepo_rejectsWhenGitHubClientReturnsInvalid', async () => {
    ({ restore } = stubConfiguration({}));
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeClient({ validateRepo: false }));

    const result = await store.addRepo('owner/repo');

    assert.deepStrictEqual(result, { ok: false, reason: 'Repo not found or not accessible.' });
  });

  test('GitHubConfigStore_addRepo_persistsOnSuccess', async () => {
    const s = stubConfiguration({});
    restore = s.restore;
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeClient({ validateRepo: true }));

    const result = await store.addRepo('owner/repo');

    assert.deepStrictEqual(result, { ok: true });
    assert.deepStrictEqual(s.store.monitoredRepos, ['owner/repo']);
  });

  test('GitHubConfigStore_addAuthor_rejectsWhitespace', async () => {
    ({ restore } = stubConfiguration({}));
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeClient({}));

    const result = await store.addAuthor('bad name');

    assert.deepStrictEqual(result, { ok: false, reason: 'Must be a single username with no spaces.' });
  });

  test('GitHubConfigStore_addAuthor_rejectsSelf', async () => {
    ({ restore } = stubConfiguration({}));
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeClient({}));

    const result = await store.addAuthor('me');

    assert.deepStrictEqual(result, { ok: false, reason: "That's you — no need to add yourself." });
  });

  test('GitHubConfigStore_addAuthor_rejectsDuplicate', async () => {
    ({ restore } = stubConfiguration({ monitoredAuthors: ['octocat'] }));
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeClient({}));

    const result = await store.addAuthor('octocat');

    assert.deepStrictEqual(result, { ok: false, reason: 'This author is already monitored.' });
  });

  test('GitHubConfigStore_addAuthor_rejectsWhenGitHubClientReturnsInvalid', async () => {
    ({ restore } = stubConfiguration({}));
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeClient({ validateAuthor: false }));

    const result = await store.addAuthor('octocat');

    assert.deepStrictEqual(result, { ok: false, reason: 'GitHub user not found.' });
  });

  test('GitHubConfigStore_addAuthor_persistsOnSuccess', async () => {
    const s = stubConfiguration({});
    restore = s.restore;
    const session: GitHubSession = { username: 'me', accessToken: 't' };
    const store = new GitHubConfigStore(fakeAuthService(session), fakeClient({ validateAuthor: true }));

    const result = await store.addAuthor('octocat');

    assert.deepStrictEqual(result, { ok: true });
    assert.deepStrictEqual(s.store.monitoredAuthors, ['octocat']);
  });

  test('GitHubConfigStore_removeRepo_removesMatchingEntry', async () => {
    const s = stubConfiguration({ monitoredRepos: ['owner/repo', 'other/thing'] });
    restore = s.restore;
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeClient({}));

    await store.removeRepo('owner', 'repo');

    assert.deepStrictEqual(s.store.monitoredRepos, ['other/thing']);
  });

  test('GitHubConfigStore_removeAuthor_removesMatchingEntry', async () => {
    const s = stubConfiguration({ monitoredAuthors: ['octocat', 'other'] });
    restore = s.restore;
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeClient({}));

    await store.removeAuthor('octocat');

    assert.deepStrictEqual(s.store.monitoredAuthors, ['other']);
  });

  test('GitHubConfigStore_getConfig_parsesStoredStrings', async () => {
    ({ restore } = stubConfiguration({ monitoredRepos: ['owner/repo'], monitoredAuthors: ['octocat'] }));
    const store = new GitHubConfigStore(fakeAuthService(undefined), fakeClient({}));

    const config = store.getConfig();

    assert.deepStrictEqual(config, {
      monitoredRepos: [{ owner: 'owner', repo: 'repo' }],
      monitoredAuthors: [{ username: 'octocat' }],
    });
  });
});
