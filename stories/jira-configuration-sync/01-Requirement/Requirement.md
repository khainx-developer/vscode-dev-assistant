# Business Requirement Specification — Jira Configuration & Task Sync

- **Story ID**: jira-configuration-sync
- **Status**: Approved
- **Author**: Architect/Analyst agent (ai-factory-requirement, default: Claude)
- **Date**: 2026-10-31

Follows `ai-factory/gates/brs-standard.md`. Describes **what** the system must achieve — no
implementation details (those belong in `03-Design/Design.md`).

## 1. Business Context
- Current process: Developers using this VS Code extension can already monitor GitHub pull
  requests (`src/github/*`), but have no way to see their Jira work items without leaving the
  editor and opening the Jira web UI.
- Existing problems: Developers context-switch to a browser to check which Jira tickets are
  theirs, what state those tickets are in, and whether a given ticket already has a pull request
  open against it.
- Business objectives: Bring Jira task visibility into the same in-editor surface the GitHub
  integration already provides, and let a developer see at a glance whether a Jira ticket has a
  matching GitHub PR and what state that PR is in.
- Why this feature is needed: Jira is the team's issue tracker; GitHub is where the code for
  those issues lives. Today nothing in this extension connects the two.
- Expected business value: Fewer context switches, faster triage of "what still needs a PR"
  versus "already has one in flight."
- Why is this feature important? It closes the loop between planning (Jira) and execution
  (GitHub) inside the same tool developers already use for the GitHub half.
- What problem does it solve? Not knowing, without leaving the editor, which of your Jira
  tickets already have an associated PR, and that PR's state.
- What happens if it is not implemented? Developers keep manually checking Jira and GitHub
  separately and manually correlating ticket keys to branches/PRs.

## 2. Stakeholders
| Stakeholder | Responsibilities | Expectations | Permissions |
|---|---|---|---|
| Business owner | Owns the extension's roadmap | Feature works reliably, matches existing GitHub integration's quality bar | Approves scope |
| Product owner | Prioritizes this story | Jira tasks are visible and correlated to PRs without extra manual steps | Approves acceptance criteria |
| End users (developers) | Authorize Atlassian/GitHub MCP connections in the browser, choose a Jira site, manage saved queries, and read the task/PR views | Accurate, low-friction, no API token entry and no need to leave the editor except for sign-in | Authorize their own accounts; read-only access in this extension |
| Administrators | Approve or restrict Atlassian/GitHub MCP access | Clear app identity, least-privilege read access, no embedded client secret | May allow or deny consent under organizational policy |
| External systems | Atlassian MCP server, GitHub MCP server, and Copilot SDK in a later phase | Browser authorization, least-privilege read access, complete behavior parity for current GitHub features | MCP servers enforce each user's permissions; this phase makes read-only calls |

## 3. Business Goals
- Let a developer see their Jira tasks inside the editor without opening a browser.
- Let a developer tell, for each visible Jira task, whether a GitHub PR already exists for it
  and what state that PR is in, without manually cross-referencing ticket keys to PRs.
- Match the reliability and failure-handling bar already set by the existing GitHub integration
  (`src/github/*`), rather than introducing a second, inconsistent standard for provider
  integrations in this extension.
- Establish MCP connections that a future Copilot SDK chat feature can reuse without asking the
  developer to authorize the same MCP servers again.

## 4. Scope
- Connecting to one Jira Cloud site using browser-based Atlassian OAuth authorization; the
  developer provides the site URL and grants the requested read-only access.
- Connecting to the configured Atlassian MCP server using its supported browser authorization;
  no client secret or API token is entered or embedded in the extension.
- Configuring Atlassian and GitHub MCP endpoint definitions for Dev Assistant without storing
  credentials in the MCP configuration file.
- Storing MCP authorization credentials in VS Code `SecretStorage`, never in settings or webview
  state.
- Replacing current GitHub Attention Inbox data retrieval with the configured GitHub MCP server,
  while preserving all current user-visible behavior and monitored repository/author settings.
- Storing one or more user-defined, named, saved JQL queries ("saved queries") used to fetch
  Jira issues.
- Validating a saved query against the live Jira site before it is persisted.
- Fetching and displaying the issues returned by each saved query, in a new webview panel
  alongside (not replacing) the existing GitHub PR view.
