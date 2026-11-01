# System Design Specification — Jira Configuration & Task Sync

- **Story ID**: jira-configuration-sync
- **Status**: Approved
- **Author**: Architect/Analyst agent (ai-factory-design, default: Claude)
- **Input**: `01-Requirement/Requirement.md` only
- **Date**: 2026-10-31

Follows `ai-factory/gates/sds-standard.md`. Describes the system-level solution; task
decomposition is owned by `04-ExecutionPlan/ExecutionPlan.md`.

## 1. Solution Overview
Dev Assistant remains a single VS Code extension with two data experiences: the existing GitHub
Attention Inbox and the Jira task panel. Both data sources move behind an extension-owned MCP
integration layer that connects to the configured remote GitHub and Atlassian MCP services.

The extension owns its MCP client sessions and browser authorization state. Jira credentials
are stored in VS Code SecretStorage. GitHub authorization reuses the existing VS Code GitHub
session when the remote MCP server accepts it; otherwise, the extension uses that MCP server's
supported browser authorization flow. MCP authorization is not borrowed from Copilot Chat.

Jira saved-query management and task display continue to use local extension settings and the
existing webview/controller pattern. GitHub monitored repositories/authors, Attention Inbox
classification, and UI remain behaviorally equivalent. A shared, in-memory PR cache supplies
the Jira linkage view.

The Copilot SDK chat UI is a later phase. The MCP connection service is shared so future
Copilot SDK tools can invoke the same authorized MCP service without opening another login flow.
The SDK chat itself is not part of this story.

GitHub MCP cutover is gated on field and behavior parity with the current Attention Inbox. The
old data source is not removed or considered replaced until Requirement.md AC-015 passes.

## 2. Business Capability Mapping
| FR ID | Business Capability | System Module |
|---|---|---|
| FR-001 | Connect to one authorized Jira Cloud site using browser MCP authorization | MCP Connection Service + Jira Connection Store |
| FR-002 | Manage named saved JQL queries | Jira Configuration Store |
| FR-003 | Validate JQL before saving | Jira Controller + Atlassian MCP Adapter |
| FR-004 | Remove saved queries | Jira Configuration Store |
| FR-005 | Display Jira issues in a dedicated panel | Jira Controller + Jira Dashboard Panel |
| FR-006 | Refresh Jira issues on demand | Jira Controller + Refresh Scheduler |
| FR-007 | Refresh while the Jira panel is visible | Refresh Scheduler + Jira Controller |
| FR-008 | Match Jira keys to monitored GitHub PRs | GitHub MCP Adapter + Shared PR Cache + Jira Link Matcher |
| FR-009 | Display linkage as unavailable when GitHub data is absent | Jira Controller + Jira Dashboard Panel |
| FR-010 | Isolate failures by saved query | Jira Controller + MCP Error Mapper |
| FR-011 | Disconnect and clear the Jira authorization | MCP Connection Service + Jira Connection Store |
| FR-012 | Preserve the GitHub Attention Inbox while replacing its data source with MCP | GitHub MCP Adapter + Existing GitHub Controller/Attention Engine/UI |
| FR-013 | Reuse authorized MCP connections in a future Copilot SDK chat | Shared MCP Connection Service + Future SDK Tool Adapter |

## 3. Architecture Style
- **Style**: Modular monolith inside the existing VS Code extension, with outbound MCP adapters.
- **Why selected**: The extension already separates provider clients, configuration, view
  controllers, panels, and shared state. A single shared MCP boundary avoids duplicating protocol
  and authorization code between Jira, GitHub, and the planned Copilot SDK feature, while keeping
  the two provider domains independently testable.
