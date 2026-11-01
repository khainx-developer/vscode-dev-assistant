# Technical Design Specification — Jira Configuration & Task Sync

- **Story ID**: jira-configuration-sync
- **Status**: Approved
- **Author**: Architect/Analyst agent (ai-factory-technical-design, default: Claude)
- **Input**: `03-Design/Design.md` (SDS) only
- **Date**: 2026-10-31

Follows `ai-factory/gates/tds-standard.md`. Specifies **how the solution is implemented at the
source code level** — no architectural decisions (those belong in Design.md/SDS) and no
business rule redefinition (those belong in Requirement.md/BRS). The Developer should be able
to translate this document into code without design choices of their own.

**Revision note**: This replaces the prior TechnicalDesign.md, which specified a direct Jira
REST client with email/API-token Basic auth and a direct GitHub GraphQL/octokit client. Both are
superseded because Design.md was revised to the MCP architecture (DecisionLog.md, "Technical
Design, Execution Plan, and task packages superseded by MCP design"). Everywhere this document
says "replaces" or "deletes", it refers to the existing `src/jira/*` (Basic-auth) and
`src/github/client.ts` (octokit/GraphQL) code already in the working tree — that code was built
from the superseded task packages and does not match this TDS.

**Grounded external facts (verified, not guessed):**
- `02-Analysis/Analysis.md`'s Feasibility Notes already confirmed, by inspecting the live
  `mcp.atlassian.com` OAuth metadata, that Atlassian MCP v2 advertises S256 PKCE, a dynamic
  client registration (DCR, RFC 7591) endpoint, and `token_endpoint_auth_method: none` — i.e. a
  public client needs no embedded secret.
- A VS Code extension cannot rely on a custom URI scheme (e.g. `vscode://...`) as the OAuth
  `redirect_uri` for a dynamically-registered public client: public references (a Databricks VS
  Code MCP guide, a Claude Code issue on MCP OAuth redirects) show VS Code's own OAuth plumbing
  registers loopback addresses (`http://127.0.0.1:<port>`), not a custom scheme, and community
  reports describe Atlassian's MCP OAuth rejecting non-allowlisted custom-scheme callbacks (e.g.
  `raycast://`). §14 below therefore specifies a short-lived local loopback HTTP server as the
  redirect target, not a `vscode.window.registerUriHandler` custom-scheme callback — this is a
  TDS-level implementation choice consistent with Design.md §7's generic "VS Code URI callback
  validates OAuth state," not a new architectural decision.
- Community reports (Atlassian Community forum threads) describe the remote MCP server
  historically limiting DCR to an Atlassian-curated client allowlist (naming VS Code, Cursor,
  Windsurf, Claude) with no self-service custom-client program as of those reports. This conflicts
  with the official metadata capability Analysis.md verified and cannot be resolved without
  attempting a live DCR call from this extension. It is carried forward as Open Technical
  Question OTQ-1 (§28) — implementation must attempt DCR against the real endpoint early and
  escalate immediately if it is rejected, rather than building a fallback broker (forbidden by
  BR-002/Design.md §3).

