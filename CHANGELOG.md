# Changelog

## 0.0.2

- Dashboard: Updated the Attention Inbox to group Jira tickets with all matching monitored PRs, including per-PR authors, comment/review details, and Open Jira/Open PR actions.
- Dashboard: Limited Jira and PR attention to the current user and configured monitored teammates, and focused the inbox on actionable review or unread-comment activity.
- Reliability: Refresh Jira-to-PR links after GitHub refreshes complete so parallel Jira and GitHub requests do not leave stale unavailable statuses.
- Dashboard: Improved Jira task filtering and added spacing around inbox action buttons.

## 0.0.1

Initial release.

- Daily Tasks Dashboard: GitHub pull requests (yours + monitored teammates/repos) and Jira issues (saved JQL queries) in one sidebar view.
- Text utilities: Base64 encode/decode, URL encode/decode, JSON format/escape, UUID insert, Unix timestamp conversions, case transforms (UPPERCASE, lowercase, camelCase, snake_case, kebab-case).