- **Alternatives rejected and why**:
  - Direct Jira REST plus direct GitHub GraphQL/REST clients: rejected because the user selected
    MCP as the shared data integration and future AI foundation.
  - Copilot Chat's active MCP session: rejected because the extension has no supported public API
    for borrowing the Copilot host's credentials or invoking its configured tools.
  - A separate OAuth broker: rejected because the Atlassian MCP endpoint advertises public
    client authorization and the user wants no added broker service.
  - Copilot SDK as the sole Phase 1 data layer: rejected because the task and Attention Inbox
    panels require deterministic typed data rather than model-mediated summaries. The SDK is
    retained for Phase 2 and calls the same MCP service through app-defined tools.

## 4. System Context
| System | Purpose | Direction | Authentication | Failure Behavior |
|---|---|---|---|---|
| Atlassian MCP v2 | Jira site discovery, JQL validation, issue search/details | In/out | Browser OAuth 2.1 public-client flow advertised by MCP metadata; PKCE | Connection failure or per-query failure; Jira UI remains usable for local query configuration |
| GitHub MCP remote server | Read monitored repositories' PRs and related read-only data | In/out | Reuse VS Code GitHub session if accepted; otherwise MCP browser authorization | GitHub-specific error shown; Jira tasks continue and PR linkage becomes unavailable |
| VS Code Authentication API | Existing GitHub sign-in session | In/out | VS Code-managed GitHub session | If unavailable/not accepted by GitHub MCP, use the remote server's browser authorization flow |
| VS Code SecretStorage | Store MCP access/refresh credentials | In/out | VS Code/user operating-system secret storage | If unavailable, do not persist a connection; show an explicit error |
| Copilot SDK (future phase) | Provide an AI chat experience over the same MCP capabilities | In-process | Copilot SDK's supported user authentication; MCP tools call the shared extension MCP service | Future-phase behavior; not required for this story |

## 5. Domain Design
| Domain | Responsibilities | Owned Entities | Boundaries | Dependencies |
|---|---|---|---|---|
| MCP connection | Maintain authorized remote MCP client sessions and expose approved tools | MCP server connection, auth state | One connection per configured MCP service and local user | VS Code URI handling, SecretStorage, MCP services |
| Jira tasks | Manage Jira site/query configuration, retrieve Jira issues, and report per-query failures | Jira connection reference, saved query, Jira task, Jira failure | Read-only Jira data; no writes to Jira | Atlassian MCP connection |
| GitHub Attention Inbox | Preserve monitored repo/author configuration and compute current attention state from MCP PR data | PullRequestSummary, review/comment summaries, last-seen values | GitHub domain remains independent of Jira | GitHub MCP connection, VS Code GitHub auth if usable |
| PR linkage | Match Jira issue keys against the current shared PR snapshot | Jira-to-PR link state | Pure, read-only view relationship; no GitHub request initiated by Jira matcher | Jira tasks, shared PR cache |
| Copilot chat (future) | Provide conversational UI and invoke shared MCP-backed tools | Chat session/transcript | Not implemented in this story | Copilot SDK, shared MCP connection service |

## 6. Module Design
| Module | Responsibilities | Inputs | Outputs | Public Interfaces | Dependencies | Ownership |
|---|---|---|---|---|---|---|
| MCP connection layer (new shared module) | Own MCP HTTP transports, OAuth authorization state, token refresh, and read-only tool access | MCP endpoint definitions; user authorization; typed tool requests | Typed MCP results and normalized MCP errors | Connect/disconnect, list accessible Jira sites, invoke allowlisted read tools | MCP TypeScript client library, VS Code authentication/URI handling, SecretStorage | Extension integration layer |
| Atlassian MCP adapter | Translate Jira use cases into allowlisted MCP read operations | Site URL, JQL, query operation | Jira issue/query results | Jira site discovery, JQL validation/search, issue details | Shared MCP connection layer | Jira domain |
| GitHub MCP adapter | Translate existing GitHub client operations into allowlisted MCP read operations and map results to the existing GitHub data model | Monitored repos/authors, current GitHub identity | PR summaries, status/review/comment/reviewer data | Read-only repo/PR operations | Shared MCP connection layer | GitHub domain |
| Jira configuration store | Persist Jira site and saved queries, excluding secrets | Site selection, saved query input | Current connection metadata and saved queries | Get/save/remove configuration | VS Code settings, Jira connection layer | Jira domain |
| Jira controller/panel | Orchestrate refresh and render Jira task/linkage state | Typed Jira/GitHub data, user messages | Webview state and actions | Existing Jira panel message contract | Jira adapter, config store, shared PR cache | Jira UI |
| GitHub controller/Attention Engine | Preserve all current GitHub behavior using MCP-mapped `PullRequestSummary[]` | GitHub settings and MCP PR summaries | Existing GitHub view state and classifications | Existing GitHub message/state contract | GitHub MCP adapter, `AttentionEngine`, `LastSeenStore` | GitHub domain |
| Future Copilot SDK tool adapter | Present shared MCP operations as SDK-invokable tools | Chat request and shared MCP service | Tool results for model responses | SDK-defined tool interface | Copilot SDK; shared MCP connection layer | Future phase |

