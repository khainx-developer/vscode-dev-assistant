import * as path from 'path';
import * as vscode from 'vscode';
import type { DashboardSession } from '../app/dashboardSession';
import { extractIssueKey } from '../services/jira/issueKey';
import { DashboardPanel } from './panels/DashboardPanel';

const SETTING = 'devMateKit.branchStatusBar.enabled';
const OPEN_COMMAND = 'devMateKit.openBranchTicket';

/** Minimal built-in git extension API (version 1) used for HEAD branch name only. */
interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    HEAD: { name?: string } | undefined;
    onDidChange: vscode.Event<void>;
  };
}

interface GitAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
}

interface GitExtensionExports {
  getAPI(version: 1): GitAPI;
}

/**
 * Status bar item showing the Jira key parsed from the active repo's HEAD branch.
 * Hidden when git is missing, there is no repo, or the branch has no key.
 */
export class BranchStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly repoWatchers = new Map<string, vscode.Disposable>();
  private api: GitAPI | null | undefined;
  private currentKey: string | undefined;

  constructor(
    private readonly session: DashboardSession,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.item = vscode.window.createStatusBarItem('devMateKit.branchTicket', vscode.StatusBarAlignment.Left, 49);
    this.item.name = 'DevMate Kit: Branch ticket';
    this.item.command = OPEN_COMMAND;
    this.disposables.push(
      this.item,
      vscode.commands.registerCommand(OPEN_COMMAND, () => this.open()),
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(SETTING)) this.update();
      }),
    );
    void this.ensureApi().then(() => this.update());
  }

  private async ensureApi(): Promise<GitAPI | null> {
    if (this.api !== undefined) return this.api;
    try {
      const extension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
      if (!extension) {
        this.api = null;
        return null;
      }
      const exports = extension.isActive ? extension.exports : await extension.activate();
      const api = exports.getAPI(1);
      this.api = api;
      this.disposables.push(
        api.onDidOpenRepository((repo) => {
          this.watchRepo(repo);
          this.update();
        }),
        api.onDidCloseRepository((repo) => {
          this.unwatchRepo(repo);
          this.update();
        }),
      );
      for (const repo of api.repositories) this.watchRepo(repo);
      return api;
    } catch {
      this.api = null;
      return null;
    }
  }

  private watchRepo(repo: GitRepository): void {
    const key = repo.rootUri.toString();
    if (this.repoWatchers.has(key)) return;
    this.repoWatchers.set(key, repo.state.onDidChange(() => this.update()));
  }

  private unwatchRepo(repo: GitRepository): void {
    const key = repo.rootUri.toString();
    this.repoWatchers.get(key)?.dispose();
    this.repoWatchers.delete(key);
  }

  private update(): void {
    try {
      const enabled = vscode.workspace.getConfiguration().get<boolean>(SETTING, true);
      if (!enabled) {
        this.currentKey = undefined;
        this.item.hide();
        return;
      }

      const api = this.api;
      if (!api || api.repositories.length === 0) {
        this.currentKey = undefined;
        this.item.hide();
        return;
      }

      const repo = this.pickRepository(api);
      const branch = repo?.state.HEAD?.name;
      const key = branch ? extractIssueKey(branch) : undefined;
      this.currentKey = key;

      if (!key || !branch) {
        this.item.hide();
        return;
      }

      this.item.text = key;
      this.item.tooltip = `DevMate Kit: ${branch}`;
      this.item.accessibilityInformation = { label: `Jira ticket ${key} from branch ${branch}` };
      this.item.show();
    } catch {
      this.currentKey = undefined;
      try {
        this.item.hide();
      } catch {
        // never throw from the status bar
      }
    }
  }

  /** Repo containing the active editor's file, else the first repository. */
  private pickRepository(api: GitAPI): GitRepository | undefined {
    const repos = api.repositories;
    if (repos.length === 0) return undefined;
    const file = vscode.window.activeTextEditor?.document.uri;
    if (file && file.scheme === 'file') {
      const filePath = file.fsPath;
      let best: GitRepository | undefined;
      let bestLen = -1;
      for (const repo of repos) {
        const root = repo.rootUri.fsPath;
        if (isPathInside(root, filePath) && root.length > bestLen) {
          best = repo;
          bestLen = root.length;
        }
      }
      if (best) return best;
    }
    return repos[0];
  }

  private open(): void {
    try {
      const key = this.currentKey;
      if (!key) return;

      if (this.keyInInbox(key)) {
        DashboardPanel.createOrShow(this.extensionUri, this.session);
        return;
      }

      const siteUrl = this.configuredSiteUrl();
      if (siteUrl) {
        void vscode.env.openExternal(vscode.Uri.parse(`${siteUrl}/browse/${key}`));
        return;
      }

      // No configured site — open the dashboard.
      DashboardPanel.createOrShow(this.extensionUri, this.session);
    } catch {
      // never throw
    }
  }

  private keyInInbox(key: string): boolean {
    const items = this.session.getInbox().items;
    if (!items) return false;
    const upper = key.toUpperCase();
    return items.some((item) => item.jiraTask?.key.toUpperCase() === upper);
  }

  private configuredSiteUrl(): string | undefined {
    const fromState = this.session.getJiraState()?.siteUrl?.trim();
    const raw = fromState
      || vscode.workspace.getConfiguration('devMateKit.jira').get<string>('siteUrl', '').trim();
    if (!raw) return undefined;
    return raw.replace(/\/+$/, '');
  }

  dispose(): void {
    for (const watcher of this.repoWatchers.values()) watcher.dispose();
    this.repoWatchers.clear();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

function isPathInside(root: string, filePath: string): boolean {
  const normalizedFile = path.normalize(filePath);
  const normalizedRoot = path.normalize(root);
  if (process.platform === 'win32') {
    const fileLower = normalizedFile.toLowerCase();
    const rootLower = normalizedRoot.toLowerCase();
    const prefix = rootLower.endsWith(path.sep) ? rootLower : rootLower + path.sep;
    return fileLower === rootLower || fileLower.startsWith(prefix);
  }
  const prefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(prefix);
}
