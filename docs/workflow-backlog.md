# Jira & GitHub workflow

Goal: the inbox card shows what you need to know about a ticket without opening
Jira. Surfaces: the inbox card and the status bar. See `roadmap.md`.

Rule: no git writes.

## Next (in priority order)

1. **Show acceptance criteria on the card.**
   - `JiraTask` has no description today; add it.
   - Parse an "Acceptance criteria" heading or section; fall back to the full
     description. Handle the Atlassian document format.
   - Apply the existing credential scan and length trimming before any of it
     goes to an AI.
   - Run the Jira Field Spike first to see what the MCP returns and whether the
     criteria are a heading or a custom field on your site.
2. **Current branch → status bar** (approved, read-only).
   - Read HEAD through the built-in `vscode.git` API; no writes. Quietly off if the
     git extension is missing; in multi-root workspaces use the active editor's
     repo.
   - Show the ticket key found in the branch name (using the same key matching as
     the PR linker) in the status bar. Clicking it can open that ticket's card or
     the Jira page.

## Not planned

- Copy-text actions: branch name, commit message, PR description, Markdown or
  Slack link, worklog line. An editor AI does these better with the diff in view.
- Markdown ↔ Jira markup, comment-thread summaries and PR source file lists (the
  editor-chat hand-off covers these).
- Looking up local branches; creating, switching or deleting branches.

## Open question

- Are the acceptance criteria a heading in the description, or a custom field on
  your Jira site? (The spike answers this.)