- Manual refresh and automatic periodic refresh of the task list while the panel is visible.
- For each displayed Jira task, determining whether a GitHub PR already exists for it by
  matching the Jira issue key against the branch name or title of pull requests retrieved through
  GitHub MCP for the existing `monitoredRepos`, and, if a match is found, showing that PR's state
  (open/merged/closed) and a link to open it.
- Opening a Jira task in the browser.
- Removing a previously-saved query.
- Classifying and surfacing failures (auth expired, rate limited, invalid query, network)
  per saved query, the same way the GitHub integration surfaces per-entry failures today.
- Disconnecting the active Jira site and clearing its locally stored OAuth credentials.
- Reusing the authorized MCP connections for a future Copilot SDK chat feature; the chat UI is
  not part of this phase.

## 5. Out of Scope
- Any write/mutating action against Jira: creating, editing, transitioning, or commenting on an
  issue. This story is read-only against Jira.
- Jira Server / Data Center support — this story targets Jira Cloud only.
- Direct Jira/GitHub REST data clients, email/API-token authentication, API-token fallback, or a
  custom OAuth broker.
- Deriving a default JQL query (e.g. "assigned to me") on the user's behalf — the user always
  supplies the JQL for every saved query.
- Authoritative PR linkage via Jira's own "dev-status" integration/smart-commits API — linkage
  in this story is inferred client-side by matching issue keys against already-fetched GitHub
  PR data, not fetched from Jira.
- A change to the existing GitHub integration's visible behavior or settings; only its data
  source changes to GitHub MCP, and current behavior must be preserved.
- Multi-user/admin configuration — each developer configures their own Jira connection locally,
  there is no shared/team-level Jira config.
- Notifications (e.g. desktop notification when a Jira task changes state) — not requested and
  not part of this story.
- The Copilot SDK chat UI and conversational behaviors — planned for a later phase.

## 6. Actors
| Actor | Responsibilities | Permissions | Limitations |
|---|---|---|---|
| Developer (end user) | Authorizes the Atlassian and GitHub MCP connections, manages saved queries, reads Jira tasks and GitHub attention items | Grant read-only access; configure monitored repos/authors and JQL; refresh; open tasks/PRs | Cannot perform write actions through this feature; cannot view another developer's local connections/settings |
| Atlassian MCP server | Authenticates the user and supplies Jira issue/search tools | N/A (external) | Access is limited to the MCP grant and the user's Jira permissions |
| GitHub MCP server | Supplies GitHub pull-request data for the Attention Inbox and Jira PR linkage | N/A (external) | This extension invokes read-only tools only; access is limited to the user's GitHub permissions |
| Copilot SDK (future phase) | Provides a conversational interface using the same authorized MCP services | N/A in this phase | Must reuse the existing user-scoped MCP authorization; no separate secret or bypass |

## 7. Terminology
| Term | Definition |
|---|---|
| Jira site | The Jira Cloud instance a developer connects to, identified by its base URL (`https://<site>.atlassian.net`) |
| MCP connection | An authenticated connection from Dev Assistant to a configured MCP server, authorized on behalf of the local developer |
| MCP service | A remote service exposing tools through the Model Context Protocol |
| Saved query | A user-named JQL string stored in `devAssistant.jira.*` settings, used to fetch a set of Jira issues |
| Jira task | An issue returned by running a saved query against the Jira site; displayed in the Jira panel |
| Issue key | Jira's unique identifier for an issue (e.g. `PROJ-123`), used both to display a task and to match it against GitHub PRs |
| PR linkage | The inferred relationship between a Jira task and a GitHub pull request, established by matching the issue key against a PR's branch name or title |
| Jira panel | The new webview view this story adds, showing Jira tasks, sibling to the existing GitHub PR view |

