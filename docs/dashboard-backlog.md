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
- **Tickets without an open PR** (`jira-no-pr`): ticket in a configured status
  (`devMateKit.jira.noPrStatuses`, case-insensitive), no matched open PR, no
  activity for `devMateKit.jira.noPrDays`. Waiting on you, label "No open PR".
  Follow-ups: per-label opt-out (needs the `labels` field); a ticket still In
  Progress after its PR merged is flagged too, since only open PRs are fetched.

## Add (in priority order)

Prerequisite for 1 (partly) and 2: check what the Jira MCP adapter returns. Run
the Jira Field Spike command and record the result in `roadmap.md`.

1. **Comments awaiting your reply** (next)
   - Latest comment on your PR or ticket is from someone else and you haven't
     replied since. Replaces "unread" as the "needs my response" signal.
   - Ignore bots (existing filter) and optionally very short comments.
2. **Jira blockers**
   - Flagged / Impediment field and *is blocked by* issue links; new reason
     `jira-blocked`. The Flagged field's custom id differs per site.
   - Jira only at first.
3. **Auto-pause outside working hours** — schedule for the existing Sleep/Wake
   monitoring (e.g. Mon–Fri 09:00–18:00).
4. **@mention detection** — mentions of you become an attention reason; sharpens #1.
5. **Inbox filters** — by repo, priority, PR vs ticket.
6. **Custom attention rules** — ignore drafts, ignore or boost by label,
   configurable stale threshold (fixed at 3 days today).
7. **Review-load view** — reviews you owe, oldest first.
8. **Reports** — copy merged PRs / done tickets from the last N days as Markdown;
   Slack-style and plain-text standup output; weekly report (AI).
9. **Multiple GitHub orgs / Jira sites.**

## Not planned

- **Email integration.** Needs a third OAuth integration with mail-read scope;
  conflicts with "no stored vendor keys" and "no full client". GitHub and Jira
  notification mail is covered at the source. Optional: an "Open mail" link.

## Open questions

- Is "In Progress" the right default for `noPrStatuses` in your Jira workflow?
- Should "awaiting your reply" cover team PRs you reviewed, or only your own
  PRs and tickets?
