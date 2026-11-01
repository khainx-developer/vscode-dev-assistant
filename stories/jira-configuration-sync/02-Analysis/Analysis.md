# Analysis — Jira Configuration & Task Sync

- **Story ID**: jira-configuration-sync
- **Status**: Approved
- **Author**: Architect/Analyst agent (ai-factory-requirement, default: Claude)
- **Date**: 2026-10-31

Working document that feeds `01-Requirement/Requirement.md`. The BRS itself is the
authoritative artifact — this file is the evidence trail for how it was derived.

## Brainstorm — Clarifying Q&A

| # | Category | Question | Answer | Source |
|---|----------|----------|--------|--------|
| 1 | Users/Scale & Integration | How should the extension authenticate to Jira? | Superseded: browser authorization to the configured Atlassian MCP server, one active site, no API-token fallback or broker | user, 2026-10-31 |
| 2 | Users/Scale & Integration | Which Jira deployment type(s) must this support? | Jira Cloud via Atlassian MCP v2 only | user |
| 3 | Workflow | What does "fetch the tasks" mean — which issues are pulled in? | Not a fixed `assignee = currentUser()` query — each Jira instance's setup differs too much, so the user supplies their own JQL | user |
| 4 | Business Rules & Validation | How do user-supplied JQL and the `monitoredProjects`-style config list fit together? | `monitoredProjects` is replaced by a list of **saved JQL queries** (each a user-entered JQL string, optionally labeled) — directly analogous to `monitoredRepos` being a list of `owner/repo` strings, except each entry is a JQL string instead of a repo slug | user |
| 5 | Workflow & Exceptions | Where should Jira tasks appear in the UI? | A new sibling webview next to the existing GitHub PR view — same `viewController.ts` + webview pattern, separate state/refresh | user |
| 6 | Scope | Is this read-only fetch/display, or does it also change Jira state? | Read-only: list issues from saved JQL queries, open them in the browser. No write/mutating Jira calls (no transitions, no comments) — explicitly Out of Scope | user |
| 7 | Business Rules & Validation | How should an invalid/failing saved JQL query be handled? | Validate by test-running the JQL against the configured Jira site before saving it — reject the save with Jira's own error message if it fails, mirroring `GitHubConfigStore.addRepo`'s `validateRepo` call | user |
| 8 | Workflow (added mid-session) | How should the extension determine whether a Jira ticket has an associated GitHub PR? | Match the Jira issue key (e.g. `PROJ-123`) against the branch name or title of PRs already fetched by the existing GitHub integration (`monitoredRepos`) — pure client-side matching against data already in memory, no new Jira API surface for this | user |
| 9 | Workflow (added mid-session) | What should the Jira task view show for the linked PR relationship? | Each Jira task row shows whether a PR exists, and if so its state (open/merged/closed) plus a link to open it — reuses the existing `PullRequestSummary.state` the GitHub integration already tracks | user |
| 10 | Authentication / Workflow | What should the developer provide and experience when connecting? | Enter the Jira site URL, choose Connect with Atlassian, sign in/consent in the browser, return automatically to VS Code, and confirm one authorized Jira site; no API token or client secret is entered | user, 2026-10-31 |
| 11 | Authentication / Integration | What auth path should the extension use? | The Atlassian MCP server's browser OAuth 2.1 flow; no broker or client secret in the extension | user, 2026-10-31 |
| 12 | Security / Credential lifecycle | How should MCP credentials and API-token fallback be handled? | Store MCP credentials in SecretStorage; remove API-token fallback; clear credentials on disconnect; delete a legacy Jira API token after successful Atlassian MCP auth; preserve existing auth on cancel/failure | user, 2026-10-31 |
| 13 | Workflow / Exceptions | What happens when multiple sites are authorized or MCP auth fails? | One active Jira site at a time; developer confirms a site; refresh credentials when possible; if refresh fails, require browser reauthorization; do not partially replace an existing connection | user, 2026-10-31 |
| 14 | Integration / Scope | Should current GitHub Attention Inbox use GitHub MCP too, and should behavior change? | Replace its data access with GitHub MCP while preserving current behavior; if required read-only MCP fields or operations are missing, block cutover | user, 2026-10-31 |
| 15 | Future extensibility | Should Phase 2 Copilot SDK chat reuse Phase 1 MCP connections? | Yes; avoid another browser authorization and share the user-authorized MCP services | user, 2026-10-31 |
| 16 | Authentication / Integration | How should GitHub MCP authenticate? | Reuse existing VS Code GitHub sign-in if accepted by the MCP server; otherwise allow separate MCP browser authorization | user, 2026-10-31 |
| 17 | Configuration | Where should Dev Assistant's MCP endpoint definitions live? | In an extension-owned `.mcp.json` containing non-secret server endpoints only; credentials remain in SecretStorage | user, 2026-10-31 |

No question in this list was answered by assumption — every answer above came directly from
the user. The following supporting decisions are recorded for traceability and carried into
Requirement.md §22 (Assumptions):

- MCP access/refresh credentials are held in VS Code `SecretStorage`, not in `settings.json`.
  The extension requests read-only access and does not expose credentials to the webview.
- Automatic refresh mirrors GitHub's `RefreshScheduler` pattern: refresh on panel becoming
  visible, then poll every 5 minutes while visible, pause while hidden, plus a manual refresh
  action.
