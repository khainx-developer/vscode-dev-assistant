# Group 1 — Dashboard

Goal: instead of opening GitHub, Jira and email, the inbox shows everything that
needs you. Surfaces: Home tab, dashboard panel, status bar. See `roadmap.md`.

## Already built

- PRs waiting for your review (`pr-needs-my-review`, `pr-waiting-review`)
- Your assigned Jira tickets (My Jira, saved JQL)
- Failed CI builds (`pr-checks-failing`)
- Overdue / due today / due tomorrow tickets
- Unread comments on your PRs and tickets
- Changes requested, merge conflicts, stale PRs and tickets
- Snooze, status bar count, notifications, pause monitoring, standup, Ask AI

## Add (in priority order)

Prerequisite for 1 and 3: check what the Jira MCP adapter returns.

1. **Tickets without a linked PR**
   - Ticket assigned to you, *In Progress*, no PR matched by `prLinkMatcher`, no
     activity for N days.
   - New reason `jira-no-pr`, shown as Waiting on you (not Urgent).
   - Opt-out for non-code tickets (by status or label); setting for N days.
2. **Comments awaiting your reply**
   - Latest comment on your PR or ticket is from someone else and you haven't
     replied since. Replaces "unread" as the "needs my response" signal.
   - Ignore bots (existing filter) and optionally very short comments.
3. **Jira blockers**
   - Flagged / Impediment field and *is blocked by* issue links; new reason
     `jira-blocked`. The Flagged field's custom id differs per site.
   - Jira only at first.
4. **Auto-pause outside working hours** — schedule for the existing Sleep/Wake
   monitoring (e.g. Mon–Fri 09:00–18:00).
5. **@mention detection** — mentions of you become an attention reason; sharpens #2.
6. **Inbox filters** — by repo, priority, PR vs ticket.
7. **Custom attention rules** — ignore drafts, ignore or boost by label,
   configurable stale threshold (fixed at 3 days today).
8. **Review-load view** — reviews you owe, oldest first.
9. **Reports** — copy merged PRs / done tickets from the last N days as Markdown;
   Slack-style and plain-text standup output; weekly report (AI).
10. **Multiple GitHub orgs / Jira sites.**

## Not planned

- **Email integration.** Needs a third OAuth integration with mail-read scope;
  conflicts with "no stored vendor keys" and "no full client". GitHub and Jira
  notification mail is covered at the source. Optional: an "Open mail" link.

## Open questions

- Which Jira statuses count as "in progress" across your workflows?
- Should "awaiting your reply" cover team PRs you reviewed, or only your own
  PRs and tickets?
