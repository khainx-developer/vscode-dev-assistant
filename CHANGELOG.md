# Changelog

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