## 8. Functional Requirements
| ID | Description | Business Reason | Expected Result |
|---|---|---|---|
| FR-001 | The developer can enter a Jira site URL and authorize the configured Atlassian MCP connection in a browser | A Jira connection must exist before any task can be fetched, without asking the developer to create or paste an API token | VS Code returns to the extension after MCP authorization; the developer confirms one authorized site, and MCP credentials are stored in SecretStorage |
| FR-002 | The developer can add a named saved query consisting of a label and a JQL string | Each Jira instance's relevant issues differ too much for a fixed default query | A new saved query is validated through Atlassian MCP and, if valid, persisted |
| FR-003 | Before persisting a new saved query, the system test-runs its JQL through Atlassian MCP against the configured Jira site | Catching a malformed or inaccessible query at save time avoids silent failures later | The MCP-provided Jira validation error (if any) is returned to the developer and the query is not saved; on success the query is saved |
| FR-004 | The developer can remove a previously-saved query | Saved queries can become stale or incorrect | The query is removed from settings and no longer fetched |
| FR-005 | The system fetches and displays the issues returned by every saved query through Atlassian MCP in a new Jira panel | Surfacing Jira tasks in-editor is the core of this story | Each Jira task shows at minimum its issue key, summary, status, and a link to open it in the browser |
| FR-006 | The developer can trigger a manual refresh of the Jira panel | Developers need to see current data without waiting for the automatic interval | A fresh fetch of all saved queries is triggered immediately |
| FR-007 | The Jira panel automatically refreshes on a periodic interval while visible, and pauses refreshing while hidden | Matches the existing GitHub panel's refresh behavior; avoids wasted API calls while not visible | Refresh occurs on becoming visible and on the same interval as the GitHub panel while visible; no refresh occurs while hidden |
| FR-008 | For each displayed Jira task, the system determines whether a GitHub PR exists for it by matching the task's issue key against the branch name or title of pull requests retrieved through GitHub MCP for the existing monitored repositories | Closes the loop between Jira planning and GitHub execution without a separate GitHub REST data client | Each Jira task shows "has PR" (yes/no); if yes, the matched PR's state (open/merged/closed) and a link to open that PR |
| FR-009 | If no GitHub repos are monitored or the GitHub MCP connection is unavailable, the Jira panel still displays tasks with PR linkage shown as unknown/not-available rather than as an error | Jira task visibility must not depend on GitHub being configured or reachable | Jira tasks render normally; PR-linkage indicator shows a distinct "not available" state, not a Jira failure |
| FR-010 | A failure fetching a given saved query (auth expired, rate limited, invalid query, network) is attributed to that specific saved query and does not prevent other saved queries from displaying their results | One broken query must not hide working queries | Each saved query's failure (if any) is shown against that query only; other queries' tasks still render |
| FR-011 | The developer can disconnect the active Jira MCP connection | Users must be able to remove authorization from this extension | MCP credentials and active-site association are cleared; saved JQL queries remain |
| FR-012 | The existing GitHub Attention Inbox continues to provide all current behavior while its GitHub data is retrieved through GitHub MCP | The MCP migration must not reduce the existing GitHub feature | Existing repo/author configuration, PR summaries, reviews, comments, checks, requested reviewers, attention classification, and UI behavior remain equivalent |
| FR-013 | The MCP authorization established by Dev Assistant is reusable by a future Copilot SDK chat feature | The Phase 1 MCP foundation should avoid a second login or duplicate MCP integration in Phase 2 | Future chat can access the same authorized MCP services without asking the developer to authorize them again |

## 9. Business Rules
| ID | Rule |
|---|---|
| BR-001 | A saved query cannot be persisted unless it has both a non-empty label and a non-empty JQL string that successfully executes against the configured Jira site at save time |
| BR-002 | MCP authorization credentials are stored only in VS Code `SecretStorage`; no API token or OAuth client secret is entered, logged, or embedded in the extension |
| BR-003 | No write operation against Jira or GitHub is permitted through the MCP connections used by this feature |
| BR-004 | PR linkage is determined only by matching a Jira issue key against the branch name or title of PRs retrieved through GitHub MCP; the feature does not query Jira's own PR-linkage data |
| BR-005 | Two saved queries cannot share the same label |
| BR-006 | Jira and GitHub MCP access through this feature is read-only and cannot exceed the signed-in user's permissions |
| BR-007 | After a successful MCP authorization, any legacy Jira API token is deleted and is never used as an authentication fallback |
| BR-008 | GitHub MCP cutover is not complete unless FR-012 parity is proven; if any required existing behavior cannot be supplied by GitHub MCP read-only tools, the cutover remains blocked |