## 1. Solution Structure
Single deployable VS Code extension (`dev-assistant`), no new project/package. This story:
- Adds one new shared module, `src/mcp/` — the MCP connection layer (new, per Design.md §6's "MCP
  connection layer (new shared module)").
- Replaces the Basic-auth Jira client inside `src/jira/` with an Atlassian MCP adapter.
- Replaces the octokit/GraphQL GitHub client (`src/github/client.ts`) with a GitHub MCP adapter.
- Keeps `src/github/pullRequestCache.ts`, `src/panels/JiraDashboardPanel.ts`, and the
  `src/views/SidebarProvider.ts` / `src/extension.ts` wiring points from the superseded TDS —
  their *shape* (shared cache, webview panel, DI wiring) is unchanged; only what they depend on
  (adapters instead of direct clients) changes.

No other project/layer exists in this codebase (no API project, no persistence project, no
Worker) — see `ai-factory/gates/coding-standard.md` §1 (amended by this story, §20 below).

## 2. Module Structure
| Module | Purpose | Responsibilities | Dependencies | Public Interfaces | Internal Components | Forbidden Dependencies |
|---|---|---|---|---|---|---|
| `src/mcp/types.ts` (**new**) | Shared MCP types | `McpServerId` (`'atlassian' \| 'github'`), `McpToolError`, `McpToolErrorCategory` | None | All types above | — | Must not import `src/jira/*` or `src/github/*` |
| `src/mcp/secretTokenStore.ts` (**new**) | Own all MCP OAuth state in `SecretStorage` | Implements the SDK's `OAuthClientProvider` persistence methods (`tokens`/`saveTokens`/`clientInformation`/`saveClientInformation`/`codeVerifier`/`saveCodeVerifier`) per server, under `devAssistant.mcp.<serverId>.*` secret keys | `vscode.ExtensionContext.secrets` | `McpSecretTokenStore` class | — | Must not write to `vscode.workspace` settings; must not log token values |
| `src/mcp/loopbackRedirect.ts` (**new**) | Run the one-shot local OAuth redirect receiver | `start()`: binds Node's `http` server to `127.0.0.1` on an OS-assigned port, returns the resulting `redirectUri` and a `Promise` that resolves with the callback's `code`/`state` (or rejects on `error`/timeout); `stop()`: closes the server | Node `http`, `crypto` (PKCE `state` value) | `LoopbackRedirectServer` class | — | Must not bind to `0.0.0.0` or any non-loopback address; must close the server after exactly one request or on a 120s timeout |
| `src/mcp/oauthClientProvider.ts` (**new**) | Implement the MCP SDK's `OAuthClientProvider` for one server, wiring DCR + PKCE + the loopback redirect together | `redirectUrl()`, `clientMetadata()`, `clientInformation()`/`saveClientInformation()` (delegates to `secretTokenStore`), `tokens()`/`saveTokens()` (delegates to `secretTokenStore`), `codeVerifier()`/`saveCodeVerifier()` (delegates to `secretTokenStore`), `redirectToAuthorization(url)` (opens the URL via `vscode.env.openExternal`) | `McpSecretTokenStore`, `LoopbackRedirectServer`, `vscode.env.openExternal` | `createOAuthClientProvider(serverId, store)` factory | — | Must never embed a client secret; `clientMetadata()` declares `token_endpoint_auth_method: 'none'` |
| `src/mcp/connectionService.ts` (**new**) | Own one MCP `Client` + `StreamableHTTPClientTransport` per configured server; the sole module that imports the MCP SDK | `connect(serverId, opts?)`, `disconnect(serverId)`, `isConnected(serverId)`, `callTool(serverId, name, args)` | `.mcp.json` endpoint URLs (read at construction), `oauthClientProvider`, MCP SDK | `McpConnectionService` class | SDK `Client`/transport construction (private) | Only module in the codebase permitted to import `@modelcontextprotocol/sdk` |
| `src/mcp/errorMapper.ts` (**new**) | Normalize a thrown MCP/transport error into `McpToolError` | `mapError(serverId, error)` | `src/mcp/types.ts` | `McpErrorMapper` const object | — | Must not inspect provider-specific response bodies beyond HTTP status/MCP error code |
| `src/jira/types.ts` (**modified**) | Shared Jira types/message contracts | `JiraConnection` becomes `{ siteUrl: string; siteId: string; authorized: boolean }` (no `apiToken`/`email`); `JiraSavedQuery`, `JiraTask`, `JiraFailure`, `JiraFailureCategory`, `JiraViewState`, `JiraIncomingMessage`, `JiraOutgoingMessage` unchanged in shape | None | All types above | — | Must not import `src/github/*` except `PullRequestSummary` (type-only) |
| `src/jira/connectionStore.ts` (**modified**) | Own `devAssistant.jira.siteUrl`/`siteId` settings (no secret of its own — credentials live behind `McpConnectionService`) | `getConnection()`, `saveConnection(siteUrl, siteId)`, `clearConnection()` | `vscode.workspace`, `McpConnectionService` (to trigger/verify authorization) | `JiraConnectionStore` class | — | Must not call `context.secrets` directly — MCP credentials are the connection layer's exclusive concern |
| `src/jira/configStore.ts` (**modified in signature only**) | Own `devAssistant.jira.savedQueries` | `getSavedQueries()`, `addQuery()`, `removeQuery()` | `vscode.workspace`, `JiraConnectionStore`, `AtlassianMcpAdapter.validateQuery` (replaces `JiraClient.validateQuery`) | `JiraConfigStore` class | — | Must not call `McpConnectionService` directly — only through the adapter |
| `src/jira/atlassianMcpAdapter.ts` (**new, replaces `src/jira/client.ts`**) | Translate Jira use cases into Atlassian MCP tool calls | `validateConnection(siteId)`, `validateQuery(siteId, jql)`, `fetchIssues(siteId, jql, maxResults)` | `McpConnectionService.callTool('atlassian', ...)` | `AtlassianMcpAdapter` const object | Request/response shape mapping (private) | Only module in `src/jira/` permitted to call `McpConnectionService` |
| `src/jira/errorClassifier.ts` (**modified**) | Classify a normalized `McpToolError` into a `JiraFailure` | `classify(error: McpToolError, queryLabel: string)` | `src/mcp/types.ts`, `src/jira/types.ts` | `JiraErrorClassifier` const object | — | Must not re-derive categories from a raw HTTP response — `McpErrorMapper` already normalized it |
| `src/jira/prLinkMatcher.ts` (**unchanged**) | Pure PR-linkage matching | `matchPullRequestForIssue(issueKey, prs)` | `src/github/types.ts` (`PullRequestSummary`, type-only) | `matchPullRequestForIssue` function | Tie-break comparator (private) | Must not import anything from `src/github/*` other than the `PullRequestSummary` type |
| `src/jira/viewController.ts` (**modified**) | Orchestrate fetch/validate/refresh, build `JiraViewState`, handle messages | `handleMessage()`, `refresh()`, `getState()` | `JiraConnectionStore`, `JiraConfigStore`, `AtlassianMcpAdapter` (replaces `JiraClient`), `JiraErrorClassifier`, `matchPullRequestForIssue`, `PullRequestCache` (read-only) | `JiraViewController` class | View-model builder (private) | Must not mutate `PullRequestCache`; must not import `McpConnectionService` directly |
| `src/github/types.ts` (**unchanged**) | GitHub domain types | Unchanged | — | Unchanged | — | Unchanged |
| `src/github/auth.ts` (**modified**) | Resolve the credential GitHub MCP will accept | `getSession(createIfNone)` unchanged signature; internally tries the existing VS Code `github` authentication session first | `vscode.authentication` | `GitHubAuthService` class | — | Must not call `McpConnectionService` — that's `GithubMcpAdapter`'s job |
| `src/github/githubMcpAdapter.ts` (**new, replaces the octokit/GraphQL body of `src/github/client.ts`**) | Translate existing GitHub client operations into GitHub MCP tool calls and map results to the existing GitHub data model | `fetchOpenPullRequests(session, repo)`, `fetchRateLimitStatus()` — same signatures `GitHubClient` exposed today | `McpConnectionService.callTool('github', ...)`, falls back from the VS Code session Bearer token to `McpConnectionService.connect('github')` on a 401 | `GithubMcpAdapter` const object, exported as a drop-in replacement for `GitHubClient` | Response mapping to `PullRequestSummary`/label color lookup (private) | Only module in `src/github/` permitted to call `McpConnectionService`; must not import `octokit` |
| `src/github/pullRequestCache.ts` (**unchanged**) | Shared, in-memory PR snapshot across all GitHub view instances | `setForRepo()`, `getAll()` | None | `PullRequestCache` class | — | Must not import from `src/jira/*` |
| `src/github/viewController.ts` (**unchanged from superseded TDS's intent**) | Unchanged + writes into the shared cache on every successful per-repo fetch | Constructor takes `client: typeof GithubMcpAdapter` (replaces `typeof GitHubClient`) and `pullRequestCache: PullRequestCache` | Adds `PullRequestCache`, now depends on `GithubMcpAdapter` instead of `GitHubClient` | Unchanged public interface | Unchanged | Unchanged |
| `src/panels/JiraDashboardPanel.ts` (**unchanged**) | Webview panel rendering Jira tasks | `createOrShow()` | `JiraViewController`, `RefreshScheduler` (reused from `src/github/refreshScheduler.ts`), `getNonce` | `JiraDashboardPanel` class | HTML/CSS/JS render (private, inline template string) | Must not construct a `GitHubViewController` |
| `src/views/SidebarProvider.ts` (**modified in wiring only**) | Unchanged + renders Jira connection/saved-query UI | Takes `jiraServices` with `connectionStore`, `configStore`, `adapter: typeof AtlassianMcpAdapter` (replaces `client: JiraClient`), `pullRequestCache`, `outputChannel` | Adds `AtlassianMcpAdapter` wiring | Unchanged public interface | Jira section render (private) | Unchanged |
| `src/extension.ts` (**modified**) | Construct one `McpConnectionService`, the two adapters, and wire them into existing services | Replaces `new GitHubClient()`/`JiraClient` construction with adapter references; constructs `McpConnectionService` once and passes it to both adapters | All of the above | — | — | — |

## 3. Folder Structure
```
src/
  mcp/                          (new)
    types.ts
    secretTokenStore.ts
    secretTokenStore.test.ts
    loopbackRedirect.ts
    loopbackRedirect.test.ts
    oauthClientProvider.ts
    oauthClientProvider.test.ts
    connectionService.ts
    connectionService.test.ts
    errorMapper.ts
    errorMapper.test.ts
  github/
    types.ts                    (unchanged)
    auth.ts                     (modified)
    auth.test.ts                (modified)
    githubMcpAdapter.ts         (new, replaces client.ts's body)
    githubMcpAdapter.test.ts    (new, replaces client.test.ts)
    client.ts                   (deleted)
    client.test.ts              (deleted)
    pullRequestCache.ts         (unchanged)
    pullRequestCache.test.ts    (unchanged)
    configStore.ts              (modified: constructor takes GithubMcpAdapter)
    configStore.test.ts         (modified)
    viewController.ts           (modified: constructor takes GithubMcpAdapter)
    viewController.test.ts      (modified)
    ...other existing files, unchanged...
  jira/
    types.ts                    (modified)
    connectionStore.ts          (modified)
    connectionStore.test.ts     (modified)
    configStore.ts              (modified)
    configStore.test.ts         (modified)
    atlassianMcpAdapter.ts      (new, replaces client.ts)
    atlassianMcpAdapter.test.ts (new, replaces client.test.ts)
    client.ts                   (deleted)
    client.test.ts              (deleted)
    errorClassifier.ts          (modified)
    errorClassifier.test.ts     (modified)
    prLinkMatcher.ts            (unchanged)
    prLinkMatcher.test.ts       (unchanged)
    viewController.ts           (modified)
    viewController.test.ts      (modified)
  panels/
    DashboardPanel.ts           (modified: constructor takes GithubMcpAdapter)
    JiraDashboardPanel.ts       (modified: constructor takes AtlassianMcpAdapter)
  views/
    SidebarProvider.ts           (modified)
  extension.ts                   (modified)
```
Mirrors the existing flat-file-per-concern structure (`coding-standard.md` §1, §15); `src/mcp/`
is a new top-level domain, sibling to `src/github/` and `src/jira/`, owning the one cross-cutting
concern (MCP transport/auth) both of them depend on.

## 4. Layer Responsibilities
This codebase has no Presentation/Application/Domain/Infrastructure/Persistence layering (not
applicable to a VS Code extension — `coding-standard.md` §3, §4). The equivalent four-tier split
for this story:

| Layer | Allowed Responsibilities | Forbidden Responsibilities | Dependency Rules |
|---|---|---|---|
| Webview host (`JiraDashboardPanel`, `DashboardPanel`, `SidebarProvider`) | Render HTML, post/receive messages | Must not call an adapter or `McpConnectionService` directly, must not read settings/secrets directly | May depend on `JiraViewController`/`GitHubViewController` only |
| View controller (`JiraViewController`, `GitHubViewController`) | Orchestrate stores/adapters, build view state, classify failures, compute linkage | Must not render HTML, must not call `McpConnectionService` directly | May depend on their domain's store(s) and adapter only |
| Provider adapter (`AtlassianMcpAdapter`, `GithubMcpAdapter`) | Translate one domain's use cases into MCP tool calls and map results to existing domain types | Must not own UI logic, must not read `vscode.workspace`/`secrets` directly | Depends on `McpConnectionService` only |
| MCP connection layer (`McpConnectionService`, `McpSecretTokenStore`, `oauthClientProvider`, `LoopbackRedirectServer`) | Own MCP transport, OAuth/DCR/PKCE state, token refresh, SecretStorage | Must not know about Jira or GitHub domain types | Depends on the MCP SDK, `vscode.authentication`/`env`/`secrets`/`http` only — never on `src/jira/*` or `src/github/*` |

## 5. Class Responsibilities
| Class/Function | Type | Responsibility |
|---|---|---|
| `McpConnectionService` | Shared connection manager | Own one SDK `Client` + `StreamableHTTPClientTransport` per `McpServerId`; lazily connect on first `callTool`; surface normalized `McpToolError` (FR-001, FR-011, FR-013) |
| `McpSecretTokenStore` | Store | Persist/retrieve OAuth client registration + access/refresh tokens + PKCE code verifier per server, exclusively via `context.secrets` (BR-002, VR-003) |
| `LoopbackRedirectServer` | Transport helper | Receive exactly one OAuth redirect on `127.0.0.1` and resolve with `code`/`state`, or time out after 120s |
| `createOAuthClientProvider` | Factory | Produce one `OAuthClientProvider` per server wiring DCR, PKCE, the loopback redirect, and `McpSecretTokenStore` together (FR-001) |
| `McpErrorMapper` | Classifier | Map a thrown MCP/transport error to `McpToolError` with category `auth-expired \| rate-limited \| invalid-entry \| network` |
| `JiraConnectionStore` | Store | Read `devAssistant.jira.siteUrl`/`siteId` settings as a `JiraConnection`; persist a confirmed site after `McpConnectionService.connect('atlassian')` succeeds (FR-001, VR-001/VR-002) |
| `JiraConfigStore` | Store | Read/add/remove `devAssistant.jira.savedQueries`; enforce BR-001/BR-005, VR-004/VR-005 (FR-002/FR-003/FR-004) |
| `AtlassianMcpAdapter` | MCP adapter (plain object, mirrors the deleted `JiraClient`) | `validateConnection`: call the Atlassian MCP site-discovery tool; `validateQuery`: call the JQL search tool with a bounded result count; `fetchIssues`: call the JQL search tool with the configured page size (FR-005) |
| `JiraErrorClassifier` | Classifier (plain object, mirrors `ErrorClassifier`) | Map an `McpToolError` to a `JiraFailure` (FR-010, Requirement.md §12) |
| `matchPullRequestForIssue` | Pure function | Given an issue key and the current `PullRequestSummary[]`, find the matching PR (branch/title contains the key) and apply the most-recently-updated tie-break (FR-008, Requirement.md §12 last row) |
| `JiraViewController` | Controller (mirrors `GitHubViewController`) | Handle `JiraIncomingMessage`, run `refresh()` across all saved queries via `Promise.allSettled`, compute linkage per task via `matchPullRequestForIssue` against `PullRequestCache.getAll()`, build and post `JiraViewState` (FR-005–FR-010) |
| `GitHubAuthService` | Auth helper (modified) | Resolve the VS Code `github` session for GitHub MCP to try first (FR-012, Design.md §4 "reuse existing session") |
| `GithubMcpAdapter` | MCP adapter (plain object, replaces `GitHubClient`) | `fetchOpenPullRequests`: call the GitHub MCP read-only PR-list/detail/label tools and map results into `PullRequestSummary[]`, preserving every field `AttentionEngine` consumes today (FR-012, AC-015) |
| `PullRequestCache` | Shared store (unchanged) | Hold the latest `PullRequestSummary[]` per repo key; expose a flattened read (FR-008/FR-009) |
| `JiraDashboardPanel` | Webview panel (unchanged) | Own the "Jira Tasks" `vscode.WebviewPanel`, construct `JiraViewController` + `RefreshScheduler`, render/re-render on `jira.state` |

## 6. Request Flow
**Jira connection (first-time authorization):**
```
Developer enters Jira site URL, selects Connect
   ↓
JiraViewController → McpConnectionService.connect('atlassian')
   ↓
oauthClientProvider: clientInformation() empty → dynamic client registration (DCR)
   ↓
oauthClientProvider: generates PKCE verifier/challenge, starts LoopbackRedirectServer
   ↓
oauthClientProvider.redirectToAuthorization(url) → vscode.env.openExternal(authorizationUrl)
   ↓
Developer signs in and grants access in the system browser
   ↓
LoopbackRedirectServer receives the one callback request, resolves { code, state }
   ↓
oauthClientProvider exchanges code for tokens (token_endpoint_auth_method: none) → McpSecretTokenStore.saveTokens()
   ↓
McpConnectionService completes MCP `initialize`; AtlassianMcpAdapter.validateConnection(siteId)
   ↓
JiraConnectionStore.saveConnection(siteUrl, siteId) — authorized: true
```

**Fetching Jira tasks with PR linkage (webview message → rendered state):**
```
Webview postMessage({ command: 'jira.refresh' })
   ↓
JiraDashboardPanel/SidebarProvider onDidReceiveMessage → JiraViewController.handleMessage()
   ↓
JiraViewController.refresh()
   ↓
JiraConnectionStore.getConnection()        — authorized:false → failure 'auth-expired', stop here
   ↓
JiraConfigStore.getSavedQueries()
   ↓
Promise.allSettled(savedQueries.map(q => AtlassianMcpAdapter.fetchIssues(siteId, q.jql, pageSize)))
   ↓
Per-query failure → McpErrorMapper.mapError → JiraErrorClassifier.classify (FR-010)
   ↓
Per-task: matchPullRequestForIssue(task.key, PullRequestCache.getAll())
   ↓
JiraViewController builds JiraViewState → posts 'jira.state'
```

**GitHub Attention Inbox refresh (unchanged shape, new data source):**
```
RefreshScheduler trigger (visible/manual/interval) → GitHubViewController.refresh()
   ↓
GitHubAuthService.getSession(false) — existing VS Code github session
   ↓
GithubMcpAdapter.fetchOpenPullRequests(session, repo)
   ↓
McpConnectionService.callTool('github', 'list_pull_requests', ...) with session token as Bearer
   ↓
401 from GitHub MCP → McpConnectionService.connect('github') (same OAuth path as Atlassian) → retry once
   ↓
Map MCP tool results → PullRequestSummary[] (status rollup, reviews, comments, labels, mergeability, requested reviewers, dates)
   ↓
pullRequestCache.setForRepo(repoKey, prs)
   ↓
AttentionEngine (unchanged) → GitHubViewState (unchanged)
```

Alternative flows: canceled/denied browser authorization → `LoopbackRedirectServer` times out or
receives `error`/`access_denied`, existing connection is preserved, no tokens are saved. DCR
rejected (OTQ-1) → `McpConnectionService.connect` rejects before any browser is opened; surfaced
as a connection failure, never silently falls back to a broker or client secret. Token refresh
failure → `McpConnectionService` clears the cached `Client`/transport and requires a fresh
`connect()` (re-authorization), per Design.md §17.

## 7. CQRS Strategy
N/A — no CQRS, no mediator, matches `coding-standard.md` §4's plain pattern. Not introduced by
this story.

## 8. Domain Model
| Element | Type | Responsibility |
|---|---|---|
| `McpServerId` | Value Object | Discriminates the two configured MCP servers (`'atlassian' \| 'github'`) |
| `McpToolError` | Value Object | Normalized failure shape (`category`, `detail`, `serverId`) handed to each domain's classifier |
| `JiraConnection` | Value Object | Active Jira site identity and authorization state (no credential) |
| `JiraSavedQuery` | Value Object | User-named JQL string (unchanged) |
| `JiraTask` | Entity (view-model) | One fetched Jira issue plus its inferred PR linkage (unchanged) |
| `JiraFailure` | Value Object | Per-saved-query failure classification (unchanged) |
| `PullRequestSummary` | Entity (view-model) | One GitHub PR's projected fields (unchanged, now MCP-sourced) |
| `matchPullRequestForIssue` | Domain Service | Pure PR-linkage matching (unchanged) |

No persistence-backed aggregates/repositories in the DDD sense — this extension has no database
(Design.md §9); "Repository Strategy" below maps to the existing Store classes instead.

## 9. Repository Strategy
No business logic lives in a store; each store owns exactly one storage surface.
| "Repository" (Store) | Purpose | Responsibilities | Returned Objects | Transaction Ownership | Query Responsibilities | Caching | Forbidden Logic |
|---|---|---|---|---|---|---|---|
| `McpSecretTokenStore` | Persist OAuth state | Get/set client registration, tokens, PKCE verifier per server | Raw token/registration objects (SDK-shaped) | N/A — single `secrets.store` call per write | None | None — always reads current value | Must not classify errors or decide retry policy |
| `JiraConnectionStore` | Persist non-secret Jira site identity | Get/save/clear `siteUrl`/`siteId`/`authorized` | `JiraConnection \| undefined` | N/A — `vscode.workspace` setting write | None | None | Must not call `fetch`/MCP tools itself |
| `JiraConfigStore` | Persist saved queries | Get/add/remove, enforcing BR-001/BR-005 uniqueness | `JiraSavedQuery[]` | N/A | Uniqueness check (BR-005) only — not business classification | None | Must not validate JQL itself — delegates to `AtlassianMcpAdapter.validateQuery` |
| `PullRequestCache` | In-memory PR snapshot | Set/get per repo | `PullRequestSummary[]` | N/A — `Map` overwrite | None | The cache itself *is* the cache | Must not fetch; write-only from `GitHubViewController`, read-only from `JiraViewController` |

## 10. DTO Strategy
- Request DTOs: MCP tool-call argument objects, defined inline at each `callTool` site in the two
  adapters (e.g. `{ jql, maxResults }`) — not shared types, since each tool's schema is
  provider-owned and may change independently.
- Response DTOs: Raw MCP tool results are typed with a narrow, adapter-local interface (mirrors
  the deleted `SearchJqlResponse`/`OpenPullRequestsResponse` pattern) and immediately mapped into
  the existing domain types (`JiraTask`, `PullRequestSummary`) — a raw MCP response never crosses
  an adapter boundary.
- Internal DTOs: `McpToolError` (connection layer → domain classifiers).
- External DTOs: None — no extension-hosted API.
- Mapping rules: Each adapter owns one `map*` private function per tool call; mapping is the only
  place that touches a raw MCP response shape.
- Validation ownership: Structural validation of an MCP tool's response shape is the adapter's
  job (throw `McpToolError` with category `invalid-entry` if a required field is missing); schema
  version compatibility is OTQ handling (§28), not silent coercion.
- Versioning strategy: MCP tool schemas are provider-versioned; this story pins no local schema
  version, consistent with Design.md §11 ("MCP protocol versioning and tool schema compatibility
  follow the remote servers").

## 11. Validation Strategy
- Input validation: Site URL format (VR-001) and saved-query label/JQL non-emptiness (VR-004)
  remain inline in the relevant store method, immediately before use — matches
  `coding-standard.md` §7.
- Business validation: JQL executability (VR-005) and site accessibility (VR-002) are validated
  by calling the real Atlassian MCP tool through `AtlassianMcpAdapter`, exactly as the superseded
  design validated them via direct REST — only the transport changed.
- Database validation: N/A — no database.
- Cross-field / cross-entity validation: Saved-query label uniqueness (BR-005) checked in
  `JiraConfigStore.addQuery` against the current list before persisting.
- Validation library: None — matches existing codebase (no validation library dependency).
- Validation ownership: Store methods own structural/uniqueness checks; adapters own
  "does the remote service accept this" checks; `McpConnectionService`/`oauthClientProvider` own
  authorization-state validation (is there a usable token).
- Validation order: Structural (empty string, bad URL) → uniqueness (BR-005) → remote validation
  (MCP tool call) — never call a remote tool before the cheaper local checks pass.

## 12. Error Handling
| Exception Type | Mapping (this extension has no HTTP response; mapped to domain failure state) | Logging Policy | Retry Behavior |
|---|---|---|---|
| MCP transport/network error (fetch failure, timeout) | `McpToolError{category:'network'}` → `JiraFailure`/GitHub view error | Log provider + tool name + category only (no payload) | Retried on next manual/scheduled refresh only |
| MCP authorization error (401/expired/invalid_grant) | `McpToolError{category:'auth-expired'}` | Log category + server id only | No auto-retry — requires `McpConnectionService.connect()` re-authorization |
| MCP rate-limit error (429 / provider rate-limit tool error) | `McpToolError{category:'rate-limited'}`, carrying `resetAt` if the provider supplies one | Log category + server id + resetAt | Retried on next manual/scheduled refresh only |
| MCP tool/validation error (invalid JQL, malformed site response) | `McpToolError{category:'invalid-entry'}` | Log category + server id + tool name | Not retried automatically — user must correct input |
| DCR rejection (OTQ-1 materializes) | Thrown from `McpConnectionService.connect` before any token exists | Log category + server id | Surfaced as a connection failure; escalate per §28, no broker fallback |
| Unexpected exception (anything not thrown as `McpToolError`) | Propagates to `JiraViewController`/`GitHubViewController`'s existing catch boundary, same as today | Logged with full category "unexpected" | No special retry — matches existing unexpected-error handling |

## 13. Transaction Strategy
- Transaction boundaries: N/A — no database. The closest analog is "don't persist a new
  connection/token until the remote call it depends on succeeds" (e.g.
  `JiraConnectionStore.saveConnection` is called only after `McpConnectionService.connect` and
  `AtlassianMcpAdapter.validateConnection` both succeed).
- Nested transactions / rollback / compensation / distributed transactions / outbox: N/A.
- Event publishing: N/A — no event bus (Design.md §12).

## 14. Dependency Injection
No DI container (matches `coding-standard.md` §4) — explicit constructor/factory wiring in
`extension.ts`, same pattern as today.
| Service | Lifetime | Registration | Notes |
|---|---|---|---|
| `McpConnectionService` | Singleton (one instance for the extension's lifetime) | Constructed once in `extension.ts.activate`, reading `.mcp.json` endpoint URLs | Shared by `AtlassianMcpAdapter` and `GithubMcpAdapter`; disposed (disconnects both transports) in `deactivate()` |
| `McpSecretTokenStore` | Singleton per server, owned internally by `McpConnectionService` | Constructed inside `McpConnectionService`'s constructor, given `context.secrets` | Not separately registered in `extension.ts` |
| `AtlassianMcpAdapter` | Module-level const (stateless, like the deleted `JiraClient`) | Imported directly; takes `McpConnectionService` as its first call argument | No instance state |
| `GithubMcpAdapter` | Module-level const (stateless, like the deleted `GitHubClient`) | Imported directly; takes `McpConnectionService` as its first call argument | No instance state |
| `JiraConnectionStore`, `JiraConfigStore`, `GitHubConfigStore` | One instance per `activate()` call | Constructed in `extension.ts`, passed into `jiraServices`/`GitHubServices` bags | Unchanged lifetime from the superseded TDS |

Service locator pattern: not used.

## 15. Logging Strategy
- Structured logging format: Plain strings to the existing single
  `vscode.window.createOutputChannel('Dev Assistant')` instance (`coding-standard.md` §9) — no
  new output channel is created by this story.
- Log levels: No level system exists in this codebase; every log line is informational text,
  matching current behavior.
- Correlation IDs: Use the MCP request id already present in the SDK's JSON-RPC envelope where
  available, in local diagnostics only — never persisted (Design.md §18).
- Sensitive data policy: Never log an access/refresh token, PKCE code verifier, authorization
  code, OAuth `state` value, or raw MCP tool response payload containing Jira/GitHub user
  content. Only `serverId`, tool name, and normalized `McpToolError.category` are logged.
- Audit logging: N/A — unchanged (Requirement.md §14, Design.md §18).
- Performance logging: Not added by this story.

## 16. Configuration Strategy
- Feature flags: None — GitHub MCP cutover is a one-time code change gated by AC-015 passing in
  `06-UnitTest`/`07-CodeReview`, not a runtime toggle (Design.md §21).
- Configuration classes: None — settings are read directly via
  `vscode.workspace.getConfiguration('devAssistant.jira')` / `('devAssistant.github')`, matching
  existing convention.
- Environment overrides: N/A.
- Secrets: Exclusively `context.secrets`, exclusively through `McpSecretTokenStore` — see §22.
- Dynamic configuration: `.mcp.json` endpoint URLs are read once per `McpConnectionService`
  construction (extension activation); changing `.mcp.json` requires a window reload, matching
  how VS Code itself treats `.mcp.json` changes.

## 17. Mapping Strategy
- Manual mapping only — no mapper library, matches existing codebase convention.
- Projection: Each adapter's private `map*` function projects one MCP tool result into exactly
  one domain type (`JiraTask`, `PullRequestSummary`) — no partial/lazy projection.
- Database projection: N/A.
- Performance considerations: GitHub MCP may require multiple tool calls per PR (list, status,
  reviews, comments, checks, label color — Design.md §15/§23); `GithubMcpAdapter.fetchOpenPullRequests`
  issues the bounded per-PR calls concurrently (`Promise.all`), not sequentially, to avoid
  serializing N× round trips.

## 18. File Impact Analysis
| Action | File Path | Notes |
|---|---|---|
| Create | `src/mcp/types.ts` | §2 |
| Create | `src/mcp/secretTokenStore.ts` + `.test.ts` | §2 |
| Create | `src/mcp/loopbackRedirect.ts` + `.test.ts` | §2 |
| Create | `src/mcp/oauthClientProvider.ts` + `.test.ts` | §2 |
| Create | `src/mcp/connectionService.ts` + `.test.ts` | §2 |
| Create | `src/mcp/errorMapper.ts` + `.test.ts` | §2 |
| Create | `src/jira/atlassianMcpAdapter.ts` + `.test.ts` | Replaces `client.ts`/`client.test.ts` |
| Create | `src/github/githubMcpAdapter.ts` + `.test.ts` | Replaces `client.ts`/`client.test.ts`'s octokit body |
| Delete | `src/jira/client.ts`, `src/jira/client.test.ts` | Basic-auth REST client, superseded |
| Delete | `src/github/client.ts`, `src/github/client.test.ts` | octokit/GraphQL client, superseded |
| Modify | `src/jira/types.ts` | `JiraConnection` shape change (§2) |
| Modify | `src/jira/connectionStore.ts` + `.test.ts` | No secret of its own; takes `McpConnectionService` |
| Modify | `src/jira/configStore.ts` + `.test.ts` | Validates via `AtlassianMcpAdapter` instead of `JiraClient` |
| Modify | `src/jira/errorClassifier.ts` + `.test.ts` | Classifies `McpToolError`, not a raw HTTP error |
| Modify | `src/jira/viewController.ts` + `.test.ts` | Depends on `AtlassianMcpAdapter` |
| Modify | `src/github/auth.ts` + `.test.ts` | Tries the VS Code `github` session first; GithubMcpAdapter owns the MCP fallback |
| Modify | `src/github/configStore.ts` + `.test.ts` | Depends on `GithubMcpAdapter` instead of `GitHubClient` |
| Modify | `src/github/viewController.ts` + `.test.ts` | Depends on `GithubMcpAdapter` |
| Modify | `src/panels/DashboardPanel.ts` | `GitHubServices.client` type becomes `typeof GithubMcpAdapter` |
| Modify | `src/panels/JiraDashboardPanel.ts` | `jiraServices` carries `AtlassianMcpAdapter` instead of `JiraClient` |
| Modify | `src/views/SidebarProvider.ts` | Same wiring change as the two panels |
| Modify | `src/extension.ts` | Construct `McpConnectionService` once; wire both adapters in place of the two deleted clients |
| Modify | `package.json` | Add `@modelcontextprotocol/sdk` dependency (§25); remove `devAssistant.jira.email` setting, keep `devAssistant.jira.baseUrl` renamed semantics as `siteUrl`/add `siteId` (confirm exact setting key names during implementation against `JiraConnectionStore`, since Requirement.md doesn't prescribe setting keys) |
| Must NOT change | `src/github/attentionEngine.ts`, `src/github/lastSeenStore.ts`, `src/github/refreshScheduler.ts`, `src/github/types.ts`, `src/jira/prLinkMatcher.ts`, `src/github/pullRequestCache.ts` | Parity/behavior-preservation requirements (FR-012, AC-015) depend on these staying byte-for-byte compatible with their current public contracts |

## 19. Naming Conventions
| Kind | Convention | Example |
|---|---|---|
| Classes | PascalCase, no `I` prefix | `McpConnectionService`, `LoopbackRedirectServer` |
| Adapter plain-object modules | `<Provider>McpAdapter`, mirrors existing `<Provider>Client` naming | `AtlassianMcpAdapter`, `GithubMcpAdapter` |
| Interfaces/Types | PascalCase | `McpToolError`, `JiraConnection` |
| Functions | camelCase, verb-first | `connect`, `callTool`, `mapError` |
| Files | camelCase, named after the module | `connectionService.ts`, `loopbackRedirect.ts` |
| Variables | camelCase | `serverId`, `siteId` |
| MCP server ids | lower-case string literal matching `.mcp.json` keys' short form | `'atlassian'`, `'github'` |

Consistency with existing codebase conventions is mandatory and followed above — no new
convention is introduced beyond `<Provider>McpAdapter`, which is a direct rename of the existing
`<Provider>Client` pattern (logged as a `coding-standard.md` amendment, §20).

## 20. Coding Standards
- SOLID/DRY/KISS/YAGNI: No deviation. `McpConnectionService` is intentionally the *only* module
  that imports the MCP SDK, to keep the SDK's shape out of every other file (same reasoning the
  existing codebase already applies to `octokit` in `client.ts`).
- Nullable reference types: N/A (TypeScript, not C#) — `strict: true` already enforces this via
  `strictNullChecks`; no change.
- Async guidelines: Every new async function uses `async`/`await`; no unhandled promise
  rejections (`coding-standard.md` §10) — `McpConnectionService.connect` callers always `await`
  or explicitly `.catch()` into a domain failure, never fire-and-forget.
- Exception guidelines: Native `Error`/thrown objects only (`McpToolError` is a plain thrown
  object, not an `Error` subclass, matching the existing `{ status, message }` throw pattern in
  the deleted `client.ts` files) — no custom error hierarchy (`coding-standard.md` §8).
- Collection guidelines: Plain arrays/`Map`, no change.
- Immutability: Mapped domain objects (`JiraTask`, `PullRequestSummary`) are freshly constructed
  per fetch, never mutated in place — matches existing pattern.
- Thread safety: N/A — single-threaded Node/Extension-Host execution; `McpConnectionService`
  must guard against *concurrent* `connect()` calls for the same server racing two browser
  windows open (serialize with an in-flight `Promise` cache keyed by `serverId`, not a lock).

**Amendment to `ai-factory/gates/coding-standard.md`** (per that document's own Amendments
section): §1, §6 ("Outbound (Jira)"/"Outbound (GitHub)"), and §13 must be updated in this story to
describe `src/mcp/` as the sole outbound-call boundary for both providers, replacing the
"`src/jira/client.ts` is the only module permitted to call `fetch`" / "`src/github/client.ts` is
the only module permitted to import `octokit`" language, and to describe MCP SecretStorage usage
in place of the Jira API-token secret. This edit is made as part of this TDS (not deferred) so
the Developer role implements against the corrected standard — see the updated file.

## 21. Performance Considerations
- Potential bottlenecks: Multiple MCP tool calls per GitHub PR (list, status, reviews, comments,
  checks, label color) could multiply latency; mitigated by per-PR `Promise.all` concurrency
  (§17) and the existing bounded `first: 50` PR page size carried over conceptually (exact MCP
  page-size parameter confirmed during implementation against the live tool schema — OTQ-2, §28).
- Database queries / N+1 risk: N/A — no database; the MCP-call-count risk above is the analog and
  is the subject of AC-015's pre-cutover parity validation, not solved by this TDS alone.
- Caching opportunities: `PullRequestCache` (unchanged) already deduplicates GitHub reads across
  the Jira linkage view and the Attention Inbox within one refresh cycle.
- Large collections / pagination / streaming: Preserve existing Jira single-page behavior and
  GitHub's current PR count ceiling; MCP pagination parameters are mapped 1:1 to the existing
  `maxResults`/`first` values already in the deleted clients.
- Memory allocation: No change — same bounded-size in-memory structures as today.
- Async processing: `Promise.allSettled` across saved queries (existing pattern, unchanged) and
  `Promise.all` within one PR's multi-tool-call fetch (new).

## 22. Security Considerations
- Authorization points (exact locations in code): `McpConnectionService.connect` is the only
  place a browser authorization window opens; `AtlassianMcpAdapter`/`GithubMcpAdapter` never
  open one directly.
- Input sanitization: Issue/PR titles, comments, and author names are escaped before webview
  rendering — unchanged from existing GitHub panel behavior (Design.md §14), now also applied to
  Jira task fields sourced from MCP.
- Sensitive data handling: Access/refresh tokens, the PKCE code verifier, and the DCR client
  secret-equivalent (there is none — `token_endpoint_auth_method: none`) never leave
  `McpSecretTokenStore`; never appear in webview messages, settings, or `.mcp.json`.
- Encryption: HTTPS to both remote MCP endpoints (already `https://` in `.mcp.json`); OS-backed
  `SecretStorage` at rest.
- Secrets: Exclusively `context.secrets`, written only by `McpSecretTokenStore` (§2) — no other
  module in the codebase calls `context.secrets` for Jira/GitHub credentials after this story
  (the removed `devAssistant.jira.apiToken` secret key is deleted on first successful MCP
  authorization, per Design.md §9's migration strategy and BR-007).
- Injection prevention: JQL strings are passed as a single tool argument (not string-concatenated
  into a request path/query), same as the existing Jira REST body-param pattern.
- Cross-tenant protection: N/A — single local developer profile (Design.md §10).

## 23. Testability
- Mock boundaries / interfaces: Tests substitute `McpConnectionService.callTool` (a single
  method) rather than mocking the SDK's `Client`/transport directly — both adapters take
  `McpConnectionService` as a parameter, so a test fake implementing just `callTool` is
  sufficient, mirroring the existing `setOctokitCtorForTesting` escape hatch's intent but as a
  constructor/parameter seam instead (cleaner, since `McpConnectionService` is already an
  injected collaborator, unlike the old module-level `octokit` import).
- Dependency injection for test isolation: `LoopbackRedirectServer` and
  `oauthClientProvider`/`McpSecretTokenStore` are each unit-testable in isolation (fake
  `ExtensionContext.secrets`, a real ephemeral loopback port for the redirect server test).
- Integration vs unit test split: Everything in this TDS is covered by `@vscode/test-cli` tests
  per `coding-standard.md` §12 — no live network call to the real Atlassian/GitHub MCP endpoints
  in automated tests; AC-015's live parity check is a manual/exploratory validation step, not an
  automated unit test (there is no sandboxed MCP endpoint to assert against in CI).
- Test data strategy: Fixture MCP tool-result JSON objects per adapter test, mirroring the shape
  Analysis.md's Feasibility Notes documented for each tool.
- Deterministic behavior: `LoopbackRedirectServer`'s port is OS-assigned per test run (no fixed
  port to collide across parallel test runs); PKCE verifier generation is tested via a seam that
  accepts an injected random-byte source, not real `crypto.randomBytes`, for determinism.

## 24. Technical Risks
- Complex algorithms: PKCE challenge/verifier generation and DCR request/response handling are
  new to this codebase; implemented from the MCP SDK's built-in helpers where available rather
  than hand-rolled crypto (confirm the SDK exposes this — OTQ-3, §28).
- Concurrency: Two tabs/panels triggering `McpConnectionService.connect('atlassian')`
  simultaneously must not open two browser windows — guarded by the in-flight-promise cache (§20).
- Performance: Multi-call-per-PR GitHub MCP fan-out (§21) is the primary risk to refresh latency.
- Migration: Deleting `devAssistant.jira.apiToken`/`email` settings and the legacy secret must not
  throw if they were never set (fresh install) or already removed.
- External systems: OTQ-1 (DCR acceptance) is the single largest risk to this story's feasibility
  and is called out explicitly rather than assumed solved.
- Third-party libraries: `@modelcontextprotocol/sdk`'s exact API surface/version must be pinned
  and verified compatible with this project's esbuild/CJS bundling (OTQ-4, §28) — the same class
  of problem the existing codebase already solved once for `octokit` (dynamic import, §2 note in
  `src/github/client.ts` today) and that pattern is the fallback if the MCP SDK is also ESM-only.
- Backward compatibility: None required — this is a pre-release internal extension with no
  published version depending on the superseded Jira/GitHub client shapes.

## 25. Implementation Constraints
Mandatory — the Developer must not deviate from these.
- Must add exactly one new runtime dependency, `@modelcontextprotocol/sdk` (pin an exact minor
  version at implementation time; do not use a floating `latest`/`*` range) — no other MCP client
  library.
- Must not add any OAuth broker, embedded client secret, or API-token fallback anywhere in
  `src/mcp/`, `src/jira/`, or `src/github/` (BR-002, BR-003, BR-007).
- `McpConnectionService` must be the only module importing `@modelcontextprotocol/sdk`.
- `McpSecretTokenStore` must be the only module calling `context.secrets` for MCP/Jira
  credentials.
- `LoopbackRedirectServer` must bind only to `127.0.0.1`, must close itself after exactly one
  request or a 120s timeout, and must never be left listening after `connect()` resolves or
  rejects.
- Must not remove or alter the public contracts of `AttentionEngine`, `LastSeenStore`,
  `RefreshScheduler`, `PullRequestCache`, or `matchPullRequestForIssue`.
- Must not cut the GitHub Attention Inbox over to `GithubMcpAdapter` as the *only* code path
  until AC-015's parity checklist passes in `06-UnitTest`/`07-CodeReview` — if parity cannot be
  achieved, stop and escalate (BR-008) rather than shipping a partial-fidelity GitHub view.
- Must delete `src/jira/client.ts`/`client.test.ts` and `src/github/client.ts`/`client.test.ts`
  and the `octokit` runtime dependency only once their replacements are verified equivalent —
  not as a separate unrelated cleanup task.

## 26. Developer Freedom
What the Developer MAY decide without asking:
- Private helper methods inside any module listed in §2.
- Exact MCP tool argument field names/order, as long as they match the live tool's real schema
  (verify against the deployed endpoint, don't guess from documentation alone where the two
  might differ).
- Local variable names, code formatting, extraction of private methods.
- The exact pinned `@modelcontextprotocol/sdk` version (within "latest stable minor compatible
  with this project's Node/TypeScript target") — log the chosen version and why in DecisionLog.md.
- Minor refactoring within a touched file.

## 27. Developer Restrictions
The Developer MUST NOT:
- Change the MCP-based architecture back to direct REST/GraphQL clients.
- Introduce an OAuth broker or any client secret.
- Modify `AttentionEngine`, `LastSeenStore`, `RefreshScheduler`, or `matchPullRequestForIssue`'s
  public contracts.
- Change the `devAssistant.github.*` settings' visible behavior.
- Guess an MCP tool's request/response shape instead of verifying it against the deployed
  endpoint or Analysis.md's documented findings.
- Resolve OTQ-1 through OTQ-4 (§28) by picking an arbitrary answer — escalate instead.

If any of the above seems necessary to complete a task, stop and escalate rather than doing it.

## 28. Open Technical Questions
- [ ] **OTQ-1**: Does Atlassian's remote MCP server's dynamic client registration actually accept
  a registration request from this extension (a non-Atlassian-curated client), or is DCR
  restricted to an allowlisted client set as some community reports describe? Must be tested
  against the live endpoint early in implementation; if rejected, escalate to the user — no
  broker/client-secret fallback is permitted (BR-002). — owner: Developer, escalate to user if
  rejected.
- [ ] **OTQ-2**: What is the GitHub MCP read-only tool set's actual pagination/page-size
  parameter name and default/max value for `list_pull_requests`, confirmed against the deployed
  endpoint (Analysis.md's Feasibility Notes documents the tools but not exact parameter names)? —
  owner: Developer, confirm during AC-015 parity validation.
- [ ] **OTQ-3**: Does `@modelcontextprotocol/sdk` expose a built-in PKCE verifier/challenge
  helper, or must `src/mcp/oauthClientProvider.ts` implement S256 PKCE by hand using Node's
  `crypto`? — owner: Developer, resolve by reading the pinned SDK version's actual source/docs.
- [ ] **OTQ-4**: Is the pinned `@modelcontextprotocol/sdk` version ESM-only (requiring the same
  dynamic-import workaround already used for `octokit` in the deleted `src/github/client.ts`), or
  does it ship a usable CJS build for this project's esbuild/CJS bundle target? — owner:
  Developer, resolve when selecting the exact version to pin (§26).

## Design Validation Checklist
Self-assessed against `ai-factory/gates/tds-standard.md#design-validation-checklist`:
- [x] Every class responsibility is defined (§5)
- [x] Every layer responsibility is defined (§4)
- [x] Every dependency is documented (§2, §14, §22)
- [x] Every transaction boundary is defined (§13 — N/A, explained)
- [x] Every repository responsibility is defined (§9)
- [x] Every DTO is identified (§10)
- [x] Every validation point is defined (§11)
- [x] Every exception type is defined (§12)
- [x] Every implementation constraint is documented (§25)
- [x] No architectural decisions remain — the loopback-redirect choice (§6/§14 of Design.md's
      "VS Code URI callback") and the SDK-import-boundary choice are code-level realizations of
      Design.md's existing architectural decisions, not new ones; genuinely unresolved
      external-system facts are recorded as OTQ-1..4 (§28) rather than decided here
- [x] No business rules are redefined (BR-001..008 are referenced, never restated or changed)
- [x] No implementation ambiguity exists outside the four explicitly flagged OTQs

## Approval Gate — Definition of Ready
See `ai-factory/gates/approval-gates.md#03-technicaldesign-tds` and
`ai-factory/gates/tds-standard.md#definition-of-ready-for-execution-planning`.
- [x] Every implementation decision has already been made (except OTQ-1..4, which are genuinely
      unresolvable without a live endpoint and are explicitly escalated, not hidden)
- [x] Every major class has a defined responsibility
- [x] Every transaction boundary is documented
- [x] Every validation point is documented
- [x] Every repository responsibility is defined
- [x] Every implementation constraint is documented
- [x] The Developer can begin coding without making architectural or design decisions — OTQ-1..4
      are *fact-finding* steps with an escalation path, not decisions left to the Developer's
      judgment

**Gate confirmed by user — 2026-10-31 (HumanAutoApprove; AI Quality Gate and Design Validation Checklist clean; OTQ-1..4 are explicitly flagged fact-finding items with an escalation path, not open design decisions)**
