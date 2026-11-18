# Dashboard

Goal: instead of opening GitHub and Jira, the inbox shows everything that needs
you. Surfaces: Home tab, dashboard panel, status bar. See `roadmap.md`.

## Next (in priority order)

1. **Auto-pause outside working hours** — schedule for the existing Sleep/Wake
   monitoring (e.g. Mon–Fri 09:00–18:00).
2. **@mention detection** — mentions of you become an attention reason; sharpens
   awaiting-reply. GitHub comment bodies are plain text; Jira comments are
   flattened from the Atlassian document format, so check that mentions survive.

## Later, only if needed

- **Inbox filters** — by repo, priority, PR vs ticket.
- **Custom attention rules** — ignore drafts, ignore or boost by label,
  configurable stale threshold (fixed at 3 days today). A per-label opt-out for
  `jira-no-pr` belongs here (needs the `labels` field).

## Not planned

Reports and weekly summaries, a review-load view (the inbox already lists reviews
you owe), multiple GitHub orgs / Jira sites until needed, and email integration
(a third OAuth integration with mail-read scope conflicts with "no stored vendor
keys"; GitHub and Jira notification mail is covered at the source).