The dependency direction is: webviews/controllers → provider adapters/configuration → shared MCP
connection layer → remote MCP services. The MCP layer does not depend on Jira or GitHub view
controllers. The future SDK adapter calls the same MCP layer and does not create independent
provider credentials.

## 7. Data Flow
Jira connection and task refresh:
```text
Developer enters Jira site URL
   ↓
MCP connection layer discovers authorization metadata and opens browser consent
   ↓
VS Code URI callback validates OAuth state and completes the public-client flow
   ↓
Extension stores user credentials in SecretStorage and developer confirms one Jira site
   ↓
Saved JQL query → Atlassian MCP read-only search/validation
   ↓
Typed Jira issues → shared GitHub PR snapshot matching → Jira panel state
```

GitHub Attention Inbox refresh:
```text
Existing monitored repos/authors → GitHub MCP read-only tools
   ↓
Map MCP results into existing PullRequestSummary contract
   ↓
Parity gate verifies all existing PR fields and attention inputs
   ↓
Existing AttentionEngine/LastSeenStore → unchanged GitHub view state
```

Alternative flows: canceled/denied authorization preserves an existing connection; token
refresh failure requires browser reauthorization; MCP outage is reported per provider without
blocking the other provider; if the GitHub MCP parity gate fails, the existing GitHub data
source is not cut over.

## 8. Component Interaction
- **Synchronous**: Internal typed calls from controllers to provider adapters and the shared MCP
  client; MCP JSON-RPC `tools/list`/`tools/call` over HTTPS Streamable HTTP to remote servers.
- **Asynchronous**: Browser OAuth redirect/URI callback; panel refresh scheduler; concurrent
  saved-query MCP requests.
- Jira controller calls the Atlassian adapter for JQL and issue data. The PR matcher reads the
  shared cache; it does not call GitHub MCP. GitHub controller requests PR information through
  the GitHub adapter. Future Copilot SDK tools call the same shared MCP service.
- The UI receives only normalized domain data; raw MCP protocol envelopes and credentials never
  enter webview messages.

## 9. Database Strategy
- Technology: N/A — this extension has no database.
- Schema strategy: VS Code settings for non-secret site/query configuration; SecretStorage for
  MCP credentials; in-memory cache for fetched Jira issues and GitHub PRs.
- Tenant strategy: N/A — local developer profile only.
- Migration strategy: Remove legacy Jira API-token setting/secret after successful Atlassian MCP
  authorization; preserve saved queries and existing GitHub settings.
- Transaction strategy: N/A — independent VS Code setting/secret updates; do not activate new
  auth until browser flow/site confirmation succeeds.
- Index strategy: N/A.
- Archive strategy: N/A.
- Backup strategy: VS Code user settings/SecretStorage management; no extension-managed backup.
- Soft delete strategy: Removing a saved query deletes it from local settings.
- Audit strategy: Unchanged — no audit subsystem (Requirement.md §14).
- Expected growth: Tens of saved JQL queries and tens of PRs per monitored repo (Requirement.md §16).
- Data ownership: Local developer profile and the respective Atlassian/GitHub MCP accounts.

