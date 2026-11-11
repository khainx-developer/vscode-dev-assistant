# Changelog

## 0.1.0 — First professional release

DevMate Kit is now an attention-first daily work radar.

### New
- **Redesigned sidebar** with three tabs: **Home** (attention summary, top items, connection status), **Tools** (text utilities) and **Setup** (a guided checklist for GitHub, repositories & teammates, Jira and AI, with plain-language status for every step).
- **Dashboard opens on the Attention Inbox.** Stat tiles (Needs attention / My PRs / Team PRs / My Jira) act as filters; the other lists sit under "Everything else". A banner reports a provider that failed to refresh while the rest of the dashboard keeps working.
- **Empty and first-run states** always offer the next step (sign in, add repositories, connect Jira).
- **Snooze** any inbox item for 1 hour, until later today, or until tomorrow morning. Snoozed items are listed separately and return automatically.
- **Status bar count** and **activity bar badge** for items that need your attention.
- **Notifications** when a background refresh finds new items, batched when several arrive at once. Turn off in Setup or with `devMateKit.notifications.enabled`.
- **AI assistant** using the language models available in your editor (VS Code Language Model API):
  - *Ask AI — What should I do next?* (dashboard button and command)
  - *Generate Standup Summary* (Yesterday / Today / Blockers in a new Markdown editor, with Copy)
  - *Explain* on every inbox item
- **Select AI Model** command and live model picker in Setup.
- Getting-started **walkthrough**.

### Changed
- `devMateKit.ai.provider` now takes `none` or `vscodeLm`. The old `githubCopilot` value still works and is treated as `vscodeLm`.
- `devMateKit.ai.model` defaults to empty, which picks the first available GitHub Copilot model (or the first model at all).
- New settings: `devMateKit.notifications.enabled`, `devMateKit.refresh.background`, `devMateKit.statusBar.enabled`.
- The extension now activates after startup so the status bar count and notifications work without opening the sidebar first.
- Calmer visuals: theme-native colors, no emoji decoration, consistent icons, keyboard focus rings, light and dark theme support.

### Internal
- New `app/` layer: `container.ts` builds services once; a single shared `DashboardSession` owns the GitHub and Jira controllers, the inbox and refresh scheduling for both the sidebar and the dashboard.
- Typed connection state for GitHub and Jira plus a derived dashboard status (`needsSetup | loading | ready | partialFailure`).
- Webview HTML/CSS/JS moved out of TypeScript strings into `src/ui/webview/**`, bundled by esbuild into `dist/webview`, with a strict CSP.
- Webview ↔ host messages formalized in `src/shared/messages.ts`.
- GitHub and Jira authentication (MCP OAuth) is unchanged.

## 0.0.6

- Jira: Dashboard tickets now show a "N subtasks" / "No subtasks" badge.
- Dashboard: Jira tickets can be expanded in place (without leaving the dashboard) to show the linked pull request's details, the full comment thread, and the subtask list.
- Internal: Reorganized the extension's source code by layer (`ui/`, `services/`, `infrastructure/`, `shared/`) to make the codebase easier to review; no functional changes.

## 0.0.5

- Attention Inbox: Include Jira tickets linked to your open PRs (ready or draft) and teammates' ready PRs, even without another attention condition.
- Dashboard: Show Linked PR and Draft badges for linked pull requests in the Attention Inbox.
- OAuth: Validate callback state before processing errors and reject callbacks without an authorization code.

## 0.0.4

- Attention Inbox: Fixed a bug where a monitored teammate's non-draft PR with no reviews yet was dropped from the inbox instead of showing as "Waiting for review".
- Attention Inbox: Added merge-conflict detection — a PR (yours or a teammate's) with conflicts is now flagged and treated as urgent.
- Attention Inbox: Added staleness detection — a PR or Jira ticket waiting 3+ days with no movement is now flagged "Stale" and escalated to top priority.
- Fixed a bug where your own draft PRs could be incorrectly flagged "Waiting for review".
- Dashboard: Visual refresh — priority/urgency color accents on item cards, hover elevation, pill-style section counts, and "updated X ago" shown on Jira items.

## 0.0.3

- Jira: Added support for saving and displaying multiple JQL queries on the Daily Tasks dashboard.
- Dashboard: Updated the layout and font sizing for improved readability.

## 0.0.2

- Dashboard: Updated the Attention Inbox to group Jira tickets with all matching monitored PRs, including per-PR authors, comment/review details, and Open Jira/Open PR actions.
- Dashboard: Limited Jira and PR attention to the current user and configured monitored teammates, and focused the inbox on actionable review or unread-comment activity.
- Reliability: Refresh Jira-to-PR links after GitHub refreshes complete so parallel Jira and GitHub requests do not leave stale unavailable statuses.
- Dashboard: Improved Jira task filtering and added spacing around inbox action buttons.

## 0.0.1

Initial release.

- Daily Tasks Dashboard: GitHub pull requests (yours + monitored teammates/repos) and Jira issues (saved JQL queries) in one sidebar view.
- Text utilities: Base64 encode/decode, URL encode/decode, JSON format/escape, UUID insert, Unix timestamp conversions, case transforms (UPPERCASE, lowercase, camelCase, snake_case, kebab-case).