- Error classification mirrors `GitHubFailure`'s categories (`auth-expired`, `rate-limited`,
  `invalid-entry`, `network`), mapped from MCP authorization/tool/network failures and Jira
  validation results.

## AI Quality Gate Self-Check

| # | Question | Answer (Y/N) | If No — what's missing |
|---|----------|---------------|--------------------------|
| 1 | Do I fully understand the business problem? | Y | |
| 2 | Do I understand why this feature exists? | Y | |
| 3 | Do I know who will use it? | Y | |
| 4 | Do I know every business rule? | Y | |
| 5 | Do I know every validation rule? | Y | |
| 6 | Do I know the success criteria? | Y | |
| 7 | Do I know the failure scenarios? | Y | |
| 8 | Do I know what is NOT included? | Y | |
| 9 | Do I have enough information to start system design? | Y | GitHub MCP source exposes read-only PR list/details, status, reviews, comments, check runs, requested reviewers and label lookup; deployed parity is a required pre-cutover validation |
| 10 | Is there anything that requires guessing? | N | |

## Feasibility Notes
- The repository contains an initial Jira implementation using API-token authentication and a
  direct GitHub REST integration. Both data paths must be replaced only after the revised
  Requirement, Design, Technical Design, and ExecutionPlan gates.
- Read `src/github/{auth,configStore,client,types,viewController,errorClassifier,
  refreshScheduler,lastSeenStore}.ts` and the GitHub contributions in `package.json`
  (`devAssistant.github.monitoredRepos`/`monitoredAuthors` settings,
  `devUtilities.githubSignIn` command) and `src/extension.ts`'s wiring of those pieces. This is
  the concrete pattern this story's config/auth/client/view split is modeled on, per the user's
  explicit ask to "reference how github work."
- `.mcp.json` configures HTTP endpoints `https://mcp.atlassian.com/v2/mcp` and
  `https://api.githubcopilot.com/mcp/`. Only endpoint host/path metadata was inspected; no
  credentials, environment values, or user data were read.
- Atlassian MCP v2 docs describe browser OAuth 2.1. Its public protected-resource and
  authorization-server metadata advertises S256 PKCE, client-ID metadata documents, a dynamic
  registration endpoint, and token endpoint auth method `none`; this supports a public MCP
  client without an embedded secret. Sources:
  https://support.atlassian.com/atlassian-ai-gateway/docs/get-started-with-the-atlassian-remote-mcp-server/
  and the live `mcp.atlassian.com` OAuth metadata.
- GitHub MCP documents a read-only endpoint; its public source marks `list_pull_requests`,
  `pull_request_read`, and `get_label` read-only and `pull_request_read` supports details, status,
  reviews, comments, and check runs. The PR projection contains number/title/state/draft/merged/
  mergeable state/URL/author/labels/requested reviewers/created-updated-merged dates. Labels in
  the list projection are names only; the read-only `get_label` tool returns color. These sources
  suggest parity is possible. Exact deployed list behavior, pagination, status-rollup mapping,
  and authorization scopes are required pre-cutover tests under Requirement.md AC-015.
- Unauthenticated MCP `initialize` probes returned 401 from both configured remote endpoints,
  as expected; this environment cannot access the user's already-authorized VS Code MCP session.
  No MCP tools were called and no private Jira/GitHub data was requested.
- This story's existing GitHub Attention Inbox needs `PullRequestSummary` fields defined in
  `src/github/types.ts`; `GitHubClient.fetchOpenPullRequests` maps GraphQL `statusCheckRollup`,
  reviews/comments, labels, mergeability, draft filtering, and requested reviewers; the
  `AttentionEngine` uses those values for existing classifications. The user blocks cutover if
  live GitHub MCP schemas/output cannot reproduce this; AC-015 makes parity an acceptance
  condition.
- Existing GitHub data requirements are grounded in `PullRequestSummary`
  (`src/github/types.ts`), `GitHubClient.fetchOpenPullRequests` (`src/github/client.ts`), and
  `AttentionEngine` (`src/github/attentionEngine.ts`).
- Copilot SDK documentation confirms Node sessions support `mcpServers`; Phase 2 must reuse the
  authorized MCP service rather than assume Copilot Chat credentials are visible to the
  extension. Source: https://github.com/github/copilot-sdk/blob/main/docs/features/mcp.md
- The user specified an extension-owned `.mcp.json` containing only non-secret MCP endpoints;
  authentication credentials are stored separately in SecretStorage.
- Jira PR linkage depends on GitHub MCP returning PRs for the existing `monitoredRepos`; when no
  repos are monitored or the service is unavailable, the Jira panel shows `not-available` and
  continues rendering Jira tasks.
- `GitHubConfigStore.addRepo`/`addAuthor` validate each entry against the live API before
  persisting it to `vscode.workspace.getConfiguration(...).update(...)`. The Jira equivalent
  (validate a saved JQL query by test-running it) follows the same persistence mechanism
  (`devAssistant.jira.*` settings) and the same validate-before-save shape.

## Dependencies
- Atlassian MCP v2 and GitHub MCP remote services are external dependencies. Copilot SDK is a
  future-phase dependency. GitHub MCP read-only feature parity is an explicit pre-cutover
  acceptance condition.

## Decision Log Entries
See `DecisionLog.md` in this story folder — tier assessment entry already recorded.