## 10. Validation Rules
| ID | Rule |
|---|---|
| VR-001 | Jira site URL must be a valid absolute HTTPS URL for a Jira Cloud site |
| VR-002 | An MCP connection is active only after successful browser authorization, valid callback state, and confirmation of one authorized Jira site |
| VR-003 | MCP authorization credentials must never be persisted in plain VS Code settings or exposed to a webview |
| VR-004 | Saved query label must be non-empty, unique (case-insensitive) among existing saved queries, and contain no leading/trailing whitespace |
| VR-005 | Saved query JQL string must be non-empty and must be accepted by Jira when test-run (HTTP 200 from the search endpoint) |

## 11. Workflow
Primary flow — configuring the connection and first saved query:

```
Developer opens Jira panel (not yet configured)
   ↓
Developer enters the Jira site URL and selects Connect with Atlassian
   ↓
Browser opens; developer signs in and grants read-only access to the Atlassian MCP server
   ↓
VS Code returns to the extension; developer confirms one accessible Jira site
   ↓
The extension completes MCP authorization and stores its user-scoped credentials in SecretStorage
   ↓
Developer adds a saved query (label + JQL)
   ↓
System test-runs the JQL through Atlassian MCP
   ↓
Valid → query saved → system fetches issues for all saved queries
   ↓
System matches each issue's key against GitHub MCP PR data for PR linkage
   ↓
Jira panel renders tasks (with PR linkage where found)
```

Primary flow — steady-state refresh:

```
Jira panel becomes visible (or manual refresh triggered)
   ↓
System re-fetches issues through Atlassian MCP for every saved query
   ↓
System re-matches PR linkage against current GitHub MCP PR data
   ↓
Jira panel re-renders; periodic refresh continues while visible, pauses while hidden
```

Alternative flows:
- Developer cancels or denies browser authorization → show a clear message and preserve any
  existing connection; do not store partial tokens.
- MCP authorization callback or token exchange fails → show a connection failure; no new
  connection is activated.
- More than one Jira site is authorized → developer chooses one active site; only that site is
  used for this connection.
- MCP access token expires → refresh through the MCP authorization server when possible; if
  refresh fails, require browser reauthorization and do not silently fall back to API-token auth.
- Saved query fails Jira's own validation at save time → system shows Jira's error message, the
  query is not saved, developer stays on the add-query form.
- A previously-valid saved query starts failing on refresh (e.g. token revoked, query now invalid
  due to a deleted Jira field) → that query's failure is shown per FR-010; other queries keep
  working.
- No GitHub repos monitored → PR linkage renders as "not available" per FR-009 instead of being
  treated as an error.
- Developer removes a saved query → its tasks disappear from the panel on the next render; no
  refetch of other queries is required.

## 12. Exception Scenarios
| Scenario | Expected System Behavior |
|---|---|
| Atlassian or GitHub MCP access token expires or is revoked | Attempt the MCP authorization server's refresh flow; if refresh fails, show an auth-expired failure and require browser reauthorization; no API-token fallback is offered |
| Browser authorization is canceled or denied | Preserve any existing connection, store no partial tokens, and show a clear result to the developer |
| MCP authorization callback state is invalid or the callback is missing | Reject the authorization attempt, preserve any existing connection, and show a connection failure |
| Atlassian or GitHub MCP server is unavailable | Preserve Jira task or GitHub state as applicable, show a connection/network error, and do not mark data as refreshed |
| Authorized Jira site is not accessible to the developer | Reject site confirmation and explain that the signed-in account lacks access |
| Jira rate limit hit (429 or equivalent) | That saved query's fetch is classified as rate-limited, including a reset time if Jira provides one, and shown per FR-010 |
| Saved query's JQL becomes invalid after being saved (e.g. referenced project deleted) | That saved query's fetch is classified as invalid-entry and shown per FR-010 |
| MCP server network/timeout during a saved query | That saved query's fetch is classified as a network failure and shown per FR-010 |
| Jira site URL unreachable or malformed at connection time | Connection is rejected with a validation error (VR-001); no saved query can be added until the connection is valid |
| No saved queries configured yet | Jira panel shows an empty/setup state prompting the developer to add a connection and a saved query, not an error |
| GitHub MCP has no monitored repos or is unavailable | Jira PR linkage shows as "not available" (FR-009), not a Jira query error |
| Jira issue key appears in more than one fetched GitHub PR's branch/title | The most recently updated matching PR is used for linkage (deterministic tie-break); this is a documented simplification, not an invented silent behavior — call out in Risks §23 |

