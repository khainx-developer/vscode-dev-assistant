# DevMate Kit roadmap

DevMate Kit = **daily work radar + a few developer tools**.

The radar (Attention Inbox) is what an editor AI can't do: it keeps watching
GitHub and Jira and tells you what needs you. Anything an editor AI already does
well with workspace access (analyse a stack trace, write a commit message or PR
description from a diff, summarise a thread) is **not** built here.

Rules:
- Only build what is needed at least weekly and that VS Code, an extension or an
  editor AI doesn't already do well.
- No git writes (create / commit / delete). Reading the current branch is allowed.
- Tools are offline and need no GitHub/Jira connection.

## Work

All planned work is in [backlog.md](backlog.md), in priority order. Designs:
[AI Action Center](ai-action-center.md) and
[Webview UI migration](webview-migration.md).

## UI: one job per surface

| Surface | Job | Contains | Never contains |
|---|---|---|---|
| **Home tab** | Glance: what needs me now | Attention summary, top items, connection status | Tools, settings forms |
| **Dashboard panel** | Triage everything | Full inbox, filters, stat tiles | Tools |
| **Inbox card** | Act on one ticket or PR | Open PR/Jira, snooze, acceptance criteria, blockers, Analyze | Generic tools |
| **Tools tab** | Transform text, no context needed | Searchable tools grouped Code / API | Anything needing GitHub/Jira |
| **Status bar** | Ambient signal | Attention count, current ticket | Menus |
| **Setup tab** | Configure and connect | Sign-in, repos, Jira, AI provider, preferences | Daily-use features |

Keep the sidebar tabs at Home / Tools / Setup. A tool is defined once in
`src/services/toolRegistry.ts`; tool logic is pure functions in
`src/services/textTools/`.

## Decided

- **Jira Field Spike done**: findings are in [backlog.md](backlog.md). Acceptance
  criteria are a description heading (not a custom field); Flagged is
  `customfield_10021`. The spike command is removed.

- **Read-only current-branch → status bar ticket key shipped**, through the built-in
  `vscode.git` API. Branch name only, no writes. A missing git extension turns the
  feature off quietly. In multi-root workspaces use the repo of the active editor.
  The branch name stays local unless the user hands it off. Flagged / Impediment
  blockers on inbox cards are also shipped.
- **AI Action Center shipped in v0.5.0** ([ai-action-center.md](ai-action-center.md)):
  read-only analysis and actions per ticket or PR (Analyze, automatic analysis,
  progress tracking, Next actions). The AI reads and plans, the editor AI does the
  heavy work. Writes through MCP are not planned.
- **AI is opt-in twice:** the user turns a backend on **and** picks a model. No
  default model is ever used; without both, no AI feature runs and nothing is sent.
- **Card chat and "What should I do next?" removed** in v0.5.0; Analyze and Next
  actions replace them.
- **Bundle budget:** toolkit dependencies stay under about +100 KB combined.
  About 56 KB is left (`js-yaml` took about 44 KB). A lazy `require` only defers
  start-up work; it does not shrink the single-file bundle.

## Not planned

- **Debug tools** (stack trace parser and resolver, regression hint, Jira stack
  traces, AI "analyze", redact-secrets tool, JSON log printer, SQL formatter):
  editor AI with workspace access does this well.
- **Copy-text helpers** (branch name, commit message, PR description, Markdown or
  Slack link, worklog line) and AI summaries: editor AI does these better, with
  the diff in view.
- **Productivity extras:** notes, follow-up list, bookmarks, snippets, TODO
  scanning.
- **More tools:** JSON → Types, minify / sort JSON, URL parser, cURL converter,
  HMAC, JSONPath, regex tester, date calculator, recent / pinned tools, REST client,
  OpenAPI viewer, mock server, text diff, line tools, color converter, Markdown
  table formatter, cron explainer, JSON ↔ CSV, UUID v7 / ULID, HTML entities,
  number base, Lorem ipsum.
- **Dashboard extras:** reports and weekly summaries, review-load view, multiple
  GitHub orgs / Jira sites (until needed), email integration.
- **Covered by VS Code or extensions:** text diff, line tools (sort, dedupe, trim),
  color converter, Markdown table formatter, REST client (Thunder Client, REST
  Client, httpyac), OpenAPI viewer, mock server.
- **Editor-chat hand-off covers:** Markdown ↔ Jira markup, comment-thread
  summaries, PR source file lists, regex or cron generation.
- **Email integration:** a third OAuth integration with mail-read scope conflicts
  with "no stored vendor keys"; GitHub and Jira notification mail is covered at
  the source.
- Any git write, and looking up local branches.