## 10. Multi-Tenancy
N/A — a single local VS Code developer profile is the tenancy boundary; each MCP connection
uses the local user's authorization and provider permissions.

## 11. API Design
No extension-hosted HTTP API is added. External APIs are MCP tool calls over the configured
remote MCP services.

| MCP operation | Purpose | Request/response contract | Authorization | Failure handling |
|---|---|---|---|---|
| Atlassian site/resource discovery | Confirm one accessible Jira site | MCP tool result mapped to site identity and URL | User-authorized Atlassian MCP connection | No accessible site or auth failure is shown as connection error |
| Atlassian JQL validation/search | Validate and fetch saved queries | JQL plus bounded result request; MCP results mapped to Jira tasks | Read/search-only Jira scopes and user permissions | Per-query classification and isolation |
| GitHub PR listing/details | Fetch open PRs for monitored repositories | Repo, PR identity, fields and status/review/comment methods from read-only toolset | Existing GitHub auth if accepted, otherwise MCP browser authorization | Per-repo failure; existing GitHub UI/error semantics preserved |
| GitHub label lookup | Preserve label color in existing PR cards | Repo + label name → label metadata | Read-only repo scope | Missing color falls back to existing neutral behavior; parity must be verified |

MCP protocol versioning and tool schema compatibility follow the remote servers. The extension
uses only read-only tools; it does not call Jira or GitHub write tools. MCP authorization state is
per local user and is not copied into Copilot Chat or webview state.

## 12. Event Design
N/A — no domain events, message broker, or event bus is introduced. MCP request/response
messages are synchronous protocol exchanges, not application events.

## 13. Background Processing
| Job | Trigger | Responsibility | Failure/Retry Behavior |
|---|---|---|---|
| Jira panel refresh | Panel becomes visible, manual refresh, or existing visible-panel interval | Refresh saved JQL queries and compute PR linkage | Per-query isolation; retry on next scheduled/manual refresh |
| GitHub Attention Inbox refresh | Existing GitHub panel scheduler/manual refresh | Fetch monitored repo PR data from GitHub MCP | Preserve current GitHub error classification/refresh behavior; do not cut over until parity gate passes |
| MCP credential refresh | MCP authorization response/expiry | Refresh user token according to server metadata | If refresh fails, require browser authorization and preserve other provider state |

No background job runs while its panel is hidden; no independent always-on process is added.

## 14. Security Design
- Authentication: Atlassian MCP public OAuth 2.1 flow with PKCE and supported client
  registration/discovery. GitHub uses the existing VS Code GitHub session when accepted by the
  server; otherwise it uses the GitHub MCP server's advertised browser authorization.
- Authorization / RBAC / claims: Provider permissions and user consent define access. Request
  least-privilege read/search scopes; preserve repository access constraints.
- PII protection: Issue titles, comments, review text, and author names are user content. Treat
  them as untrusted; escape them before webview rendering and do not include them in diagnostic
  logs unnecessarily.
- Encryption (at rest / in transit): HTTPS for MCP; VS Code SecretStorage for persisted MCP
  credentials.
- Secrets management: OAuth access/refresh credentials only in SecretStorage. No client secret,
  API token, or bearer token in `.mcp.json`, settings, logs, source control, or webview messages.
- Key rotation: Provider-managed OAuth refresh/revocation; reconnect if refresh fails.
- Token lifetime / session management: Maintain provider session lifecycle and disconnect
  clearing; no duplicate SDK login in Phase 2.
- Security logging: Log normalized category and operation only; redact authorization headers,
  OAuth codes, refresh tokens, and raw tool output containing user-authored text.
- Threat considerations: MCP services expose write-capable tools; the extension's allowlist and
  server endpoint selection must prevent all write/destructive calls. Treat MCP tool responses
  and PR/Jira content as untrusted data.

## 15. Performance Design
- Performance targets: No numeric latency target in Requirement.md; async refresh must not block
  the VS Code UI thread.