## 13. Authorization Rules
| Actor | Allowed Operations | Restricted Operations | Approval Required |
|---|---|---|---|
| Developer (end user) | Authorize their own MCP connections in the browser; choose one accessible Jira site; add/remove own saved queries; trigger refresh; open tasks/PRs | Cannot perform any Jira or GitHub write operation through this extension; cannot view another developer's local connections/queries | Atlassian/GitHub normal consent and organization policies apply |

## 14. Audit Requirements
- What must be logged: N/A — this extension has no existing audit-log subsystem (the GitHub
  integration has none either); no new audit trail is introduced by this story.
- Who performed the action: N/A
- Old value / new value captured: No
- Timestamp: No
- Reason captured: No
- Compliance requirements: None identified — no PHI/PII is created; MCP authorization credentials
  are handled per BR-002, not an audit concern.

## 15. Notifications
N/A — explicitly Out of Scope (§5). No trigger in this story causes a notification to be sent.

## 16. Non-Functional Requirements
- Performance: Fetching all saved queries and matching PR linkage on refresh completes without
  blocking the editor UI thread (asynchronous, same as the existing GitHub refresh).
- Availability: Feature operates while VS Code and the panel are open; MCP services must be
  reachable for authorization and data refresh.
- Scalability: Must support at least as many saved queries as a developer reasonably configures
  (tens, not hundreds) without the UI becoming unusable; no specific numeric ceiling is required
  by the business for this story.
- Reliability: A failure in one saved query must never prevent other saved queries or the
  existing GitHub panel from functioning (FR-010).
- Maintainability: Jira and GitHub data access is through MCP services, with authorized
  connections reusable by the future Copilot SDK chat feature; concrete module boundaries are
  Design.md's responsibility.
- Security: MCP access/refresh tokens are never stored in plain settings or exposed to the
  webview; only read-only tools are invoked (BR-003).
- Accessibility: Jira panel follows the same accessibility bar as the existing GitHub panel (no
  new accessibility requirement introduced or waived by this story).
- Localization: No new localization requirement beyond what the existing GitHub panel already
  does (English only today).

## 17. Data Requirements
- Required entities: Jira MCP connection (active Jira site URL, authorized user identity, MCP
  credential reference), GitHub MCP connection, saved query (label, JQL string), Jira task
  (issue key, summary, status, assignee, link, PR-linkage info), GitHub pull-request summary.
- Relationships: A saved query produces zero or more Jira tasks; a Jira task has zero or one
  linked GitHub PR (inferred, not stored by Jira).
- Ownership: All data is scoped to the local developer's VS Code installation; no shared/team
  data store.
- Retention: MCP connection credentials use VS Code `SecretStorage` and remain until disconnect
  or credential revocation; connection and saved-query settings persist until the developer
  removes them or uninstalls the extension; fetched task data is in-memory only, not persisted across sessions
  (matches GitHub's `lastSeenStore` pattern of persisting only what's needed for "new activity"
  comparisons — whether this feature needs an equivalent persisted "last seen" store is a
  Design.md decision, not a new business requirement here).
- Sensitive data / PII: MCP access/refresh tokens are credentials handled per BR-002. Issue
  content (summaries, assignee names) is treated the same as the equivalent GitHub PR data
  already handled by this extension.
- Soft delete: N/A — removing a saved query is a hard removal from local settings (FR-004).
- Archiving: N/A.

## 18. Integration Requirements
- External systems: Atlassian MCP server, GitHub MCP server, and (in a later phase) Copilot SDK.
- Protocols: HTTPS Model Context Protocol (MCP) for remote Jira and GitHub data access.
- Authentication: Browser-based MCP authorization supported by each configured server.
  Atlassian uses its advertised OAuth 2.1 public-client flow; GitHub reuses the existing VS Code
  GitHub sign-in when accepted by the MCP server, otherwise the developer may complete that
  server's separate browser authorization. No broker, embedded client secret, or API-token
  fallback is used.
- Retry policy: No automatic retry on failure within this story — a failed fetch is surfaced per
  FR-010 and resolved on the next manual or scheduled refresh, matching the existing GitHub
  integration's behavior (it does not auto-retry either).
