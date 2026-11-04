import * as assert from 'assert';
import * as vscode from 'vscode';
import { GitHubAuthService } from './auth';

suite('GitHubAuthService', () => {
  let originalGetSession: typeof vscode.authentication.getSession;

  setup(() => {
    originalGetSession = vscode.authentication.getSession;
  });

  teardown(() => {
    (vscode.authentication as any).getSession = originalGetSession;
  });

  test('GitHubAuthService_getSession_returnsUndefined_whenNoSessionAndCreateIfNoneFalse', async () => {
    (vscode.authentication as any).getSession = async () => undefined;

    const result = await new GitHubAuthService().getSession(false);

    assert.strictEqual(result, undefined);
  });

  test('GitHubAuthService_getSession_returnsMappedSession_whenSessionExists', async () => {
    (vscode.authentication as any).getSession = async () => ({
      id: 'session-id',
      accessToken: 'token-123',
      account: { id: 'account-id', label: 'octocat' },
      scopes: ['repo'],
    });

    const result = await new GitHubAuthService().getSession(true);

    assert.deepStrictEqual(result, { username: 'octocat', accessToken: 'token-123' });
  });

  test('GitHubAuthService_getSession_requestsRepoScope', async () => {
    let capturedScopes: readonly string[] | undefined;
    (vscode.authentication as any).getSession = async (
      _providerId: string,
      scopes: readonly string[],
    ) => {
      capturedScopes = scopes;
      return undefined;
    };

    await new GitHubAuthService().getSession(false);

    assert.deepStrictEqual(capturedScopes, ['repo']);
  });
});
