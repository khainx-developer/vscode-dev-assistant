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
- **Comments awaiting your reply** (`jira-awaiting-reply`, `pr-awaiting-reply`):
  latest non-bot comment on your PR or assigned ticket is from someone else and
  you have not replied since. Waiting on you; independent of unread/`seenAt`.
  Optional `devMateKit.attention.ignoreShortReplies`. Team PRs you only reviewed
  are not flagged.
- **Jira blockers** (`jira-blocked`): assigned tickets with an open *is blocked by*
  issue link. Waiting on you; label "Blocked"; cards show blocking keys. Part 2
  (Flagged / Impediment field) deferred — no spike output yet. Jira only.

## Add (in priority order)

1. **Auto-pause outside working hours** — schedule for the existing Sleep/Wake
   monitoring (e.g. Mon–Fri 09:00–18:00).
2. **@mention detection** — mentions of you become an attention reason; sharpens
   awaiting-reply.
3. **Inbox filters** — by repo, priority, PR vs ticket.
4. **Custom attention rules** — ignore drafts, ignore or boost by label,
   configurable stale threshold (fixed at 3 days today).
5. **Review-load view** — reviews you owe, oldest first.
6. **Reports** — copy merged PRs / done tickets from the last N days as Markdown;
   Slack-style and plain-text standup output; weekly report (AI).
7. **Multiple GitHub orgs / Jira sites.**

Follow-up (was Part 2 of Jira blockers): Flagged / Impediment field — needs spike
for the site-specific custom field id; not started.

## Not planned

- **Email integration.** Needs a third OAuth integration with mail-read scope;
  conflicts with "no stored vendor keys" and "no full client". GitHub and Jira
  notification mail is covered at the source. Optional: an "Open mail" link.

## Open questions

- Is "In Progress" the right default for `noPrStatuses` in your Jira workflow?
- ~~Should "awaiting your reply" cover team PRs you reviewed, or only your own
  PRs and tickets?~~ Decided: own PRs and assigned tickets only.