- Failure handling: Per Exception Scenarios (§12); each saved query's failure is isolated and
  classified (auth-expired, rate-limited, invalid-entry, network).
- Timeouts: MCP calls must not hang indefinitely; calls that exceed a bounded time are treated
  as network failures (§12); exact timeout value is a Design.md decision.
- Idempotency: All Jira calls in this story are read-only (search/validate); idempotency is
  inherent, no special handling required.

## 19. Reporting Requirements
N/A — this story adds a task list view, not a report/dashboard. No filter/sort/group/export
requirement is in scope.

## 20. Acceptance Criteria
1. Given no Jira connection is configured, when the developer opens the Jira panel, then it
   shows a setup prompt rather than an error.
2. Given the developer enters a Jira site URL and selects Connect, when they sign in and grant
   access through Atlassian MCP in the browser, then VS Code returns to the extension, one
   authorized site is confirmed, and MCP credentials are stored in SecretStorage without asking
   for an API token or client secret.
3. Given a saved connection, when the developer adds a saved query with an invalid JQL string,
   then Jira's validation error is shown and the query is not saved.
4. Given a saved connection, when the developer adds a saved query with valid JQL, then the
   query is saved and its matching issues appear in the Jira panel.
5. Given at least one saved query returns issues, when one of those issues' key matches the
   branch name or title of a PR retrieved through GitHub MCP, then that Jira task
   shows "has PR: yes" with the PR's state and a working link to open it.
6. Given at least one saved query returns issues, when no GitHub PR's branch/title matches an
   issue's key, then that Jira task shows "has PR: no".
7. Given no GitHub repos are monitored, when the Jira panel renders, then PR linkage shows as
   "not available" for every task, not as an error.
8. Given MCP credentials expire, when the server's refresh flow succeeds, then queries continue
   working; when refresh fails, then the developer is asked to reauthorize and no API-token
   fallback is used.
9. Given the Jira panel is visible, when the configured refresh interval elapses, then the panel
   automatically re-fetches; given the panel is hidden, then no automatic re-fetch occurs.
10. Given a saved query exists, when the developer removes it, then its tasks no longer appear
    in the panel and no further fetch is made for that query.
11. Given the developer has an existing MCP connection, when they cancel or deny a new
    authorization, then the existing connection remains unchanged and no partial credentials are saved.
12. Given the current GitHub Attention Inbox is used after the MCP cutover, then its existing
    displayed fields (PR state/title/author/labels/check status/mergeability/reviews/comments/
    requested reviewers), filters, failure behavior, and attention classification remain
    equivalent.
13. Given the future Copilot SDK chat feature is added, then it can use the existing authorized
    MCP connections without a second browser authorization.
14. Given a legacy Jira API token exists in SecretStorage, when Atlassian MCP authorization
    succeeds, then the legacy token is deleted and is never used as a fallback.
15. Before the GitHub MCP data source replaces the existing GitHub data source, given monitored
    repositories with pull requests, then read-only MCP tool results can populate every field
    and attention input required by the current GitHub integration; if parity is not proven,
    the cutover is not completed.

## 21. Open Questions
None blocking. The GitHub MCP cutover is explicitly gated by Acceptance Criterion 15 and BR-008:
the implementation must prove read-only parity before switching data sources; otherwise it
remains blocked. Atlassian MCP's public OAuth metadata and browser authorization flow are
documented in Analysis.md's Feasibility Notes and will be validated during implementation without
exposing user credentials or issue content.
- The tie-break rule for an issue key matching multiple PRs (§12, last row) remains a stated
  simplification/risk (§23).

## 22. Assumptions
- MCP access/refresh credentials are stored in VS Code `SecretStorage`; no OAuth client secret
  or API token is embedded or entered — approved by: user, on: 2026-10-31.
- Atlassian MCP browser authorization returns automatically to VS Code, and the developer
  selects one active authorized Jira site — approved by: user, on: 2026-10-31.
- For GitHub MCP, reuse the existing VS Code GitHub sign-in if accepted by the server; otherwise
  allow a separate browser authorization — approved by: user, on: 2026-10-31.
- Current GitHub Attention Inbox behavior is preserved; if GitHub MCP cannot provide parity, the
  cutover remains blocked — approved by: user, on: 2026-10-31.
