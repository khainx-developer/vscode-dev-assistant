import * as vscode from 'vscode';
import { GitHubViewController } from '../services/github/viewController';
import { JiraViewController } from '../services/jira/viewController';
import { buildAttentionInbox, type AttentionInboxItem } from '../services/attention/attentionInboxBuilder';
import { computeSnoozeUntil, isSnoozeOption, partitionSnoozed } from '../services/attention/snooze';
import { planNotifications } from '../services/attention/notificationPlanner';
import {
  deriveDashboardStatus,
  deriveGitHubConnection,
  deriveJiraConnection,
} from '../services/session/connectionState';
import { deriveSetupStatus } from '../services/session/setupStatus';
import { RefreshScheduler, type RefreshVisibilityHost } from '../infrastructure/github/refreshScheduler';
import type { GitHubIncomingMessage, GitHubOutgoingMessage, GitHubViewState } from '../shared/githubTypes';
import type { JiraIncomingMessage, JiraOutgoingMessage, JiraTask, JiraViewState } from '../shared/jiraTypes';
import type {
  DashboardCounts,
  HostEvent,
  InboxState,
  SessionCommand,
  SessionStatus,
} from '../shared/messages';
import type { AppServices } from './container';

/** A webview (sidebar or dashboard panel) attached to the session. */
export interface SessionSurface {
  readonly visible: boolean;
  postMessage(message: HostEvent): Thenable<boolean>;
}

/** Commands the session forwards to the AI coordinator (set after construction to avoid a cycle). */
export interface AiCommandHandler {
  handleCommand(message: SessionCommand): Promise<void> | void;
  replay(surface: SessionSurface): void;
  selectedModelName(): string | null;
}

const STALE_AFTER_MS = 60 * 1000;
const NOTIFICATIONS_SETTING = 'devMateKit.notifications.enabled';
const BACKGROUND_SETTING = 'devMateKit.refresh.background';
const MONITORING_SETTING = 'devMateKit.monitoring.enabled';
const PAUSED_MESSAGE = 'DevMate: Monitoring is paused. Resume to connect again.';

/** Commands that open a browser / update local prefs only — allowed while monitoring is paused. */
const PAUSED_ALLOWED_COMMANDS = new Set([
  'github.openPr',
  'github.openComment',
  'github.markRead',
  'jira.openTask',
  'jira.setCurrentUser',
  'jira.addTeamMember',
  'jira.removeTeamMember',
]);

/**
 * Single shared session for GitHub + Jira + the Attention Inbox, used by both the sidebar and
 * the dashboard panel. It owns exactly one GitHub controller and one Jira controller (which in
 * turn call the protected MCP/OAuth stack unchanged), merges their state into the inbox,
 * applies snoozes, and fans every update out to all attached webviews.
 */
export class DashboardSession implements vscode.Disposable {
  readonly github: GitHubViewController;
  readonly jira: JiraViewController;

  private githubState: GitHubViewState | null = null;
  private jiraState: JiraViewState | null = null;
  private allItems: AttentionInboxItem[] | null = null;
  private inboxState: InboxState = { items: null, snoozed: [], counts: emptyCounts() };
  private status: SessionStatus;
  private readonly surfaces = new Set<SessionSurface>();
  private refreshInFlight: Promise<void> | null = null;
  private lastFullRefreshAt = 0;
  private lastCompositeVisible = false;
  private aiHandler: AiCommandHandler | undefined;
  private readonly scheduler: RefreshScheduler;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly visibilityEmitter = new vscode.EventEmitter<void>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly newItemsEmitter = new vscode.EventEmitter<AttentionInboxItem[]>();

  /** Fires whenever inbox or connection status changes. */
  readonly onDidChange = this.changeEmitter.event;
  /** Fires after a background refresh finds inbox items that were not there before. */
  readonly onDidFindNewItems = this.newItemsEmitter.event;

