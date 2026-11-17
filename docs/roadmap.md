# DevMate Kit roadmap

DevMate Kit = **daily work radar + developer toolkit**.

Rules for everything below:
- No git writes (create / commit / delete). Branch and commit helpers are
  copy-to-clipboard only.
- Only build what a developer needs at least weekly and VS Code or a dedicated
  extension doesn't already do well.
- Tools are offline and need no GitHub/Jira connection.

## Groups

| # | Group | Where it lives in the UI | Backlog |
|---|---|---|---|
| 1 | Dashboard | Home tab, full dashboard panel, status bar | [dashboard-backlog.md](dashboard-backlog.md) |
| 2 | Jira & GitHub Workflow | Actions menu on each inbox card | [workflow-backlog.md](workflow-backlog.md) |
| 3 | Code Toolkit | Tools tab → *Code* | [toolkit-backlog.md](toolkit-backlog.md) |
| 4 | API Toolkit | Tools tab → *API* (a category, not a separate area) | [toolkit-backlog.md](toolkit-backlog.md) |
| 5 | Debug Toolkit | Tools tab → *Debug*, editor right-click | [debug-backlog.md](debug-backlog.md) |
| 6 | Productivity | Card actions and Home, only where tied to a work item | [productivity-backlog.md](productivity-backlog.md) |

## UI: separation of concerns

Each surface has one job. Features go on the surface that matches their job.

| Surface | Job | Contains | Never contains |
|---|---|---|---|
| **Home tab** | Glance: what needs me now | Attention summary, top items, connection status | Tools, settings forms |
| **Dashboard panel** | Triage: work through everything | Full inbox, filters, stat tiles, reports | Tools |
| **Inbox card actions** (menu) | Act on one work item | Open PR/Jira, snooze, copy link/branch/commit/PR text, acceptance criteria, notes, Ask AI | Generic tools |
| **Tools tab** | Transform text, no context needed | Searchable, categorised tools (Code / API / Debug), recent and pinned | Anything needing GitHub/Jira |
| **Editor** (right-click, Command Palette *Run Tool…*) | Run a tool on the current selection | Same tools as the Tools tab | A second copy of the tool list |
| **Status bar** | Ambient signal | Attention count, "now working on" ticket | Menus |
| **Setup tab** | Configure and connect | Sign-in, repos, Jira, AI provider, preferences | Daily-use features |

Rules:
1. **One registry, many surfaces.** A tool is defined once in the registry; the
   Tools tab, context menu and *Run Tool…* are generated from it.
2. **Tools are stateless; radar features are stateful.** Tools take input and
   return output. Anything that reads GitHub/Jira belongs to groups 1, 2 or 6.
3. **Tools that link to the radar degrade gracefully.** If not connected (e.g.
   the stack-trace regression hint), the tool still works and the hint is hidden.
4. **Copy-only output.** Workflow helpers never run git; they put text on the
   clipboard.
5. **Six groups ≠ six tabs.** Keep the tabs at Home / Tools / Setup.

Code boundaries (guidance, not a task): tool logic stays in `src/services/` as
pure functions grouped by `code` / `api` / `debug`; work item helpers share one
`WorkItem` context built from the existing inbox item (ticket + linked PRs +
description); the `ui/` layer only renders.

## Phases (in order)

### Phase 1 — Dashboard gaps
Prerequisite for #3 only: check what the Jira MCP adapter returns (description,
issue links, Flagged field). Run the **Jira Field Spike** command
(`src/app/jiraFieldSpike.ts`, committed) and record the answer here.
1. ✅ Tickets without an open PR (`jira-no-pr`) — **done**. Label "No open PR";
   settings `devMateKit.jira.noPrStatuses` (case-insensitive) and
   `devMateKit.jira.noPrDays`. Follow-ups: per-label opt-out (needs the `labels`
   field); tickets still In Progress after their PR merged are flagged too, since
   only open PRs are fetched.
2. ✅ Comments awaiting your reply (`jira-awaiting-reply`, `pr-awaiting-reply`) — **done**.
   Stays until you comment after the latest non-bot comment from someone else; independent of
   unread/`seenAt`. Setting `devMateKit.attention.ignoreShortReplies` (default false). Own PRs
   and assigned tickets only.
3. ✅ Jira blockers (`jira-blocked`) — **done (Part 1 only)**. Assigned tickets with an
   open *is blocked by* issue link (inward Blocks link; blocker not done via
   `statusCategory` or terminal status names). Waiting on you; label "Blocked";
   cards show blocking keys. **Part 2 (Flagged / Impediment field) deferred** —
   spike output was not provided.

### Phase 2 — Workflow
1. Fetch ticket description; show acceptance criteria *(needs the Jira spike first)*
2. Work item actions menu: copy branch name, commit message, PR description
   (acceptance criteria as a checklist)
3. Current-branch detection, read-only (approved)

### Phase 3 — Tools foundation and core
1. ✅ Tools tab: category grouping (Code / API / Debug; search already existed)
2. ✅ JWT decoder (with Base64URL)
3. Timestamp with time zones
4. Hash
5. JSON ↔ YAML
6. JSON → Types (TypeScript and C#)
7. *Run Tool…* Quick Pick command
8. Recent / pinned tools
9. ✅ Remove duplicate case transforms (VS Code built-ins: upper/lower long-standing; snake 1.53; kebab 1.69; camel 1.75 — all before `engines.vscode` ^1.90.0)

### Phase 4 — Debug
1. Redact secrets
2. Stack trace parser (Node/JS/TypeScript and .NET first)
3. Resolve frames to workspace files
4. Recent-PR regression hint
5. Stack traces in Jira tickets
6. JSON log pretty-printer

### Phase 5 — By demand
Tier 2 tools (minify / sort JSON, URL parser, cURL converter,
JSONPath, regex tester, SQL formatter), Markdown ↔ Jira markup, per-ticket notes,
follow-up list, auto-pause outside working hours, inbox filters, custom attention
rules, AI analyze and summaries.

## Decisions needed

- Does the Jira MCP adapter return the description and Flagged field? (Still
  gates Phase 1 #3 Part 2 and Phase 2 #1.) Issue links are now requested for
  `jira-blocked` (`issuelinks`); live shape vs assumed Blocks/`inwardIssue`
  payload still needs a site check. Flagged custom field id differs per site —
  spike not run.

## Decided

- Languages in use are **TypeScript and .NET (C#)**. JSON → Types generates both,
  and the stack trace parser starts with Node/JS/TypeScript and .NET.
- **Read-only current-branch detection is approved** (Phase 2 #3), through the
  built-in `vscode.git` API. Branch name only, no writes. A missing git
  extension turns the feature off quietly. In multi-root workspaces use the repo
  of the active editor. The branch name stays local unless the user hands it off.
- **Bundle budget:** toolkit dependencies stay under about +100 KB combined
  (`dist/extension.js` was 532 KB), loaded on demand so startup is unaffected.

## Not planned

REST client, OpenAPI viewer, mock server, generic notes / snippets / bookmarks /
TODO scanning, text diff, line tools, color converter, Markdown table formatter,
cron explainer, JSON ↔ CSV, UUID v7 / ULID, HTML entities, number base, Lorem
ipsum, copy ticket/PR as Markdown or Slack link, email integration, any git write, AI commit/PR text from a diff, a
generic "analyze this error" chat.

## Docs to update when this ships

- `README.md`: intro (still radar-only; add the "developer toolkit" positioning),
  features and text-utilities section. (`BACKLOG.md` was removed, so there is no
  positioning text to fix there.)
- `CHANGELOG.md` per release.