- Expected traffic / concurrent users: One local developer; saved query count in tens.
- Large dataset handling: Bounded page of Jira issues per saved query; page PR reads according to
  existing limits.
- Pagination strategy: Preserve the current Jira single-page behavior; GitHub MCP pagination must
  match current monitored PR limits or be documented as a parity blocker.
- Caching strategy: In-memory shared PR snapshot keyed by repository, overwritten after each
  successful refresh; no credential/data cache persisted beyond existing stores.
- Lazy loading / streaming: N/A for current views; requests are asynchronous.
- Database optimization: N/A.
- Connection pooling: Reuse MCP HTTP transports where supported by the selected MCP client.
- Async processing: Concurrent saved-query calls with per-query error isolation; GitHub refresh
  continues parallel per monitored repo.

## 16. Scalability Strategy
Unchanged — local VS Code extension architecture; no shared application server is introduced.
- Statelessness: Extension session state is local; remote MCP services own provider data.
- Distributed cache / message queue: N/A.
- Auto scaling: Remote MCP services are provider-operated; extension has no scaling service.
- Database / storage scaling: N/A.
- Future growth assumptions: A later Copilot SDK chat reuses the same MCP service and OAuth
  sessions; it does not add another provider credential flow.

## 17. Reliability
- Retry: No immediate retry loop; refresh again on the next scheduled/manual trigger.
- Timeout: Bound MCP calls; value selected in TDS against the VS Code interaction model.
- Circuit breaker: No application-managed circuit breaker; surface server availability and pause
  requests until the next refresh trigger.
- Fallback: Jira tasks remain visible if GitHub MCP is down; GitHub view reports its own failure.
  Do not silently fall back to direct REST or API-token access. Do not cut over GitHub source until
  parity validation succeeds.
- Redundancy: N/A; external services are provider-operated.
- Health checks: Connection/auth validation via MCP initialization and a read-only identity/site
  check where exposed by the service.
- Recovery / graceful degradation: Preserve last successful view state on transient provider
  failure; mark data stale/failed and never represent stale data as freshly fetched.
- Disaster recovery: Reauthorize after local SecretStorage loss; no extension-owned server data.

## 18. Observability
- Logging: Existing output-channel pattern; log MCP provider, normalized tool operation, duration,
  and error category. Never log tokens, OAuth callback query values, or raw user content.
- Metrics: No telemetry or remote metrics added.
- Tracing / correlation IDs: Use MCP request IDs only in local diagnostics where available; do not
  persist user query payloads.
- Monitoring / alerting: N/A — desktop extension, no hosted monitoring.
- Audit logs: Unchanged — no extension audit trail (Requirement.md §14).
- Diagnostic information: Report which provider/tool failed and whether the user must reconnect,
  without exposing credentials or private Jira/GitHub payloads.

## 19. Error Handling Strategy
- Validation errors: Site URL, saved query label/JQL, and repo/author configuration errors remain
  actionable and are shown in the relevant panel.
- Business errors: JQL validation errors are attributed to the saved query; unsupported or
  inaccessible Jira site is a connection error.
- Infrastructure errors: Normalize MCP authorization/transport/tool failures to existing
  `auth-expired`, `rate-limited`, `invalid-entry`, and `network` provider categories.
- Unexpected exceptions: Propagate to the existing provider/controller boundaries; do not return
  success-shaped empty data on protocol failures.
- Retryable vs non-retryable: Auth failure requires reauthorization; invalid JQL/config must be
  corrected; rate limits and transport failures retry on next scheduled/manual refresh.
- User-facing messages: Explain whether the issue is connection-wide or isolated to one saved
  query; keep Jira failures separate from GitHub failures.
- Internal logging: Redacted error category and operation; no authorization material or raw
  private tool payloads.

## 20. Deployment Architecture
- Hosting / containers / cloud resources: Unchanged — VS Code extension plus Atlassian/GitHub
  provider-hosted MCP endpoints; no broker or Azure Function.