- Future Copilot SDK chat reuses the already-authorized MCP connections — approved by: user, on:
  2026-10-31.
- On successful Atlassian MCP authorization, any legacy API token is deleted; canceled or failed
  authorization does not change an existing connection — approved by: user, on: 2026-10-31.
- API-token authentication and fallback are removed from this story — approved by: user, on:
  2026-10-31.
- MCP authorization refresh is attempted without prompting; if refresh fails, the developer must
  reauthorize — approved by: user, on: 2026-10-31.
- Automatic refresh mirrors the existing GitHub integration's `RefreshScheduler` behavior
  (refresh on becoming visible, poll on an interval while visible, pause while hidden, plus
  manual refresh) — approved by: user, on: 2026-10-31 (direct consequence of "reference how
  github work" and the chosen UI-surface answer).
- Failure classification mirrors the existing GitHub integration's four categories
  (auth-expired, rate-limited, invalid-entry, network), re-mapped from Jira's own HTTP status
  codes — approved by: user, on: 2026-10-31 (direct consequence of "reference how github work").

## 23. Risks
- Business risk: Organization policy may block the OAuth app or user consent; the extension must
  report that clearly and the administrator may need to approve the app.
- Technical risk: Branch/title key-matching for PR linkage (BR-004) is a heuristic, not an
  authoritative Jira-side link — it can produce false negatives (PR exists but doesn't mention
  the key in branch/title) or, per the documented tie-break (§12), pick the wrong PR when a key
  appears in more than one candidate. This is an accepted limitation of the client-side-matching
  approach the user chose over querying Jira's dev-status API.
- Legal risk: None identified — no PHI/PII, no new data retention beyond local developer
  settings.
- Migration risk: A legacy API token may remain from a development version until successful
  Atlassian MCP authorization; successful authorization must delete it, and API-token fallback
  is not permitted.
- Security risk: MCP authorization credentials must remain in SecretStorage and the extension
  must invoke read-only toolsets only. Residual risks include local secret-store compromise and
  MCP provider compromise or overbroad authorization grants.
- Performance risk: A developer with many saved queries could trigger many parallel Jira
  requests on refresh; exact concurrency/throttling approach is a Design.md decision, not
  resolved here.

## 24. Requirement Traceability
| Business Goal | FR ID(s) |
|---|---|
| Let a developer see their Jira tasks inside the editor without opening a browser | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-010, FR-011 |
| Let a developer tell, for each visible Jira task, whether a GitHub PR already exists and its state | FR-008, FR-009 |
| Preserve current GitHub Attention Inbox behavior while moving data access to MCP | FR-012 |
| Reuse authorized MCP connections for future Copilot SDK chat | FR-013 |
| Match the reliability/failure-handling bar set by the existing GitHub integration | FR-007, FR-009, FR-010, FR-012 |

## Completion Checklist
Self-assessed against `ai-factory/gates/brs-standard.md#completion-checklist`:
- [x] Every actor is identified
- [x] Every business rule is documented
- [x] Every validation rule is documented
- [x] Every workflow is described (including alternative flows)
- [x] Every failure scenario is covered
- [x] Every permission is defined
- [x] Every acceptance criterion is measurable
- [x] Every unknown is documented in Open Questions
- [x] No implementation details exist (file/module names appear only in Analysis.md's
      Feasibility Notes and this document's Non-Functional §16 as *consistency* requirements,
      not as prescribed implementation — concrete file/class design is Design.md's job)
- [x] No contradictions exist
- [x] No duplicated requirements exist
- [x] No ambiguous wording exists (no anti-patterns)
- [x] No hidden assumptions exist (every assumption in §22 was explicitly approved by the user)

## Approval Gate — Definition of Ready
See `ai-factory/gates/approval-gates.md#01-requirement--02-analysis` and
`ai-factory/gates/brs-standard.md#definition-of-ready-for-system-design`.
- [x] Business goals are fully understood
- [x] Scope is finalized
- [x] All critical questions are answered
- [x] No blocking unknowns remain
- [x] Acceptance criteria are complete
- [x] Design could begin without guessing

Previous Requirement gate approvals for API-token authentication and broker-based OAuth are
superseded.
**Gate confirmed by user — 2026-10-31 (HumanAutoApprove; self-check clean; GitHub MCP parity remains a pre-cutover acceptance condition)**
