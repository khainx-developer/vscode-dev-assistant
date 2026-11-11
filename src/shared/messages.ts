import type { AttentionInboxItem } from '../services/attention/attentionInboxBuilder';
import type { SnoozeOption } from '../services/attention/snooze';
import type { AiProvider, ChatModelInfo } from '../services/ai/aiSettings';
import type {
  DashboardStatus,
  GitHubConnectionState,
  JiraConnectionState,
} from '../services/session/connectionState';
import type { SetupStatus, SetupStepId } from '../services/session/setupStatus';
import type { GitHubIncomingMessage, GitHubOutgoingMessage } from './githubTypes';
import type { JiraIncomingMessage, JiraOutgoingMessage } from './jiraTypes';

/**
 * Webview ↔ extension-host message contracts.
 *
 * Commands (webview → host) express intent; events (host → webview) push read models. Each
 * surface has one router (`DashboardSession.handleCommand` plus a few surface-local commands).
 */

export type SidebarTab = 'home' | 'tools' | 'setup';

// ── Commands ────────────────────────────────────────────────────────────────

export type SessionCommand =
  | GitHubIncomingMessage
  | JiraIncomingMessage
  | { command: 'session.ready' }
  | { command: 'session.refreshAll' }
  | { command: 'attention.snooze'; key: string; option: SnoozeOption }
  | { command: 'attention.unsnooze'; key: string }
  | { command: 'ai.whatNext' }
  | { command: 'ai.explain'; key: string }
  | { command: 'ai.standup' }
  | { command: 'ai.cancel' }
  | { command: 'ai.dismiss' }
  | { command: 'ai.copy' }
  | { command: 'ai.setProvider'; provider: AiProvider }
  | { command: 'ai.setModel'; modelId: string }
  | { command: 'ai.loadModels' }
  | { command: 'settings.setNotifications'; enabled: boolean };

export type SurfaceCommand =
  | { command: 'nav.openDashboard' }
  | { command: 'nav.openSetup'; step?: SetupStepId }
  | { command: 'nav.openTool'; toolId: string }
  | { command: 'nav.openSettings' };

export type WebviewCommand = SessionCommand | SurfaceCommand;

// ── Events / read models ────────────────────────────────────────────────────

export interface SnoozedItemView {
  item: AttentionInboxItem;
  snoozeKey: string;
  until: number;
}

export interface DashboardCounts {
  attention: number;
  myPrs: number;
  teamPrs: number;
  myJira: number;
  snoozed: number;
}

export interface InboxState {
  /** `null` until both providers have reported at least once. */
  items: AttentionInboxItem[] | null;
  snoozed: SnoozedItemView[];
  counts: DashboardCounts;
}

export interface SessionStatus {
  github: GitHubConnectionState;
  jira: JiraConnectionState;
  dashboard: DashboardStatus;
  setup: SetupStatus;
  lastRefreshAt: string | null;
  isRefreshing: boolean;
  notificationsEnabled: boolean;
}

export type AiRunKind = 'whatNext' | 'explain' | 'standup';

export interface AiRunState {
  id: number;
  kind: AiRunKind;
  title: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  text: string;
  error?: string;
  /** Set when the error can be fixed in Setup (AI off / no models). */
  setupHint?: boolean;
  modelName?: string;
}

export interface AiViewState {
  provider: AiProvider;
  supported: boolean;
  selectedModelId: string | null;
  /** `null` until the user asks for the list (VS Code wants model access to be user-initiated). */
  models: ChatModelInfo[] | null;
  modelsLoading: boolean;
  run: AiRunState | null;
}

export type SessionEvent =
  | GitHubOutgoingMessage
  | JiraOutgoingMessage
  | { command: 'dashboard.inboxState'; state: InboxState }
  | { command: 'session.status'; status: SessionStatus }
  | { command: 'ai.state'; state: AiViewState };

export type SurfaceEvent =
  | { command: 'nav.showTab'; tab: SidebarTab; step?: SetupStepId };

export type HostEvent = SessionEvent | SurfaceEvent;