- Networking / load balancer: Outbound HTTPS only from the extension.
- Storage: VS Code settings and SecretStorage.
- Configuration / environment strategy: Extension-owned `.mcp.json` has non-secret endpoint
  definitions only; user credentials are never stored there.
- CI/CD assumptions: Unchanged — existing extension build and test workflow.

## 21. Configuration Management
- Application settings: Existing `devAssistant.github.monitoredRepos` and
  `devAssistant.github.monitoredAuthors`; Jira site URL and saved queries under
  `devAssistant.jira.*`.
- Secrets: MCP authorization tokens in SecretStorage; no OAuth client secrets or API tokens.
- Feature flags: No feature flags. GitHub MCP cutover is gated by parity validation, not a
  runtime fallback toggle.
- Environment variables: N/A for remote MCP endpoint credentials.
- Dynamic configuration: Endpoint definitions are owned by Dev Assistant's `.mcp.json`;
  endpoints can be changed only through reviewed extension configuration updates.

## 22. Dependency Analysis
| Dependency | Purpose | Failure Impact | Fallback |
|---|---|---|---|
| Atlassian MCP v2 | Jira site auth, JQL validation, issue search/details | Jira connection/query failures | GitHub view remains available; no direct Jira REST fallback |
| GitHub MCP remote read-only endpoint | Existing GitHub Attention Inbox and Jira PR linkage | GitHub view errors; Jira tasks remain visible with linkage unavailable | No direct GitHub REST fallback after cutover; parity gate before cutover |
| VS Code SecretStorage | Persist user MCP credentials | Cannot retain auth across sessions | Require reauthorization; do not store credentials in settings |
| VS Code Authentication API | Reuse GitHub session if accepted by MCP | May require separate MCP browser authorization | Separate authorization allowed by Requirement.md |
| Copilot SDK (future phase) | Conversational UI over existing MCP capabilities | No impact on Phase 1 panels | Phase 1 MCP data views continue independently |
| MCP TypeScript client library | MCP transport, protocol, and OAuth client primitives | MCP connections cannot be established | Select a supported version compatible with extension host; no hand-rolled protocol fallback |

## 23. Risks
- Technical risk: GitHub remote MCP may not expose all fields or read-only calls used by the
  existing Attention Inbox. Mitigation: AC-015 is a hard pre-cutover gate; validate all mappings
  against the deployed read-only endpoint and preserve old behavior until it passes.
- Performance risk: MCP can require several tool calls per PR (list, status, reviews, comments,
  checks, and label colors). Mitigation: parallelize bounded reads, cache within the refresh,
  and verify runtime limits before cutover.
- Migration risk: Existing Jira API token and current direct REST clients are superseded.
  Successful MCP auth removes the legacy Jira token; no fallback is permitted.
- Operational risk: Provider MCP tool names/schemas may evolve. Mitigation: pin endpoint
  definitions, detect incompatible tool contracts, and fail visibly rather than silently dropping
  Attention Inbox fields.
- Security risk: MCP providers expose write-capable tools. Mitigation: use GitHub's read-only
  endpoint, restrict Atlassian invocations to read-only tools/scopes, and keep credential state
  out of webviews/logs.
- Third-party risk: Atlassian Rovo MCP usage may consume organization Rovo credits; GitHub MCP
  availability and authorization are provider-controlled.
- Scalability risk: Many monitored repos and saved queries can fan out into numerous tool calls.
  Mitigation: bound concurrency and retain existing polling cadence; tune in TDS.

