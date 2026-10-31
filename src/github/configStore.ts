import * as vscode from 'vscode';
import { GitHubAuthService } from './auth';
import { GitHubClient } from './client';
import { GitHubExtensionConfig } from './types';

const REPO_FORMAT = /^([^/\s]+)\/([^/\s]+)$/;

export class GitHubConfigStore {
  constructor(
    private readonly authService: GitHubAuthService,
    private readonly client: typeof GitHubClient,
  ) {}

  getConfig(): GitHubExtensionConfig {
    const cfg = vscode.workspace.getConfiguration('devAssistant.github');
    const repos = cfg.get<string[]>('monitoredRepos', []);
    const authors = cfg.get<string[]>('monitoredAuthors', []);

    return {
      monitoredRepos: repos.map((value) => {
        const [owner, repo] = value.split('/');
        return { owner, repo };
      }),
      monitoredAuthors: authors.map((username) => ({ username })),
    };
  }

  async addRepo(value: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const match = REPO_FORMAT.exec(value.trim());
    if (!match) {
      return { ok: false, reason: 'Must be in the form owner/repo.' };
    }

    const [, owner, repo] = match;
    const current = this.getConfig().monitoredRepos;
    if (current.some((r) => r.owner === owner && r.repo === repo)) {
      return { ok: false, reason: 'This repo is already monitored.' };
    }

    const session = await this.authService.getSession(true);
    if (!session) {
      return { ok: false, reason: 'Sign in with GitHub first.' };
    }
    const valid = await this.client.validateRepo({ owner, repo }, session);
    if (!valid) {
      return { ok: false, reason: 'Repo not found or not accessible.' };
    }

    const cfg = vscode.workspace.getConfiguration('devAssistant.github');
    const stored = cfg.get<string[]>('monitoredRepos', []);
    await cfg.update('monitoredRepos', [...stored, value], vscode.ConfigurationTarget.Global);
    return { ok: true };
  }

  async addAuthor(value: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const username = value.trim();
    if (username === '' || /\s/.test(username)) {
      return { ok: false, reason: 'Must be a single username with no spaces.' };
    }

    const session = await this.authService.getSession(true);
    if (!session) {
      return { ok: false, reason: 'Sign in with GitHub first.' };
    }
    if (session.username === username) {
      return { ok: false, reason: "That's you — no need to add yourself." };
    }

    const current = this.getConfig().monitoredAuthors;
    if (current.some((a) => a.username === username)) {
      return { ok: false, reason: 'This author is already monitored.' };
    }

    const valid = await this.client.validateAuthor({ username }, session);
    if (!valid) {
      return { ok: false, reason: 'GitHub user not found.' };
    }

    const cfg = vscode.workspace.getConfiguration('devAssistant.github');
    const stored = cfg.get<string[]>('monitoredAuthors', []);
    await cfg.update('monitoredAuthors', [...stored, value], vscode.ConfigurationTarget.Global);
    return { ok: true };
  }

  async removeRepo(owner: string, repo: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('devAssistant.github');
    const stored = cfg.get<string[]>('monitoredRepos', []);
    const filtered = stored.filter((value) => value !== `${owner}/${repo}`);
    await cfg.update('monitoredRepos', filtered, vscode.ConfigurationTarget.Global);
  }

  async removeAuthor(username: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('devAssistant.github');
    const stored = cfg.get<string[]>('monitoredAuthors', []);
    const filtered = stored.filter((value) => value !== username);
    await cfg.update('monitoredAuthors', filtered, vscode.ConfigurationTarget.Global);
  }
}
