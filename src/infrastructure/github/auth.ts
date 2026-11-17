import * as vscode from 'vscode';
import { GitHubSession } from '../../shared/githubTypes';

export class GitHubAuthService {
  async getSession(
    createIfNone: boolean,
    opts?: { forceNewSession?: boolean },
  ): Promise<GitHubSession | undefined> {
    const session = await vscode.authentication.getSession('github', ['repo'], {
      createIfNone,
      forceNewSession: opts?.forceNewSession,
    });
    if (!session) {
      return undefined;
    }
    return { username: session.account.label, accessToken: session.accessToken };
  }
}