## 24. Design Decisions
| Decision | Reason | Alternatives Considered | Trade-offs | Impact |
|---|---|---|---|---|
| Use remote MCP as the Jira and GitHub data boundary | The user wants one MCP-backed foundation for current views and future Copilot SDK chat | Direct provider REST clients; brokered Jira OAuth | MCP schemas can evolve and may require several calls; shared auth/tool boundary benefits later AI | Replaces provider data clients after parity validation |
| The extension owns MCP sessions and credentials | VS Code/Copilot-host MCP credentials are not exposed as a regular extension API; the extension needs the same connection for panels and future SDK tools | Borrow Copilot Chat MCP session; duplicate independent login inside Copilot SDK | Extension handles its own browser callbacks and SecretStorage | Shared auth service is required |
| Use Atlassian MCP OAuth 2.1 public-client flow; do not create an OAuth broker | Atlassian MCP advertises PKCE and public-client registration; no client secret is needed in the extension | Direct Jira REST 3LO with client secret; organization broker; API token | Depends on Atlassian MCP availability and OAuth metadata | No broker infrastructure or secrets in source |
| Use GitHub MCP read-only endpoint; reuse existing VS Code GitHub auth when accepted | Keeps the current sign-in flow and limits tool permissions | Write-capable endpoint; always ask for a second browser login | If GitHub token is not accepted, a separate MCP browser auth is allowed | Existing UI/configuration remains; data source changes |
| Preserve the existing GitHub model and gate cutover on full data parity | Reviews, comments, checks, requested reviewers, labels, and activity drive current views | Drop fields or change UI behavior | Multiple MCP reads may cost latency/calls | AC-015 blocks source cutover until parity tests pass |
| Future Copilot SDK uses shared MCP-backed tools | Prevents a second authorization and duplicated service integration | SDK opens separate MCP connections and credentials | Chat integration needs an adapter from SDK tools to the shared client | Phase 2 can add chat without reauth |
| Restrict MCP use to read-only tools and scopes | The current feature is read-only and the servers expose write-capable operations | Expose all available server tools | Some convenience tools are unavailable | Prevents accidental Jira/GitHub mutations |

## 25. Assumptions
- The user-approved MCP endpoints and service choice are those in the extension-owned `.mcp.json`
  (`https://mcp.atlassian.com/v2/mcp`, `https://api.githubcopilot.com/mcp/`) — approved by user,
  2026-10-31.
- MCP credentials are stored in VS Code SecretStorage, not in MCP endpoint configuration or
  ordinary settings — approved by user, 2026-10-31.
- Existing GitHub behavior is preserved and MCP parity is required before cutover — approved by
  user, 2026-10-31.
- Phase 2 Copilot SDK chat reuses the extension-owned MCP connections — approved by user,
  2026-10-31.

## 26. Open Questions
None blocking for the system design. The MCP TypeScript library version and exact per-tool
request/response mapping are code-level decisions for TDS. GitHub deployed-endpoint parity is a
hard acceptance gate (Requirement.md AC-015); a failure blocks implementation cutover, not the
approved behavior or system architecture.

## Design Validation Checklist
Self-assessed against `ai-factory/gates/sds-standard.md#design-validation-checklist`:
- [x] Every business requirement has a corresponding design
- [x] Every module has a defined responsibility
- [x] Every integration is documented
- [x] Every database decision is justified (N/A — no database)
- [x] Every API is identified (MCP operations documented in §11)
- [x] Every event is identified (N/A — no event bus)
- [x] Every security concern is addressed
- [x] Every scalability concern is addressed
- [x] Every deployment dependency is documented
- [x] Every architectural decision has a reason (§24)
- [x] No implementation tasks are included
- [x] No business requirement is ignored

## Approval Gate — Definition of Ready
See `ai-factory/gates/approval-gates.md#03-design-sds` and
`ai-factory/gates/sds-standard.md#definition-of-ready-for-technical-design`.
- [x] Every business requirement has a corresponding design
- [x] All architectural decisions are documented
- [x] No unresolved architectural blockers remain
- [x] External dependencies are fully identified
- [x] Security, scalability, reliability, and observability have been addressed
- [x] Technical Design can turn this into a code-level blueprint without making architectural
      decisions

**Gate confirmed by user — 2026-10-31 (HumanAutoApprove; AI Quality Gate and Design Validation Checklist clean)**
