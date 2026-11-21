# Changelog

## Unreleased

### New
- **Branch ticket key in the status bar** — shows the Jira/GitHub ticket key parsed from the current git branch name; click opens the matching dashboard card or the Jira browse URL. Toggle with `devMateKit.branchStatusBar.enabled` (default true).
- **Working-hours auto-pause** — optionally pause monitoring outside a local weekday window (`devMateKit.monitoring.workingHours.*`, off by default). Setup → Preferences can turn it on and edit days, start, and end. Does not change Sleep / Wake; a manual pause always wins. The status bar shows when monitoring is paused outside working hours.
- **Acceptance criteria on Jira cards** — expandable ticket details show acceptance criteria extracted from the description (`## Acceptance Criteria` heading, else the full description). Criteria are credential-scanned and length-trimmed before any AI prompt. Spike findings are in `docs/backlog.md`; the one-off Jira Field Spike command is removed.
- **PR approvals on Attention cards** — when a pull request has approvals, a chip shows who approved (e.g. `khainx.developer approved`). Two approvers are listed; three or more show the first two plus a `+N` count, with the full list in the tooltip.

### Fixed
- Attention card Jira comment previews no longer show raw HTML; they use the same plain-text extraction as the Comments section.

## 0.3.1

### New
- **Tools tab groups** — tools are now listed under collapsible **Code** and **API** sections. Search still filters across all groups.
- **JWT Decoder** (API) — paste a token to see its header and payload, with `exp`, `iat` and `nbf` shown as dates and whether the token has expired. Strips whitespace (wrapped pastes), accepts an optional `Bearer` prefix, and tolerates Base64URL padding or standard `+/` alphabet. Decode only: it never verifies the signature and never sends the token anywhere.
- **Date / Timestamp Converter** (Code) — show a moment as Unix seconds/milliseconds and in UTC, your local zone, and any IANA zones listed after `in` (e.g. `1700000000 in Asia/Tokyo, Europe/London`). Accepts Unix timestamps (seconds or milliseconds) or ISO 8601 date strings; no new dependencies (Intl only, DST-aware).
- **Hash** (API) — SHA-256, SHA-1, MD5, and SHA-512 digests of text exactly as typed (including a trailing newline), plus an All hashes action. MD5 and SHA-1 are for checksums, not security. Uses Node crypto; no new dependencies.
- **JSON ↔ YAML** (Code) — convert JSON to YAML and YAML to JSON (comments are dropped; multi-document YAML becomes an array).

### Improved
- Timestamp → ISO (editor command) now returns a friendly error for out-of-range values instead of a raw `RangeError`.

### Changed
- Removed the DevMate Kit case transforms (UPPERCASE, lowercase, camelCase, snake_case, kebab-case) from the Tools tab, Command Palette and right-click menu. VS Code has covered these since before our minimum (`^1.90.0`): upper/lower, snake, kebab, and camel case transforms. If you bound a key to `devMateKit.toUpperCase`, `devMateKit.toLowerCase`, `devMateKit.toCamelCase`, `devMateKit.toSnakeCase` or `devMateKit.toKebabCase`, rebind it to `editor.action.transformToUppercase`, `editor.action.transformToLowercase`, `editor.action.transformToCamelcase`, `editor.action.transformToSnakecase` or `editor.action.transformToKebabcase`.

## 0.3.0

### New
- **Comments awaiting your reply** — an item stays in Waiting on you until you reply, even after you've opened it. Flags your own PRs and assigned Jira tickets when the latest non-bot comment is from someone else. Covers GitHub conversation and inline review comments (resolved and outdated threads are skipped); Jira tickets in a Done status are skipped. Optional `devMateKit.attention.ignoreShortReplies` ignores very short replies such as "thanks".
- **Jira blockers** — assigned tickets with an open *is blocked by* link show a **Blocked** chip, and the card lists the blocking issues with links to open them. Support for the Flagged / Impediment field is planned.
- **Tickets without an open PR** — in-progress Jira tickets with no matched open PR and no activity for N days appear in the Attention Inbox as Waiting on you (`devMateKit.jira.noPrStatuses`, case-insensitive, and `devMateKit.jira.noPrDays`).
- **Reconnect** in Setup for GitHub and Jira — force MCP sign-in again when tokens expire or auth fails. Clears stored MCP credentials and runs OAuth again; Jira keeps your site URL and settings. Disconnect remains available for Jira.

### Improved
- Unread comments and notifications now also include inline review comments on GitHub PRs.
- Cards for items awaiting your reply show the comment excerpt and offer **Draft reply**.
- **AI backend by host** — In VS Code, Setup only offers **Editor language models** (Cursor Agent CLI is hidden). In Cursor, both backends appear and Cursor Agent CLI is recommended while Off. Enabling AI from Off uses the host default; a Cursor-only provider saved from Cursor is reset to Editor LM when opened in VS Code.
- Changing `devMateKit.jira.noPrStatuses`, `devMateKit.jira.noPrDays` or `devMateKit.attention.ignoreShortReplies` updates the Attention Inbox immediately.

## 0.2.0

### New
- **Ask AI on inbox cards** — open a per-card chat for fast triage (why flagged, whose turn, next step, draft a reply) from card snapshot data.
- **Deep work → editor chat** — actions like Review PR, Summarize changes, Fix failing checks, and Plan this ticket copy a portable prompt (with GitHub/Jira MCP how-to) for paste into Copilot, Cursor, or other editor chats. Typed “deep” questions show the same copy-prompt path instead of a thin on-card answer.
- **`devMateKit.ai.reviewPrompt`** — customizable clipboard hand-off template (`{number}`, `{repo}`, `{title}`, `{url}`, `{status}`).
- **Cursor Agent CLI** as an alternate AI backend (`devMateKit.ai.provider`: `cursorCli`). When editor language models are empty or unsupported, Setup suggests this option without auto-switching. Runs `agent -p --mode ask` only (no write/shell). Model id maps to the CLI `--model` flag. Install/login guidance when the CLI is missing or unauthenticated.

### Improved
- Explain / card-chat prompts: pass developer identity (“whose turn”), treat PR/Jira comments as untrusted data, refuse invented missing facts, and include richer single-item context (reviewers, review states, labels, flag explanations, extra clipped comments).
- Card Ask AI answers aim for useful triage (not one-liners) and point to editor chat when a PR diff or full Jira body is required.
- Inbox-wide **What should I do?** remains in the top AI panel; per-card Explain no longer appears there.

### Fixed
- Hide chat / Clear on the card chat panel.
- PR/Jira Details and unread attention: filter automation authors such as `github-actions[bot]`, Dependabot, Renovate, and other `…[bot]` accounts (and known automation names).

## 0.1.1

### New
- **Sleep / Wake monitoring** in Setup → Preferences (`devMateKit.monitoring.enabled`). Turn off at night so DevMate stops refreshing and connecting to GitHub/Jira while keeping your sign-in. Resume from Setup, the dashboard/home banner, status bar, or Command Palette.

### Fixed
- Standup progress toast (“Writing your standup summary…”) now closes when generation finishes instead of staying open until you dismiss the ready dialog.
- Attention Inbox: **Open in Jira** sits on the same row as **Open PR** for linked ticket + PR items.
- Jira ↔ PR linking also matches the ticket key in the PR **branch name** (not only the title), including when GitHub’s list response omits `head.ref`.

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
