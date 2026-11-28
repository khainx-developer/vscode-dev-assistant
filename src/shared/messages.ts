import type { ActionKind, AnalysisConfidence, Finding } from '../services/analysis/types';
import type { AttentionInboxItem } from '../services/attention/attentionInboxBuilder';
import type { SnoozeOption } from '../services/attention/snooze';
import type { AiEnableProvider, AiProvider, ChatModelInfo } from '../services/ai/aiSettings';
import type {
  DashboardStatus,
  GitHubConnectionState,
  JiraConnectionState,
} from '../services/session/connectionState';
import type { SetupStatus, SetupStepId } from '../services/session/setupStatus';
import type { GitHubIncomingMessage, GitHubOutgoingMessage } from './githubTypes';
import type { JiraIncomingMessage, JiraOutgoingMessage } from './jiraTypes';

/** Card-ready analysis action: AI fields plus engine-resolved link and handoff. */
export interface AnalysisActionView {
  kind: ActionKind;
  title: string;
  detail?: string;
  findings?: Finding[];
  draft?: string;
  checklist?: string[];
  link?: string;
  openLabel?: string;
  handoffPrompt?: string;
}

/** Analysis payload shaped for the Attention card UI. */
export interface AnalysisView {
  itemKey: string;
  stateHash: string;
  situation: string;
  confidence: AnalysisConfidence;
  actions: AnalysisActionView[];
  analyzedAt: string;
}

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
  | { command: 'analysis.run'; key: string }
  | { command: 'analysis.copyText'; text: string }
  | { command: 'analysis.openLink'; url: string }
  | { command: 'ai.reviewInChat'; key: string; template?: string }
  | { command: 'ai.chat.send'; key: string; text: string }
  | { command: 'ai.chat.clear'; key: string }
  | { command: 'ai.standup' }
  | { command: 'ai.cancel' }
  | { command: 'ai.dismiss' }
  | { command: 'ai.copy' }
  | { command: 'ai.setProvider'; provider: AiProvider }
  | { command: 'ai.setModel'; modelId: string }
  | { command: 'ai.loadModels' }
  | { command: 'ai.cliTerminal'; action: 'install' | 'login' }
  | { command: 'settings.setNotifications'; enabled: boolean }
  | { command: 'settings.setMonitoring'; enabled: boolean }
  | {
      command: 'settings.setWorkingHours';
      enabled?: boolean;
      days?: Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'>;
      start?: string;
      end?: string;
    };

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
  /**
   * Effective monitoring: manual toggle AND (when configured) inside working hours.
   * False means no refresh / no GitHub or Jira network.
   */
  monitoringEnabled: boolean;
  /** Raw `devMateKit.monitoring.enabled` — used by the Sleep/Wake control. */
  monitoringManuallyEnabled: boolean;
  /** Working-hours schedule from settings (defaults applied). */
  workingHours: {
    enabled: boolean;
    days: Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'>;
    start: string;
    end: string;
  };
}

export type AiRunKind = 'whatNext' | 'standup';

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

/** One turn in a per-card chatbox thread (in-memory only). */
export interface AiChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface AiCardThread {
  key: string;
  messages: AiChatMessage[];
  status: 'idle' | 'running' | 'error';
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
  /** Per-card chatbox threads keyed by inbox item key. */
  threads: Record<string, AiCardThread>;
  /** Cursor Agent CLI detected on PATH. */
  cliAvailable: boolean;
  /** CLI present and logged in / CURSOR_API_KEY set. */
  cliAuthenticated: boolean;
  /**
   * Suggestion-only: host vscode.lm models are empty/unsupported.
   * Never auto-switches provider — the webview CTA must post `ai.setProvider`.
   * Always false outside Cursor (CLI backend is Cursor-only in the UI).
   */
  suggestCursorCli: boolean;
  /**
   * Host-aware backend for enable-from-off (VS Code → vscodeLm, Cursor → cursorCli).
   * Does not change a persisted `none`; webviews use this only when turning AI on.
   */
  defaultEnableProvider: AiEnableProvider;
  /** True when `vscode.env.appName` looks like Cursor — gates Cursor Agent CLI UI. */
  cursorHost: boolean;
}

export type SessionEvent =
  | GitHubOutgoingMessage
  | JiraOutgoingMessage
  | { command: 'dashboard.inboxState'; state: InboxState }
  | { command: 'session.status'; status: SessionStatus }
  | { command: 'ai.state'; state: AiViewState }
  | { command: 'analysis.analyzing'; key: string }
  | { command: 'analysis.result'; key: string; analysis: AnalysisView }
  | { command: 'analysis.unavailable'; key: string; reason?: string };

export type SurfaceEvent =
  | { command: 'nav.showTab'; tab: SidebarTab; step?: SetupStepId };

export type HostEvent = SessionEvent | SurfaceEvent;