  constructor(private readonly services: AppServices) {
    const host = { webview: { postMessage: (message: GitHubOutgoingMessage | JiraOutgoingMessage) => this.onControllerMessage(message) } };
    this.github = new GitHubViewController(
      services.context,
      host,
      services.githubAuth,
      services.githubConfig,
      services.mcp,
      services.lastSeen,
      services.commentReadState,
      services.pullRequestCache,
      services.output,
    );
    this.jira = new JiraViewController(
      host,
      services.jiraConnection,
      services.jiraConfig,
      services.mcp,
      services.commentReadState,
      services.pullRequestCache,
      services.output,
    );
    this.status = this.computeStatus();
    this.lastCompositeVisible = this.compositeVisible();
    this.scheduler = new RefreshScheduler(this.visibilityHost(), () => this.refreshAll({ notify: true }));

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(BACKGROUND_SETTING) || event.affectsConfiguration(MONITORING_SETTING)) {
          const wasVisible = this.lastCompositeVisible;
          this.fireVisibilityIfChanged();
          this.publishStatus();
          // Resuming (or turning background back on) should kick a refresh once the timer restarts.
          if (!wasVisible && this.lastCompositeVisible) void this.refreshAll({ notify: false });
        }
        if (event.affectsConfiguration('devMateKit.ai') || event.affectsConfiguration(NOTIFICATIONS_SETTING)) {
          this.publishStatus();
        }
      }),
    );
  }

  isMonitoringEnabled(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(MONITORING_SETTING, true);
  }

  async setMonitoringEnabled(enabled: boolean): Promise<void> {
    if (this.isMonitoringEnabled() === enabled) {
      this.publishStatus();
      return;
    }
    await vscode.workspace.getConfiguration('devMateKit.monitoring')
      .update('enabled', enabled, vscode.ConfigurationTarget.Global);
    // onDidChangeConfiguration handles scheduler + status; ensure a refresh on resume even if
    // the event races after we already flipped lastCompositeVisible.
    if (enabled) void this.refreshAll({ notify: false });
  }

  notifyPaused(): void {
    void vscode.window.showInformationMessage(PAUSED_MESSAGE, 'Resume').then((choice) => {
      if (choice === 'Resume') void this.setMonitoringEnabled(true);
    });
  }

  setAiHandler(handler: AiCommandHandler): void {
    this.aiHandler = handler;
  }

  // ── Surfaces ────────────────────────────────────────────────────────────

  attach(surface: SessionSurface): vscode.Disposable {
    this.surfaces.add(surface);
    this.fireVisibilityIfChanged();
    return new vscode.Disposable(() => {
      this.surfaces.delete(surface);
      this.fireVisibilityIfChanged();
    });
  }

  /** A surface finished loading (or became visible): replay state, refresh if stale. */
  surfaceReady(surface: SessionSurface): void {
    if (this.githubState) void surface.postMessage({ command: 'github.state', state: this.githubState });
    if (this.jiraState) void surface.postMessage({ command: 'jira.state', state: this.jiraState });
    void surface.postMessage({ command: 'dashboard.inboxState', state: this.inboxState });
    void surface.postMessage({ command: 'session.status', status: this.status });
    this.aiHandler?.replay(surface);
    this.refreshIfStale();
  }

  surfaceVisibilityChanged(surface: SessionSurface): void {
    this.fireVisibilityIfChanged();
    if (surface.visible) this.refreshIfStale();
  }

  broadcast(message: HostEvent): void {
    for (const surface of this.surfaces) {
      void surface.postMessage(message);
    }
  }

  // ── Read models ─────────────────────────────────────────────────────────

  getGitHubState(): GitHubViewState | null {
    return this.githubState;
  }

  getJiraState(): JiraViewState | null {
    return this.jiraState;
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  getInbox(): InboxState {
    return this.inboxState;
  }

  /** Active + snoozed items, for lookups by key (e.g. "explain this item"). */
  findItem(key: string): AttentionInboxItem | undefined {
    return (this.allItems ?? []).find((item) => item.key === key || item.key.split('|')[0] === key);
  }

  log(line: string): void {
    this.services.output.appendLine(line);
  }

  hasData(): boolean {
    return this.githubState !== null && this.jiraState !== null;
  }

  // ── Commands ────────────────────────────────────────────────────────────

  async handleCommand(message: SessionCommand): Promise<void> {
    const command = message.command;
    if (command === 'session.ready') return;
    if (command === 'settings.setMonitoring') {
      await this.setMonitoringEnabled(!!message.enabled);
      return;
    }
    if (command === 'settings.setNotifications') {
      await vscode.workspace.getConfiguration('devMateKit.notifications')
        .update('enabled', !!message.enabled, vscode.ConfigurationTarget.Global);
      this.publishStatus();
      return;
    }
    if (this.blocksWhilePaused(command)) {
      this.notifyPaused();
      return;
    }
    if (command === 'session.refreshAll') return this.refreshAll({ notify: false });
    if (command === 'attention.snooze') {
      if (!isSnoozeOption(message.option)) return;
      const now = Date.now();
      await this.services.attentionPrefs.snooze(message.key, computeSnoozeUntil(message.option, now), now);
      this.recompute();
      return;
    }
    if (command === 'attention.unsnooze') {
      await this.services.attentionPrefs.unsnooze(message.key, Date.now());
      this.recompute();
      return;
    }
    if (command.startsWith('ai.') || command.startsWith('settings.')) {
      await this.aiHandler?.handleCommand(message);
      return;
    }
    if (command.startsWith('github.')) {
      try {
        await this.github.handleMessage(message as GitHubIncomingMessage);
      } finally {
        this.jira.refreshPullRequestLinks();
      }
      return;
    }
    if (command.startsWith('jira.')) {
      await this.jira.handleMessage(message as JiraIncomingMessage);
    }
  }

  /** Refresh both providers in parallel; concurrent callers share one in-flight refresh. */
  refreshAll(options: { notify: boolean }): Promise<void> {
    if (!this.isMonitoringEnabled()) return Promise.resolve();
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      this.publishStatus();
      try {
        await Promise.all([this.github.refresh(), this.jira.refresh()]);
        this.jira.refreshPullRequestLinks();
        this.lastFullRefreshAt = Date.now();
      } finally {
        this.refreshInFlight = null;
        this.recompute();
        await this.updateNotificationBaseline(options.notify);
      }
    })();
    return this.refreshInFlight;
  }

  refreshIfStale(): void {
    if (!this.isMonitoringEnabled()) return;
    if (Date.now() - this.lastFullRefreshAt > STALE_AFTER_MS) void this.refreshAll({ notify: false });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private onControllerMessage(message: GitHubOutgoingMessage | JiraOutgoingMessage): Thenable<boolean> {
    if (message.command === 'github.state') this.githubState = message.state;
    if (message.command === 'jira.state') this.jiraState = message.state;
    this.broadcast(message);
    if (message.command === 'github.state' || message.command === 'jira.state') {
      this.recompute();
      if (!this.refreshInFlight && !this.anyControllerRefreshing()) {
        // Settle the baseline after user-driven changes (e.g. adding a repo) so the next
        // background refresh doesn't announce everything that change brought in.
        void this.updateNotificationBaseline(false);
      }
    }
    return Promise.resolve(true);
  }

  private recompute(): void {
    const now = Date.now();
    if (this.githubState && this.jiraState) {
      this.allItems = buildAttentionInbox(this.jiraState, this.githubState, now);
      const { active, snoozed } = partitionSnoozed(this.allItems, this.services.attentionPrefs.getSnoozes(now), now);
      this.inboxState = {
        items: active,
        snoozed,
        counts: { ...this.computeCounts(), attention: active.length, snoozed: snoozed.length },
      };
    } else {
      this.inboxState = { items: null, snoozed: [], counts: this.computeCounts() };
    }
    this.broadcast({ command: 'dashboard.inboxState', state: this.inboxState });
    this.publishStatus();
  }

  private publishStatus(): void {
    this.status = this.computeStatus();
    this.broadcast({ command: 'session.status', status: this.status });
    this.changeEmitter.fire();
  }

  private computeStatus(): SessionStatus {
    const github = deriveGitHubConnection(this.githubState);
    const jira = deriveJiraConnection(this.jiraState);
    const refreshTimes = [this.githubState?.lastRefreshAt, this.jiraState?.lastRefreshAt]
      .filter((value): value is string => !!value)
      .map((value) => Date.parse(value));
    return {
      github,
      jira,
      dashboard: deriveDashboardStatus(github, jira),
      setup: deriveSetupStatus(this.githubState, this.jiraState, {
        provider: this.services.aiConfig.getProvider(),
        modelName: this.aiHandler?.selectedModelName() ?? null,
      }),
      lastRefreshAt: refreshTimes.length ? new Date(Math.max(...refreshTimes)).toISOString() : null,
      isRefreshing: this.refreshInFlight !== null || this.anyControllerRefreshing(),
      notificationsEnabled: vscode.workspace.getConfiguration().get<boolean>(NOTIFICATIONS_SETTING, true),
      monitoringEnabled: this.isMonitoringEnabled(),
    };
  }

  private computeCounts(): DashboardCounts {
    const github = this.githubState;
    const myPrs = github?.authenticated ? github.attention.myPRs.length : 0;
    const teamPrs = github?.authenticated ? github.attention.teamPRs.length : 0;
    return { attention: 0, myPrs, teamPrs, myJira: myJiraTasks(this.jiraState).length, snoozed: 0 };
  }

  private anyControllerRefreshing(): boolean {
    return !!this.githubState?.isRefreshing || !!this.jiraState?.isRefreshing;
  }

  private async updateNotificationBaseline(notify: boolean): Promise<void> {
    if (!this.inboxState.items) return;
    const now = Date.now();
    const known = this.services.attentionPrefs.getKnownItems();
    const plan = planNotifications(known, this.inboxState.items, now);
    await this.services.attentionPrefs.setKnownItems(plan.nextKnown);
    if (notify && plan.newItems.length > 0) this.newItemsEmitter.fire(plan.newItems);
  }

  private blocksWhilePaused(command: string): boolean {
    if (this.isMonitoringEnabled()) return false;
    if (command === 'session.refreshAll') return true;
    if (command === 'ai.whatNext' || command === 'ai.explain' || command === 'ai.standup') return true;
    if (command.startsWith('github.') || command.startsWith('jira.')) {
      return !PAUSED_ALLOWED_COMMANDS.has(command);
    }
    return false;
  }

  private backgroundEnabled(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(BACKGROUND_SETTING, true);
  }

  private compositeVisible(): boolean {
    if (!this.isMonitoringEnabled()) return false;
    return this.backgroundEnabled() || [...this.surfaces].some((surface) => surface.visible);
  }

  private fireVisibilityIfChanged(): void {
    const visible = this.compositeVisible();
    if (visible !== this.lastCompositeVisible) {
      this.lastCompositeVisible = visible;
      this.visibilityEmitter.fire();
    }
  }

  /** The scheduler polls while any surface is visible, or always when background refresh is on. */
  private visibilityHost(): RefreshVisibilityHost {
    const isVisible = (): boolean => this.lastCompositeVisible;
    return {
      get visible() {
        return isVisible();
      },
      onDidChangeVisibility: this.visibilityEmitter.event,
    };
  }

  dispose(): void {
    this.scheduler.dispose();
    this.visibilityEmitter.dispose();
    this.changeEmitter.dispose();
    this.newItemsEmitter.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
    this.surfaces.clear();
  }
}

export function myJiraTasks(jira: JiraViewState | null): JiraTask[] {
  if (!jira?.connected) return [];
  const me = jira.currentUser?.trim().toLowerCase();
  const tasks = new Map<string, JiraTask>();
  for (const queryTasks of Object.values(jira.tasksByQuery)) {
    for (const task of queryTasks) {
      if (me && task.assignee?.trim().toLowerCase() !== me) continue;
      if (!tasks.has(task.key)) tasks.set(task.key, task);
    }
  }
  return [...tasks.values()];
}

function emptyCounts(): DashboardCounts {
  return { attention: 0, myPrs: 0, teamPrs: 0, myJira: 0, snoozed: 0 };
}
