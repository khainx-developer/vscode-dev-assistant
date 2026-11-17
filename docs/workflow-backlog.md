# Group 2 — Jira & GitHub Workflow

Goal: select a ticket and the extension already knows its PRs, branch,
description and acceptance criteria, and produces the text you need around it.
Surface: the actions menu on each inbox card. See `roadmap.md`.

Rule: no git writes. Everything generated is copy-to-clipboard.

## Already built

- Inbox item bundles a ticket with its linked PRs (`attentionInboxBuilder.ts`).
- PR matching by ticket key in title or branch name (`prLinkMatcher.ts`).
- Linked PR's branch name available as `headRef`.
- Editor-chat hand-off passes card context to an AI agent.

## Add (in priority order)

1. **Fetch ticket description; show acceptance criteria**
   - `JiraTask` has no description today; add it.
   - Parse an "Acceptance criteria" heading or section; fall back to the full
     description. Handle Atlassian document format.
   - Apply the credential scan and length trimming before any text goes to an AI.
   - Check what the Jira MCP adapter returns first. Items 2 and 5 depend on this.
2. **Work item actions menu** (copy only)
   - Copy branch name, e.g. `feature/PROJ-123-short-title`
   - Copy commit message, e.g. `PROJ-123: summary`
   - Copy PR description: ticket link, summary, acceptance criteria as a checklist
   - Settings: branch-name pattern and slug rules; commit/PR templates
3. **Current-branch detection (read-only)** — approved
   - Read HEAD through the built-in `vscode.git` API; no writes.
   - Show the matching ticket key in the status bar; pre-select it for the menu.
   - Gives an automatic "now working on" (see `productivity-backlog.md`).
4. **Markdown ↔ Jira wiki markup** — for ticket comments and descriptions.
5. **Summarize a PR or ticket comment thread** (AI, uses existing snapshot data).
6. **Open PR source files** (low priority) — list the PR's changed files; mapping
   to local files is fragile and the editor-chat hand-off covers most of it.

## Not planned

- AI commit message or PR description generated from a git diff.
- Looking up local branches.
- Creating, switching or deleting branches.
- Copy ticket / PR as a Markdown or Slack link, key or URL (dropped: not useful
  enough to justify card UI).

## Open questions

- Does the Jira MCP adapter return the description and the acceptance-criteria
  field? Is that field a heading or a custom field on your site?
- Should the branch-name pattern be configurable per project key?
