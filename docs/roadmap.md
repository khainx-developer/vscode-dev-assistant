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

## Groups

| Group | Where it lives | Backlog |
|---|---|---|
| Dashboard | Home tab, dashboard panel, status bar | [dashboard-backlog.md](dashboard-backlog.md) |
| Jira & GitHub workflow | Inbox cards and the status bar | [workflow-backlog.md](workflow-backlog.md) |
| Toolkit | Tools tab (Code / API groups), editor right-click | [toolkit-backlog.md](toolkit-backlog.md) |

## UI: one job per surface

| Surface | Job | Contains | Never contains |
|---|---|---|---|
| **Home tab** | Glance: what needs me now | Attention summary, top items, connection status | Tools, settings forms |
| **Dashboard panel** | Triage everything | Full inbox, filters, stat tiles | Tools |
| **Inbox card** | Act on one ticket or PR | Open PR/Jira, snooze, acceptance criteria, blockers, Ask AI | Generic tools |
| **Tools tab** | Transform text, no context needed | Searchable tools grouped Code / API | Anything needing GitHub/Jira |
| **Status bar** | Ambient signal | Attention count, current ticket | Menus |
| **Setup tab** | Configure and connect | Sign-in, repos, Jira, AI provider, preferences | Daily-use features |

Keep the sidebar tabs at Home / Tools / Setup. A tool is defined once in
`src/services/toolRegistry.ts`; tool logic is pure functions in
`src/services/textTools/`.

## Next (in order)

1. **Blockers, part 2** — the Flagged / Impediment field (`customfield_10021`; see
   [backlog.md](backlog.md) spike findings).
2. **Current branch → status bar** — read-only, shows the ticket for the branch
   you are on.
3. **Auto-pause outside working hours** — schedule for the existing Sleep/Wake
   setting.
4. **@mention detection** — mentions of you become an attention reason.
5. ***Run Tool…*** — one Command Palette entry that runs any tool on the editor
   selection.

Later, only if needed: inbox filters, custom attention rules. See
`dashboard-backlog.md`.

## Decided

- **Jira Field Spike** — findings recorded in [backlog.md](backlog.md). Spike
  command removed. Acceptance criteria are a description heading (not a custom
  field); Flagged is `customfield_10021` (UI still pending).
- **Read-only current-branch detection is approved**, through the built-in
  `vscode.git` API. Branch name only, no writes. A missing git extension turns the
  feature off quietly. In multi-root workspaces use the repo of the active editor.
  The branch name stays local unless the user hands it off.
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
- Any git write, and looking up local branches.

## Docs to update

- `README.md`: intro still describes a radar only; add the "developer tools" line.
- `CHANGELOG.md` per release.
