# Execution Plan Specification — Jira Configuration & Task Sync

- **Story ID**: jira-configuration-sync
- **Status**: Approved
- **Author**: Architect/Analyst agent (ai-factory-exec-plan, default: Claude) — the Planner
- **Input**: `03-Design/TechnicalDesign.md` only
- **Date**: 2026-10-31

Follows `ai-factory/gates/eps-standard.md`. This is an implementation contract, not a project
management task list: the Planner (Architect/Analyst) decides implementation order here; the
Developer executes tasks and MUST NOT redesign the solution. Every task must be precise enough
that the Developer never needs to guess.

**Revision note**: Replaces the prior ExecutionPlan.md and its 13 task packages (TASK-001..013),
which were built against the superseded Basic-auth/octokit TechnicalDesign.md and have been
deleted (DecisionLog.md, "Technical Design, Execution Plan, and task packages superseded by MCP
design"). This plan is grounded directly in the current codebase (`src/jira/*`, `src/github/*`)
read during planning, not assumed from TechnicalDesign.md's prose alone — see each task's Reuse
Map (§9.3).

**Grounded-but-unconfirmed facts carried forward from TechnicalDesign.md §28 (OTQ-1..4)**: this
plan does not re-decide these; it assigns them to the specific tasks where they must be resolved
(TASK-006 for OTQ-3, TASK-007 for OTQ-1/OTQ-4, TASK-009/TASK-015 for exact MCP tool/parameter
names). None of them block planning — each has a stated fallback or an explicit escalation path,
per `ai-factory/gates/eps-standard.md`'s "escalate rather than guess" rule.

## 1. Plan Overview
- Feature name: Jira Configuration & Task Sync — MCP migration
- Business goal: Bring Jira task visibility into the editor via Atlassian MCP, and migrate the
  existing GitHub Attention Inbox to GitHub MCP, sharing one extension-owned MCP connection layer
  (Requirement.md §3).
- Referenced Business Requirement: `01-Requirement/Requirement.md` (FR-001..FR-013)
- Referenced System Design: `03-Design/Design.md`
- Referenced Technical Design: `03-Design/TechnicalDesign.md`
- Estimated complexity: High (new cross-cutting OAuth/MCP infrastructure, two domain migrations)
- Estimated implementation phases: 4

## 2. Scope
- Included work: the `src/mcp/` connection layer; replacing `src/jira/client.ts` and
  `src/github/client.ts` with MCP adapters; the resulting type/store/controller changes in both
  domains; deleting the superseded direct-REST/octokit code; wiring changes in
  `extension.ts`/the two panels/`SidebarProvider.ts`.
- Excluded work: the Copilot SDK chat feature (Phase 2, Requirement.md §5 Out of Scope); any
  change to `AttentionEngine`, `LastSeenStore`, `RefreshScheduler`, or `matchPullRequestForIssue`.
- Deferred work: GitHub MCP cutover is code-complete by TASK-017/018 but is only a *parity
  candidate* until AC-015's manual/exploratory live-endpoint validation passes in
  `06-UnitTest`/`07-CodeReview` (BR-008) — deferred to those stages, not resolved by this plan.
- Future enhancements (not this plan): Copilot SDK tool adapter (Design.md §6, Future phase).

## 3. Dependency Graph
```
TASK-001 (mcp/types.ts)
   ↓
TASK-002 (add @modelcontextprotocol/sdk dependency)
   ↓
TASK-003 (secretTokenStore.ts) ──┐
TASK-004 (loopbackRedirect.ts) ──┼──→ TASK-006 (oauthClientProvider.ts)
TASK-005 (errorMapper.ts) ───────┘         ↓
                                     TASK-007 (connectionService.ts)
                                            ↓
                      ┌─────────────────────┴─────────────────────┐
                      ↓                                            ↓
TASK-008 (jira/types.ts)                              TASK-015 (github/githubMcpAdapter.ts)
      ↓                                                            ↓
TASK-009 (jira/atlassianMcpAdapter.ts)                 TASK-016 (github/configStore.ts)
      ↓                                                TASK-017 (github/viewController.ts)
TASK-010 (jira/connectionStore.ts)                                 ↓
TASK-011 (jira/configStore.ts)                         TASK-018 (delete github/client.ts + octokit dep)
TASK-012 (jira/errorClassifier.ts)
      ↓ (010,011,012 all complete)
TASK-013 (jira/viewController.ts)
      ↓
TASK-014 (delete jira/client.ts)
      │                                                            │
      └─────────────────────────┬──────────────────────────────────┘
                                 ↓
                   TASK-019 (wiring: extension.ts, panels, SidebarProvider.ts)
```
The Developer never determines execution order — it is fixed here. TASK-010/011/012 may be done
in any order relative to each other (all depend only on TASK-009) but must all be complete before
TASK-013. TASK-016/017 may be done in any order relative to each other but must both be complete
before TASK-018. The Jira chain (008→014) and the GitHub chain (015→018) may be worked in any
order relative to each other once TASK-007 is complete; both must be complete before TASK-019.

## 4. Implementation Phases
| Phase | Name | Tasks |
|---|---|---|
| 1 | MCP connection layer foundation | TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007 |
| 2 | Jira domain migration | TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-013, TASK-014 |
| 3 | GitHub domain migration | TASK-015, TASK-016, TASK-017, TASK-018 |
| 4 | Wiring and cutover | TASK-019 |

## 5. Task Specification

### TASK-001
- **Purpose**: Establish the shared type vocabulary every other `src/mcp/` module and both
  adapters depend on.
- **Business Requirement Mapping**: FR-001, FR-011, FR-013 (shared MCP connection foundation)
- **Technical Design Reference**: TechnicalDesign.md §2 (`src/mcp/types.ts`), §8
- **Objective**: Create `src/mcp/types.ts` declaring `McpServerId`, `McpToolErrorCategory`, and
  `McpToolError`.
- **Files To Create**: `src/mcp/types.ts`
- **Files To Modify**: none
- **Files Forbidden To Modify**: anything outside `src/mcp/types.ts`
- **Implementation Notes**: `McpServerId = 'atlassian' | 'github'`. `McpToolErrorCategory =
  'auth-expired' | 'rate-limited' | 'invalid-entry' | 'network'` (same four categories as the
  existing `GitHubFailureCategory`/`JiraFailureCategory` in `src/github/types.ts` /
  `src/jira/types.ts` — reuse the same four strings, do not invent new ones).
  `McpToolError = { serverId: McpServerId; category: McpToolErrorCategory; detail: string;
  resetAt?: string }`. No logic, types only.
- **Dependencies**: none
- **Expected Output**: `src/mcp/types.ts` exporting the three type/interface declarations above.
- **Acceptance Criteria**: `npm run compile` succeeds; no other file imports anything from this
  module yet (nothing to break).
- **Validation Steps**: Build (`npm run compile`).
- **Rollback Strategy**: Delete `src/mcp/types.ts`.
- **Definition of Complete**: File exists, compiles, exports exactly the three types above.

### TASK-002
- **Purpose**: Make the MCP TypeScript SDK available to the connection layer.
- **Business Requirement Mapping**: FR-001, FR-013
- **Technical Design Reference**: TechnicalDesign.md §25 (Implementation Constraints), §24
  (OTQ-4)
- **Objective**: Add `@modelcontextprotocol/sdk` as a pinned runtime dependency in
  `package.json`.
- **Files To Create**: none
- **Files To Modify**: `package.json`, `package-lock.json`
- **Files Forbidden To Modify**: any other `dependencies`/`devDependencies` entry
- **Implementation Notes**: Add exactly one dependency: `"@modelcontextprotocol/sdk": "<pinned
  exact version>"`. Resolve the exact version to pin at implementation time (Developer Freedom,
  TechnicalDesign.md §26) by checking the latest stable release on npm; do not use `^`/`~`/
  `latest`/`*`. Immediately after adding it, check (don't guess) whether the package publishes a
  usable CommonJS build for this project's `esbuild`/`format: cjs` bundle target (OTQ-4): if it
  is ESM-only, the dynamic-import workaround already used for `octokit` in the (still-present at
  this point) `src/github/client.ts` is the required pattern for TASK-007's `connectionService.ts`
  — record which case applies in `DecisionLog.md` now, so TASK-007 doesn't have to re-derive it.
  Run `npm install` to update the lockfile.
- **Dependencies**: none
- **Expected Output**: `package.json`/`package-lock.json` updated; `node_modules` has the SDK
  installed.
- **Acceptance Criteria**: `npm install` completes with no errors; `npm run compile` still
  succeeds (nothing imports the SDK yet).
- **Validation Steps**: `npm install`; Build.
- **Rollback Strategy**: `npm uninstall @modelcontextprotocol/sdk`, revert `package.json`/
  `package-lock.json`.
- **Definition of Complete**: Dependency installed and pinned; ESM-vs-CJS finding logged to
  `DecisionLog.md`.

### TASK-003
- **Purpose**: Own all MCP OAuth state (client registration, tokens, PKCE verifier) in
  SecretStorage, per server.
- **Business Requirement Mapping**: FR-001, FR-011; BR-002, VR-003
- **Technical Design Reference**: TechnicalDesign.md §2, §5, §22 (`src/mcp/secretTokenStore.ts`)
- **Objective**: Create `src/mcp/secretTokenStore.ts` implementing `McpSecretTokenStore`.
- **Files To Create**: `src/mcp/secretTokenStore.ts`, `src/mcp/secretTokenStore.test.ts`
- **Files To Modify**: none
- **Files Forbidden To Modify**: anything outside the two files above
- **Implementation Notes**: Constructor takes `(context: vscode.ExtensionContext, serverId:
  McpServerId)`. Secret keys are namespaced `devAssistant.mcp.<serverId>.clientInformation`,
  `devAssistant.mcp.<serverId>.tokens`, `devAssistant.mcp.<serverId>.codeVerifier` — one
  `context.secrets.store`/`get`/`delete` call per method, JSON-stringified. Methods:
  `getClientInformation()`/`saveClientInformation(info)`, `getTokens()`/`saveTokens(tokens)`,
  `getCodeVerifier()`/`saveCodeVerifier(verifier)`, `clear()` (deletes all three keys for this
  server — used on disconnect/auth failure per FR-011). This class has no MCP-SDK-specific
  method names of its own; TASK-006's `oauthClientProvider.ts` adapts these generic get/save
  methods to the SDK's `OAuthClientProvider` interface shape — don't couple this store to the SDK.
- **Dependencies**: none
- **Expected Output**: `McpSecretTokenStore` class with the six methods above.
- **Acceptance Criteria**: Unit tests cover: save-then-get round-trips for each of the three
  secret kinds; `get*()` on an unset key returns `undefined`; `clear()` removes all three keys
  and a subsequent `get*()` call returns `undefined` for each.
- **Validation Steps**: Build; `npm test` (fake `ExtensionContext.secrets` — an in-memory
  `Map`-backed stub, same style as existing GitHub/Jira store tests).
- **Rollback Strategy**: Delete both files.
- **Definition of Complete**: Class implemented, all listed test cases pass.

### TASK-004
- **Purpose**: Receive the one OAuth browser redirect locally, without a custom URI scheme.
- **Business Requirement Mapping**: FR-001; VR-002
- **Technical Design Reference**: TechnicalDesign.md §2, §6, "Grounded external facts"
  (`src/mcp/loopbackRedirect.ts`)
- **Objective**: Create `src/mcp/loopbackRedirect.ts` implementing `LoopbackRedirectServer`.
- **Files To Create**: `src/mcp/loopbackRedirect.ts`, `src/mcp/loopbackRedirect.test.ts`
- **Files To Modify**: none
- **Files Forbidden To Modify**: anything outside the two files above
- **Implementation Notes**: Use Node's built-in `http` module (`http.createServer`), bound only
  to `'127.0.0.1'`, port `0` (OS-assigned). `start(expectedState: string):
  { redirectUri: string; result: Promise<{ code: string }> }` — `redirectUri` is
  `http://127.0.0.1:<assignedPort>/callback` (read the assigned port from `server.address()`
  after `listen()` resolves). The server responds to exactly one GET request to `/callback`:
  parse its query string; if `state` doesn't match `expectedState`, reject the promise with
  `{ category: 'invalid-entry', detail: 'OAuth state mismatch' }` (via `src/mcp/types.ts`'s
  `McpToolError` shape — this module may import `McpToolError` from `./types`); if `error` is
  present, reject with `{ category: 'auth-expired', detail: <error param> }`; otherwise resolve
  with `{ code: <code param> }`. Respond to the browser with a minimal "You can close this
  window" HTML page before closing the server. Always call `server.close()` after handling the
  one request, on a 120-second timeout (reject with `{ category: 'network', detail: 'OAuth
  callback timed out' }` and close the server), or on an explicit `stop()` call. Never respond to
  a second request on the same server instance.
- **Dependencies**: TASK-001 (uses `McpToolError`)
- **Expected Output**: `LoopbackRedirectServer` class with `start`/`stop`.
- **Acceptance Criteria**: Unit tests cover: successful callback resolves `{code}`; mismatched
  `state` rejects with `invalid-entry`; an `error` query param rejects with `auth-expired`; the
  120s timeout rejects with `network` (use a fake/injectable clock or a short test-only timeout
  override — do not make the real unit test wait 120 real seconds); the server is closed (no
  longer listening) after each of these outcomes.
- **Validation Steps**: Build; `npm test` (real ephemeral loopback socket — no live MCP server
  needed; the test drives the callback with a real HTTP request to the server's own assigned
  port).
- **Rollback Strategy**: Delete both files.
- **Definition of Complete**: Class implemented, all listed test cases pass, no port/socket leak
  across tests (each test's server is closed before the next starts).

### TASK-005
- **Purpose**: Normalize any thrown MCP/transport error into one shared shape before it reaches
  either domain's own classifier.
- **Business Requirement Mapping**: FR-010; Requirement.md §12
- **Technical Design Reference**: TechnicalDesign.md §2, §12 (`src/mcp/errorMapper.ts`)
- **Objective**: Create `src/mcp/errorMapper.ts` exporting `McpErrorMapper.mapError`.
- **Files To Create**: `src/mcp/errorMapper.ts`, `src/mcp/errorMapper.test.ts`
- **Files To Modify**: none
- **Files Forbidden To Modify**: anything outside the two files above
- **Implementation Notes**: `mapError(serverId: McpServerId, error: unknown): McpToolError`.
  Inspect, in order: (1) an HTTP-status-shaped error (`{ status: number }`, same shape the
  deleted `src/jira/client.ts`/`src/github/client.ts` already threw) — `401`→`auth-expired`,
  `429`→`rate-limited` (carry `resetAt` if a `retryAfter`/`resetAt` field is present, same
  pattern as the existing `JiraErrorClassifier`), `400`/`404`→`invalid-entry`; (2) an MCP
  JSON-RPC error object (`{ code: number; message: string }` per the MCP spec) — map
  `-32001`/explicit "unauthorized" text → `auth-expired`, anything else tool-shaped →
  `invalid-entry`; (3) anything else (network/transport failure, `fetch` rejection) →
  `network`. Always set `serverId` on the result. Never include the raw error object or any
  header/token value in `detail` — only a short human-readable message (Security Considerations,
  TechnicalDesign.md §22).
- **Dependencies**: TASK-001
- **Expected Output**: `McpErrorMapper` const object with one method.
- **Acceptance Criteria**: Unit tests cover each of the three error shapes above and their
  category mapping, including the `resetAt` passthrough for a 429 with `retryAfter`.
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Delete both files.
- **Definition of Complete**: All listed test cases pass.

### TASK-006
- **Purpose**: Implement the MCP SDK's `OAuthClientProvider` contract for one server, wiring
  DCR, PKCE, and the loopback redirect together.
- **Business Requirement Mapping**: FR-001, FR-013; BR-002
- **Technical Design Reference**: TechnicalDesign.md §2, §6, §22 (`src/mcp/oauthClientProvider.ts`),
  OTQ-3
- **Objective**: Create `src/mcp/oauthClientProvider.ts` exporting
  `createOAuthClientProvider(serverId, store)`.
- **Files To Create**: `src/mcp/oauthClientProvider.ts`, `src/mcp/oauthClientProvider.test.ts`
- **Files To Modify**: none
- **Files Forbidden To Modify**: anything outside the two files above
- **Implementation Notes**: The factory takes `(serverId: McpServerId, store:
  McpSecretTokenStore)` and returns an object satisfying the installed
  `@modelcontextprotocol/sdk` version's `OAuthClientProvider` interface (check the actual
  installed type definitions — do not assume a method list without reading them, per OTQ-3).
  At minimum it must implement: `redirectUrl` (delegates to a fresh `LoopbackRedirectServer.start()`
  call per authorization attempt — a new loopback server per attempt, never reused),
  `clientMetadata()` (returns `{ redirect_uris: [<the loopback redirectUri>], token_endpoint_auth_method:
  'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }` — no
  `client_secret` field, ever), `clientInformation()`/`saveClientInformation()` (delegate to
  `store.getClientInformation()`/`saveClientInformation()`), `tokens()`/`saveTokens()` (delegate
  to `store.getTokens()`/`saveTokens()`), `codeVerifier()`/`saveCodeVerifier()` (delegate to
  `store.getCodeVerifier()`/`saveCodeVerifier()` — if the SDK generates the verifier internally,
  this method only persists what the SDK gives it; if the SDK expects the caller to generate it
  (OTQ-3), generate 32 random bytes via `crypto.randomBytes` and base64url-encode, per RFC 7636),
  and `redirectToAuthorization(authorizationUrl: URL)` (calls
  `vscode.env.openExternal(authorizationUrl)` — never opens a webview or follows the redirect
  itself). Resolve OTQ-3 (does the SDK provide a PKCE helper) by reading the installed package's
  actual exports/types before writing this method's body — record the finding in `DecisionLog.md`.
- **Dependencies**: TASK-002, TASK-003, TASK-004
- **Expected Output**: `createOAuthClientProvider` factory function.
- **Acceptance Criteria**: Unit tests cover: `clientMetadata()` never includes a `client_secret`
  key; `tokens()`/`saveTokens()`/`codeVerifier()`/`saveCodeVerifier()`/`clientInformation()`/
  `saveClientInformation()` round-trip through a fake `McpSecretTokenStore`;
  `redirectToAuthorization` calls `vscode.env.openExternal` with the exact URL it was given and
  does not itself attempt to parse or follow it.
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Delete both files.
- **Definition of Complete**: Provider implements every method the installed SDK's
  `OAuthClientProvider` type requires; listed test cases pass; OTQ-3 finding logged.

### TASK-007
- **Purpose**: Own one MCP `Client` + transport per configured server; the sole SDK import
  point and sole place `.mcp.json` is read.
- **Business Requirement Mapping**: FR-001, FR-005, FR-008, FR-011, FR-012, FR-013
- **Technical Design Reference**: TechnicalDesign.md §2, §5, §6, §14, §20 (`src/mcp/connectionService.ts`),
  OTQ-1, OTQ-4
- **Objective**: Create `src/mcp/connectionService.ts` exporting `McpConnectionService`.
- **Files To Create**: `src/mcp/connectionService.ts`, `src/mcp/connectionService.test.ts`
- **Files To Modify**: none
- **Files Forbidden To Modify**: anything outside the two files above; must not import
  `src/jira/*` or `src/github/*`
- **Implementation Notes**: Constructor takes `(context: vscode.ExtensionContext)`; reads
  `.mcp.json` at the extension root (same file already configured —
  `mcpServers['com.atlassian/atlassian-mcp-server'].url` and
  `mcpServers['io.github.github/github-mcp-server'].url`) to resolve each `McpServerId`'s
  endpoint URL. Internal per-server state: one `McpSecretTokenStore`, one
  `OAuthClientProvider` (from TASK-006), and a lazily-created SDK `Client` +
  `StreamableHTTPClientTransport` pair, plus an in-flight-connect `Promise` cache keyed by
  `serverId` so two concurrent `connect()` calls for the same server share one browser window
  (TechnicalDesign.md §20 concurrency note). `connect(serverId, opts?: { extraHeaders?:
  Record<string,string> })`: if already connected, return immediately; otherwise construct the
  transport (per OTQ-4's finding from TASK-002, either a static or dynamic import of the SDK) with
  the given `extraHeaders` (used by `GithubMcpAdapter` to pass a Bearer session token — see
  TASK-015) and the server's `OAuthClientProvider` as `authProvider`, then call `client.connect`.
  If DCR itself is rejected by the remote server (OTQ-1 materializing — a 4xx on the registration
  call, surfaced by the SDK before any browser opens), do not retry or fall back to any other
  auth mechanism — propagate the mapped `McpToolError` (`category: 'auth-expired'`) so the caller
  can show a connection failure; record this exact failure mode's first live occurrence in
  `DecisionLog.md` and escalate to the user per TechnicalDesign.md's OTQ-1 note. `disconnect
  (serverId)`: close the transport, clear the cached `Client`, and call
  `secretTokenStore.clear()` for that server. `isConnected(serverId)`: boolean, no network call.
  `callTool(serverId, name, args)`: ensure connected (calling `connect` if not — but only for the
  OAuth path; `GithubMcpAdapter`'s Bearer-header path, §TASK-015, calls `connect` itself with
  `extraHeaders` first and only falls through to the plain OAuth path on a 401), then
  `client.callTool({ name, arguments: args })`, mapping any thrown error through
  `McpErrorMapper.mapError(serverId, error)` before rethrowing. `dispose()`: disconnect both
  servers (called from `extension.ts`'s `deactivate()`).
- **Dependencies**: TASK-001, TASK-002, TASK-005, TASK-006
- **Expected Output**: `McpConnectionService` class with `connect`/`disconnect`/`isConnected`/
  `callTool`/`dispose`.
- **Acceptance Criteria**: Unit tests cover: `callTool` on an unconnected server triggers
  `connect` first; two concurrent `connect()` calls for the same server only construct one
  transport/open one browser window (assert the OAuth provider's `redirectToAuthorization` is
  invoked once, not twice, for two simultaneous callers); a thrown tool error is mapped through
  `McpErrorMapper` before reaching the caller; `disconnect` clears stored credentials;
  `isConnected` reflects connect/disconnect state without a network call. Mock the SDK's
  `Client`/transport at the constructor boundary (inject a test double for the SDK client
  factory, mirroring the existing `setOctokitCtorForTesting` seam's *intent* — see
  TechnicalDesign.md §23) rather than hitting a real network endpoint.
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Delete both files.
- **Definition of Complete**: All listed test cases pass; OTQ-4's ESM/CJS finding from TASK-002
  is applied here (dynamic import if needed) and actually compiles/bundles.

### TASK-008
- **Purpose**: Change `JiraConnection`'s shape to carry only non-secret site identity, removing
  the API-token/email fields the MCP migration deletes.
- **Business Requirement Mapping**: FR-001; BR-002
- **Technical Design Reference**: TechnicalDesign.md §2 (`src/jira/types.ts`)
- **Objective**: Modify `src/jira/types.ts`'s `JiraConnection` interface.
- **Files To Create**: none
- **Files To Modify**: `src/jira/types.ts`
- **Files Forbidden To Modify**: `JiraSavedQuery`, `JiraFailureCategory`, `JiraFailure`,
  `JiraPrLinkState`, `JiraTask`, `JiraViewState`, `JiraIncomingMessage`,
  `JiraOutgoingMessage` — their shapes are unchanged; `JiraIncomingMessage`'s
  `'jira.saveConnection'` variant's payload fields are addressed in TASK-010, not here
- **Implementation Notes**: Replace
  `export interface JiraConnection { baseUrl: string; email: string; apiToken: string; }` with
  `export interface JiraConnection { siteUrl: string; siteId: string; }`. This will break
  `src/jira/client.ts`, `src/jira/connectionStore.ts`, `src/jira/configStore.ts`, and
  `src/jira/viewController.ts`'s current compilation — that is expected and resolved by
  TASK-009/010/011/012/013 in order; do not attempt to fix those files in this task.
- **Dependencies**: none
- **Expected Output**: Updated `JiraConnection` interface.
- **Acceptance Criteria**: `src/jira/types.ts` itself compiles in isolation (type-check the file;
  the rest of the project is expected to fail to compile until TASK-013 completes — note this in
  `05-Implementation/notes.md` rather than treating it as this task's failure).
- **Validation Steps**: `tsc --noEmit src/jira/types.ts` (or visually confirm the type-only edit)
  — full-project `npm run compile` is not expected to pass again until TASK-013.
- **Rollback Strategy**: Revert the interface to its prior shape.
- **Definition of Complete**: Interface updated exactly as specified.

### TASK-009
- **Purpose**: Replace the deleted-in-spirit Basic-auth Jira REST client with an Atlassian MCP
  adapter exposing the same three operations.
- **Business Requirement Mapping**: FR-001, FR-003, FR-005; VR-002, VR-005
- **Technical Design Reference**: TechnicalDesign.md §2, §5, §10, §11 (`src/jira/atlassianMcpAdapter.ts`),
  Analysis.md Feasibility Notes (Atlassian MCP v2 metadata)
- **Objective**: Create `src/jira/atlassianMcpAdapter.ts` exporting `AtlassianMcpAdapter`.
- **Files To Create**: `src/jira/atlassianMcpAdapter.ts`, `src/jira/atlassianMcpAdapter.test.ts`
- **Files To Modify**: none (does not yet touch `src/jira/client.ts` — that deletion is
  TASK-014, after nothing references it)
- **Files Forbidden To Modify**: `src/jira/client.ts` (leave in place, unreferenced-by-this-file,
  until TASK-014)
- **Implementation Notes**:
  ```ts
  export const AtlassianMcpAdapter = {
    async validateConnection(
      connectionService: McpConnectionService,
      siteUrl: string,
    ): Promise<{ ok: true; siteId: string } | { ok: false; reason: string }> { /* ... */ },
    async validateQuery(
      connectionService: McpConnectionService,
      siteId: string,
      jql: string,
    ): Promise<{ ok: true } | { ok: false; reason: string }> { /* ... */ },
    async fetchIssues(
      connectionService: McpConnectionService,
      siteId: string,
      jql: string,
    ): Promise<JiraTask[]> { /* ... */ },
  };
  ```
  `validateConnection`: call `connectionService.callTool('atlassian', 'getAccessibleAtlassianResources',
  {})`, expect an array of `{ id: string; url: string; name: string }`; match `siteUrl` against
  each entry's `url` by normalized origin (strip trailing slash, case-insensitive host); if found,
  return `{ ok: true, siteId: <id> }`; if the array is empty or has no match, return `{ ok: false,
  reason: 'Could not find an accessible Jira site at that URL.' }` (VR-002). `validateQuery`: call
  `connectionService.callTool('atlassian', 'searchJiraIssuesUsingJql', { cloudId: siteId, jql,
  maxResults: 1, fields: ['summary'] })`; on success return `{ ok: true }`; on a thrown
  `McpToolError` with `category: 'invalid-entry'`, return `{ ok: false, reason: <detail> }`; any
  other category, rethrow (VR-005). `fetchIssues`: same tool call with `maxResults: 50, fields:
  ['summary', 'status', 'assignee']`; map each returned issue (`{ key, fields: { summary, status:
  { name }, assignee: { displayName } | null } }`) into a `JiraTask` with `prLink: { kind:
  'not-available' }` (the caller, `JiraViewController`, fills in real linkage — mirrors the
  deleted `mapIssue` function's division of labor exactly). **Tool/parameter names above
  (`getAccessibleAtlassianResources`, `searchJiraIssuesUsingJql`, `cloudId`) are the best
  publicly-documented names for Atlassian's remote MCP server, not independently verified against
  a live `tools/list` call (no live MCP session was available during planning — see Analysis.md's
  Feasibility Notes).** Before writing the tool-call bodies, call `connectionService`'s
  `tools/list` (via a throwaway `callTool`-adjacent SDK method, or by inspecting the `Client`'s
  capabilities) against the real endpoint and confirm these names and their request/response
  shape; if they differ, use the real names/shapes — the response-mapping logic above is what
  must hold, not the exact tool identifiers. Log the confirmed names to `DecisionLog.md`.
- **Dependencies**: TASK-007, TASK-008
- **Expected Output**: `AtlassianMcpAdapter` const object with the three methods above.
- **Acceptance Criteria**: Unit tests (mocking `McpConnectionService.callTool`) cover: a matching
  site is found by URL (case/trailing-slash insensitive); no matching site returns the stated
  failure reason; a valid JQL validates successfully; an `invalid-entry` JQL error returns `{ ok:
  false }` with the provider's detail message; `fetchIssues` maps a multi-issue response into
  `JiraTask[]` with `assignee: null` handled.
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Delete both files.
- **Definition of Complete**: All listed test cases pass; confirmed tool names logged to
  `DecisionLog.md` (or the documented names confirmed unchanged).

### TASK-010
- **Purpose**: Make `JiraConnectionStore` persist only non-secret site identity and trigger MCP
  authorization instead of capturing an API token.
- **Business Requirement Mapping**: FR-001, FR-011; BR-002, BR-007, VR-001, VR-002
- **Technical Design Reference**: TechnicalDesign.md §2, §5, §9 (`src/jira/connectionStore.ts`)
- **Objective**: Modify `src/jira/connectionStore.ts` to use `McpConnectionService` +
  `AtlassianMcpAdapter` instead of `JiraClient`, and to drop the `apiToken` secret.
- **Files To Create**: none
- **Files To Modify**: `src/jira/connectionStore.ts`, `src/jira/connectionStore.test.ts`,
  `package.json` (remove the `devAssistant.jira.email` setting from `contributes.configuration`;
  rename `devAssistant.jira.baseUrl` to `devAssistant.jira.siteUrl` in the same block; add
  `devAssistant.jira.siteId`, type `string`, default `""`, internal — not user-editable in
  practice but still a plain setting per TechnicalDesign.md §9's "no database" constraint)
- **Files Forbidden To Modify**: `src/jira/client.ts` (still present, unreferenced by this file
  after this task; deleted in TASK-014)
- **Implementation Notes**: Constructor becomes `(context: vscode.ExtensionContext,
  connectionService: McpConnectionService)` — drop the `client: typeof JiraClient` parameter.
  `getConnection()`: read `devAssistant.jira.siteUrl`/`siteId` from settings; return `undefined`
  if either is empty; otherwise return `{ siteUrl, siteId }`. `saveConnection(siteUrl: string):
  Promise<{ok:true}|{ok:false;reason:string}>` (new signature — one string parameter, not the old
  `{baseUrl,email,apiToken}` object): validate `siteUrl` with the existing `URL_FORMAT`/`new
  URL(...)` checks (VR-001, unchanged logic) first; then `await
  connectionService.connect('atlassian')` (surfaces a connection failure per TASK-007's contract
  if DCR/OAuth fails — propagate that failure's `reason` as-is, do not swallow it); then
  `AtlassianMcpAdapter.validateConnection(connectionService, siteUrl)`; on success, persist
  `siteUrl`/`siteId` to settings and return `{ok:true}`; on failure, return `{ok:false, reason}`
  — do **not** call `connectionService.disconnect('atlassian')` on a validation failure (the
  OAuth session itself succeeded; only the site match failed — Design.md §7's alternative flow
  "more than one Jira site is authorized → developer chooses one" implies the authorized session
  should be kept for a retry with a different `siteUrl`). `clearConnection()`: clear the
  `siteUrl`/`siteId` settings AND call `connectionService.disconnect('atlassian')` (FR-011 — this
  now also clears MCP credentials, since this store no longer owns a separate secret of its own).
  Remove the `SECRET_KEY`/`context.secrets` usage entirely — if a legacy
  `devAssistant.jira.apiToken` secret exists from before this migration, delete it opportunistically
  in `clearConnection()` and once on the first successful `saveConnection()` (BR-007) via
  `context.secrets.delete('devAssistant.jira.apiToken')` (safe no-op if unset).
- **Dependencies**: TASK-008, TASK-009
- **Expected Output**: `JiraConnectionStore` with the new constructor and method signatures
  above.
- **Acceptance Criteria**: Unit tests cover: `getConnection()` returns `undefined` when settings
  are empty; `saveConnection` rejects an invalid URL before calling `connectionService.connect`
  (VR-001, no network call made); a successful connect+validate persists `siteUrl`/`siteId` and
  returns `{ok:true}`; a failed site-match returns `{ok:false,reason}` without disconnecting;
  `clearConnection` clears both settings, calls `disconnect('atlassian')`, and deletes the legacy
  secret key.
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Revert the three modified files.
- **Definition of Complete**: All listed test cases pass; legacy secret cleanup verified by a
  test that pre-seeds the old secret key and asserts it's gone after `clearConnection`/
  `saveConnection`.

### TASK-011
- **Purpose**: Validate a saved query through the Atlassian MCP adapter instead of the deleted
  REST client.
- **Business Requirement Mapping**: FR-002, FR-003, FR-004; BR-001, BR-005, VR-004, VR-005
- **Technical Design Reference**: TechnicalDesign.md §2, §5, §9 (`src/jira/configStore.ts`)
- **Objective**: Modify `src/jira/configStore.ts` to call `AtlassianMcpAdapter.validateQuery`
  instead of `JiraClient.validateQuery`.
- **Files To Create**: none
- **Files To Modify**: `src/jira/configStore.ts`, `src/jira/configStore.test.ts`
- **Files Forbidden To Modify**: `JiraConnectionStore`'s public interface (read `connection.siteId`
  from the already-updated `JiraConnection`, don't change the store's contract further),
  `src/jira/client.ts`
- **Implementation Notes**: Constructor becomes `(connectionStore: JiraConnectionStore,
  connectionService: McpConnectionService)` — drop the `client: typeof JiraClient` parameter.
  In `addQuery`, replace `this.client.validateQuery(connection, jql)` with
  `AtlassianMcpAdapter.validateQuery(connectionService, connection.siteId, jql)`. All other logic
  (trimmed-label/empty-JQL checks, BR-005 uniqueness check, persisting to
  `devAssistant.jira.savedQueries`) is unchanged — this is a one-line dependency swap plus the
  constructor signature change.
- **Dependencies**: TASK-009
- **Expected Output**: `JiraConfigStore` depending on `AtlassianMcpAdapter`/`McpConnectionService`
  instead of `JiraClient`.
- **Acceptance Criteria**: Existing test cases (label/JQL validation, BR-005 uniqueness, remove)
  still pass with the adapter substituted; one new/updated test confirms `validateQuery` is
  called with `connection.siteId` (not the old `connection` object shape).
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Revert the two modified files.
- **Definition of Complete**: All test cases pass.

### TASK-012
- **Purpose**: Classify a normalized `McpToolError` into a `JiraFailure`, replacing the raw-HTTP
  classification logic.
- **Business Requirement Mapping**: FR-010; Requirement.md §12
- **Technical Design Reference**: TechnicalDesign.md §2, §12 (`src/jira/errorClassifier.ts`)
- **Objective**: Modify `src/jira/errorClassifier.ts`'s `classify` to accept an `McpToolError`.
- **Files To Create**: none
- **Files To Modify**: `src/jira/errorClassifier.ts`, `src/jira/errorClassifier.test.ts`
- **Files Forbidden To Modify**: `JiraFailure`/`JiraFailureCategory` (unchanged shapes, TASK-008
  scope)
- **Implementation Notes**: New signature: `classify(error: McpToolError): Omit<JiraFailure,
  'queryLabel'>`. Since `McpErrorMapper` (TASK-005) already normalized the category, this
  function becomes a straight passthrough/rename: `{ category: error.category, detail:
  error.detail, resetAt: error.resetAt }` — no more inspecting `status`/`errorMessages`/response
  headers (that logic now lives in `McpErrorMapper`, not duplicated here). Keep the function
  name/module shape (`JiraErrorClassifier.classify`) so `JiraViewController` (TASK-013) only
  needs to change its *import*, not its call site.
- **Dependencies**: TASK-001, TASK-008
- **Expected Output**: `JiraErrorClassifier.classify(error: McpToolError)`.
- **Acceptance Criteria**: Unit tests cover: each of the four `McpToolErrorCategory` values maps
  straight through; `resetAt` is passed through when present and omitted when absent.
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Revert the two modified files.
- **Definition of Complete**: All test cases pass.

### TASK-013
- **Purpose**: Wire `JiraViewController` to the Atlassian MCP adapter and the new
  `McpToolError`-based classifier, completing the Jira domain migration.
- **Business Requirement Mapping**: FR-005, FR-006, FR-007, FR-008, FR-009, FR-010
- **Technical Design Reference**: TechnicalDesign.md §2, §5, §6 (`src/jira/viewController.ts`)
- **Objective**: Modify `src/jira/viewController.ts` to depend on `AtlassianMcpAdapter`/
  `McpConnectionService` instead of `JiraClient`, and on `connection.siteId` instead of a Basic-
  auth `JiraConnection`.
- **Files To Create**: none
- **Files To Modify**: `src/jira/viewController.ts`, `src/jira/viewController.test.ts`
- **Files Forbidden To Modify**: `matchPullRequestForIssue`/`PullRequestCache` (read-only
  dependencies, unchanged), `src/jira/client.ts`
- **Implementation Notes**: Constructor's `client: typeof JiraClient` parameter becomes
  `connectionService: McpConnectionService` (the adapter functions are imported directly, same
  as `matchPullRequestForIssue` already is — they are module-level consts, not instance state).
  In `refresh()`, replace
  `this.client.fetchIssues(connection, query.jql).then((tasks) => ({ query, tasks }))` with
  `AtlassianMcpAdapter.fetchIssues(connectionService, connection.siteId,
  query.jql).then((tasks) => ({ query, tasks }))`. The redaction line
  `const detail = classified.detail.split(connection.apiToken).join('[REDACTED]')` must be
  **deleted outright** (`connection.apiToken` no longer exists — there is no credential in
  `JiraConnection` to redact; `McpErrorMapper`, TASK-005, already guarantees `detail` never
  contains a token). Everything else in `refresh()`/`getState()`/`buildTaskWithLinkage()`/message
  handling is unchanged.
- **Dependencies**: TASK-009, TASK-010, TASK-011, TASK-012
- **Expected Output**: `JiraViewController` compiling against the new adapter/types, with the
  token-redaction line removed.
- **Acceptance Criteria**: Existing test cases (refresh building `tasksByQuery`, per-query
  failure isolation per FR-010, linkage via `matchPullRequestForIssue`, message handling) pass
  with the adapter substituted; a test confirms the redaction line's removal didn't leave a
  dangling reference to `apiToken` anywhere in the file (grep-style assertion or simply: the file
  compiles, which it couldn't if the reference remained after TASK-008).
- **Validation Steps**: Build (this is the task where full-project `npm run compile` is expected
  to pass again for the Jira domain, per TASK-008's note); `npm test`.
- **Rollback Strategy**: Revert the two modified files.
- **Definition of Complete**: Full Jira domain compiles; all test cases pass.

### TASK-014
- **Purpose**: Remove the superseded Basic-auth Jira REST client now that nothing references it.
- **Business Requirement Mapping**: BR-002, BR-007 (no REST/API-token path remains)
- **Technical Design Reference**: TechnicalDesign.md §18, §25
- **Objective**: Delete `src/jira/client.ts` and `src/jira/client.test.ts`.
- **Files To Create**: none
- **Files To Modify**: none
- **Files To Delete**: `src/jira/client.ts`, `src/jira/client.test.ts`
- **Files Forbidden To Modify**: anything else
- **Implementation Notes**: Before deleting, grep the whole `src/` tree for `from './client'` /
  `from '../jira/client'` / `JiraClient` to confirm zero remaining references (TASK-009..013
  should have already removed every one). If any reference remains, that is a Blocking
  Condition — stop and report, do not delete the file out from under a live import.
- **Dependencies**: TASK-009, TASK-010, TASK-011, TASK-012, TASK-013
- **Expected Output**: The two files no longer exist.
- **Acceptance Criteria**: `npm run compile` succeeds; a repo-wide search for `JiraClient` or
  `jira/client` returns no matches.
- **Validation Steps**: Build; repo-wide text search.
- **Rollback Strategy**: Restore both files from version control.
- **Definition of Complete**: Files deleted; build still green.

### TASK-015
- **Purpose**: Replace the octokit/GraphQL GitHub client with a GitHub MCP adapter exposing the
  same four operations `GitHubConfigStore`/`GitHubViewController` already call.
- **Business Requirement Mapping**: FR-008, FR-012; AC-015
- **Technical Design Reference**: TechnicalDesign.md §2, §5, §17, §21 (`src/github/githubMcpAdapter.ts`),
  Analysis.md Feasibility Notes (GitHub MCP read-only tool set)
- **Objective**: Create `src/github/githubMcpAdapter.ts` exporting `GithubMcpAdapter` with
  `validateRepo`, `validateAuthor`, `fetchOpenPullRequests`, `getRateLimitStatus` — the exact
  method names `GitHubClient` exposes today.
- **Files To Create**: `src/github/githubMcpAdapter.ts`, `src/github/githubMcpAdapter.test.ts`
- **Files To Modify**: none (does not yet touch `src/github/client.ts` — deletion is TASK-018)
- **Files Forbidden To Modify**: `src/github/client.ts`, `src/github/types.ts`,
  `src/github/attentionEngine.ts`
- **Implementation Notes**: Every method takes the same parameters `GitHubClient`'s equivalent
  method takes today (`repo`/`author`/`session`), plus has access to a module-level
  `McpConnectionService` instance passed as each method's **first** parameter (mirrors
  `AtlassianMcpAdapter`'s shape from TASK-009, for consistency): e.g.
  `fetchOpenPullRequests(connectionService, repo, session)`. **Session-first, MCP-OAuth-fallback
  (Design.md §4):** every method first calls
  `connectionService.callTool('github', <tool>, <args>, { extraHeaders: { Authorization:
  \`Bearer ${session.accessToken}\` } })`; if that call throws an `McpToolError` with
  `category: 'auth-expired'`, retry exactly once via
  `await connectionService.connect('github')` (full MCP OAuth, no `extraHeaders`) followed by the
  same tool call with no `extraHeaders` — do not retry more than once, and do not silently swallow
  a second failure. `fetchOpenPullRequests(connectionService, repo, session)`: call
  `'list_pull_requests'` with `{ owner: repo.owner, repo: repo.repo, state: 'open' }`
  (tool name grounded in Analysis.md's Feasibility Notes); for each returned PR, concurrently
  (`Promise.all`) call `'pull_request_read'` for status/reviews/comments/checks (per Analysis.md:
  "pull_request_read supports details, status, reviews, comments, and check runs" — confirm the
  exact `method`/parameter the live tool uses to select which of those to return before writing
  this call; Analysis.md didn't record that parameter name) and, once per unique label name
  across all PRs, `'get_label'` for its color; map every field `PullRequestSummary` requires
  (TechnicalDesign.md §18's "must not change" list protects the *target* shape — mapping into it
  is this task's job), filtering out drafts exactly like the deleted client did. `validateRepo`/
  `validateAuthor`: Analysis.md did not confirm a dedicated repo/user-lookup MCP tool. Attempt a
  minimal-footprint read-only lookup tool (e.g. a `get_repository`/`search_users`-style tool) if
  one exists in the live `tools/list`; if none exists, fall back to the narrowest available
  read — e.g. `list_pull_requests` with `{ owner, repo }` and treat a `not-found`-shaped MCP
  error as "doesn't exist" for `validateRepo`, and an equivalent read-only user-lookup call for
  `validateAuthor` — **do not invent a tool name with unverified fields**; if no viable read-only
  existence check exists at all for one of these two, stop and escalate rather than always
  returning `true`. `getRateLimitStatus`: call whatever read-only rate-limit/quota tool the live
  `tools/list` exposes; if none exists, return a conservative placeholder
  (`{ remaining: Infinity, resetAt: new Date(0).toISOString() }`) and log that the tool is
  unavailable — this method's result is not currently consumed by `GitHubViewController`
  (confirmed by reading it — TASK-017 must not introduce a new caller of it beyond what exists
  today).
- **Dependencies**: TASK-007
- **Expected Output**: `GithubMcpAdapter` const object with the four methods above.
- **Acceptance Criteria**: Unit tests (mocking `McpConnectionService.callTool`/`connect`) cover:
  the session-Bearer-header path succeeds without calling `connect`; an `auth-expired` response
  triggers exactly one `connect('github')` + retry, not a loop; `fetchOpenPullRequests` maps a
  multi-PR, multi-label fixture into `PullRequestSummary[]` with drafts filtered out and label
  colors attached; `validateRepo`/`validateAuthor` each have at least one "found" and one
  "not found" test case against whatever lookup mechanism was actually implemented.
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Delete both files.
- **Definition of Complete**: All listed test cases pass; the tool names/parameters actually used
  (confirmed or best-effort) are logged to `DecisionLog.md`, flagged for AC-015's live parity
  check in `06-UnitTest`/`07-CodeReview`.

### TASK-016
- **Purpose**: Point `GitHubConfigStore`'s repo/author validation at the GitHub MCP adapter.
- **Business Requirement Mapping**: FR-012
- **Technical Design Reference**: TechnicalDesign.md §2 (`src/github/configStore.ts`)
- **Objective**: Modify `src/github/configStore.ts` to depend on `GithubMcpAdapter` +
  `McpConnectionService` instead of `GitHubClient`.
- **Files To Create**: none
- **Files To Modify**: `src/github/configStore.ts`, `src/github/configStore.test.ts`
- **Files Forbidden To Modify**: `src/github/client.ts`, `GitHubAuthService`
- **Implementation Notes**: Constructor becomes `(authService: GitHubAuthService,
  connectionService: McpConnectionService)` — drop `client: typeof GitHubClient`. Replace
  `this.client.validateRepo({ owner, repo }, session)` with
  `GithubMcpAdapter.validateRepo(connectionService, { owner, repo }, session)`, and
  `this.client.validateAuthor(...)` with `GithubMcpAdapter.validateAuthor(connectionService,
  ...)`. No other logic changes (repo-format regex, duplicate checks, settings read/write are
  unchanged).
- **Dependencies**: TASK-015
- **Expected Output**: `GitHubConfigStore` depending on `GithubMcpAdapter`/
  `McpConnectionService`.
- **Acceptance Criteria**: Existing test cases (repo format validation, duplicate detection,
  add/remove) pass with the adapter substituted.
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Revert the two modified files.
- **Definition of Complete**: All test cases pass.

### TASK-017
- **Purpose**: Point `GitHubViewController`'s PR fetch at the GitHub MCP adapter.
- **Business Requirement Mapping**: FR-012; AC-015
- **Technical Design Reference**: TechnicalDesign.md §2, §6 (`src/github/viewController.ts`)
- **Objective**: Modify `src/github/viewController.ts`'s constructor/`refresh()` to depend on
  `GithubMcpAdapter`/`McpConnectionService` instead of `GitHubClient`.
- **Files To Create**: none
- **Files To Modify**: `src/github/viewController.ts`, `src/github/viewController.test.ts`
- **Files Forbidden To Modify**: `AttentionEngine`, `LastSeenStore`, `PullRequestCache` (already
  wired, read-only/write-only usage unchanged), `src/github/client.ts`
- **Implementation Notes**: The `client: typeof GitHubClient` constructor parameter becomes
  `connectionService: McpConnectionService`. The single call site,
  `this.client.fetchOpenPullRequests(repo, session)`, becomes
  `GithubMcpAdapter.fetchOpenPullRequests(connectionService, repo, session)`. `ErrorClassifier.
  classify(result.reason)` (the *existing* `src/github/errorClassifier.ts`, not touched by this
  story — it already accepts the kind of thrown error `GithubMcpAdapter` will throw, since
  `McpErrorMapper`'s output shape is a superset that existing classifier logic can still read via
  `status`... **check this at implementation time**: if `GithubMcpAdapter` throws a raw
  `McpToolError` instead of the old `{status,message}` shape, `src/github/errorClassifier.ts`
  will not classify it correctly — in that case, adapt `GithubMcpAdapter`'s methods to throw the
  `{status: <mapped from McpToolError.category>, message: detail}` shape instead, so the existing,
  untouched `ErrorClassifier`/`GitHubFailure` pipeline keeps working without `coding-standard.md`
  §"Must NOT change" files being touched. This is a deliberate exception: `GithubMcpAdapter`
  throws the legacy `{status,message}` shape at its own boundary (translating `McpErrorMapper`'s
  `McpToolError` category back to a status-like number: `auth-expired`→401, `rate-limited`→429,
  `invalid-entry`→400, `network`→0/network), precisely so nothing downstream of it
  (`ErrorClassifier`, `GitHubViewController`'s failure handling) needs to change.** Everything
  else in `refresh()` is unchanged.
- **Dependencies**: TASK-015
- **Expected Output**: `GitHubViewController` depending on `GithubMcpAdapter`/
  `McpConnectionService`; `GithubMcpAdapter` throwing the legacy `{status,message}` shape at its
  boundary (amend TASK-015's adapter if this task discovers the mismatch after TASK-015 already
  shipped — report in `05-Implementation/notes.md` either way).
- **Acceptance Criteria**: Existing test cases (PR fetch building `lastFetchResult`, per-repo
  failure isolation, rate-limit handling, `pullRequestCache.setForRepo` writes) pass with the
  adapter substituted, with zero changes to `src/github/errorClassifier.ts`.
- **Validation Steps**: Build; `npm test`.
- **Rollback Strategy**: Revert the two modified files (and TASK-015's adapter if the
  `{status,message}` boundary shape was added there instead).
- **Definition of Complete**: All test cases pass; `src/github/errorClassifier.ts` confirmed
  unmodified.

### TASK-018
- **Purpose**: Remove the superseded octokit/GraphQL GitHub client and its dependency now that
  nothing references it.
- **Business Requirement Mapping**: FR-012 (MCP is now the sole GitHub data source)
- **Technical Design Reference**: TechnicalDesign.md §18, §25
- **Objective**: Delete `src/github/client.ts`/`src/github/client.test.ts` and remove the
  `octokit` dependency.
- **Files To Create**: none
- **Files To Modify**: `package.json`, `package-lock.json`
- **Files To Delete**: `src/github/client.ts`, `src/github/client.test.ts`
- **Files Forbidden To Modify**: anything else in `dependencies`
- **Implementation Notes**: Before deleting, grep the whole `src/` tree for `from './client'` /
  `from '../github/client'` / `GitHubClient` / `'octokit'` to confirm zero remaining references
  (TASK-015..017 should have already removed every one). If any reference remains, that is a
  Blocking Condition — stop and report. Run `npm uninstall octokit` after deleting the files.
  **This task is only allowed to run once AC-015's parity concern is either already satisfied by
  TASK-015/017's mapping or explicitly deferred to `06-UnitTest`/`07-CodeReview`'s live
  validation per BR-008 — removing the dependency doesn't bypass that gate, it just means there
  is no code-level fallback left if parity fails. If `06-UnitTest`/`07-CodeReview` later finds a
  parity gap, this deletion is NOT rolled back to "fix" it — the gap is fixed in
  `GithubMcpAdapter` (TASK-015), per BR-008's "cutover remains blocked" language meaning blocked
  from being *declared done*, not blocked from being *attempted*.**
- **Dependencies**: TASK-015, TASK-016, TASK-017
- **Expected Output**: The two files no longer exist; `octokit` removed from `package.json`.
- **Acceptance Criteria**: `npm run compile` succeeds; a repo-wide search for `GitHubClient`,
  `github/client`, or `octokit` returns no matches.
- **Validation Steps**: Build; repo-wide text search; `npm install` (confirms lockfile
  consistency after `npm uninstall`).
- **Rollback Strategy**: Restore both files and the `octokit` dependency from version control.
- **Definition of Complete**: Files deleted; dependency removed; build still green.

### TASK-019
- **Purpose**: Wire the new `McpConnectionService` and both adapters into the extension's
  activation path, completing the cutover for both domains.
- **Business Requirement Mapping**: FR-001, FR-012, FR-013
- **Technical Design Reference**: TechnicalDesign.md §2, §14 (`src/extension.ts`, the two panels,
  `SidebarProvider.ts`)
- **Objective**: Modify `src/extension.ts`, `src/panels/DashboardPanel.ts`,
  `src/panels/JiraDashboardPanel.ts`, and `src/views/SidebarProvider.ts` to construct and pass
  `McpConnectionService` in place of the two deleted clients.
- **Files To Create**: none
- **Files To Modify**: `src/extension.ts`, `src/panels/DashboardPanel.ts`,
  `src/panels/JiraDashboardPanel.ts`, `src/views/SidebarProvider.ts`
- **Files Forbidden To Modify**: `src/commands/*`, `ToolPanel.ts`, anything in `src/mcp/`,
  `src/jira/`, `src/github/` beyond the import/type changes this wiring requires
- **Implementation Notes**: In `extension.ts.activate`: construct
  `const connectionService = new McpConnectionService(context);` once, replacing the
  `new GitHubAuthService()`-adjacent `JiraClient`/`GitHubClient` references. Replace
  `const jiraConnectionStore = new JiraConnectionStore(context, JiraClient);` with
  `new JiraConnectionStore(context, connectionService)`. Replace
  `const jiraConfigStore = new JiraConfigStore(jiraConnectionStore, JiraClient);` with
  `new JiraConfigStore(jiraConnectionStore, connectionService)`. The `jiraServices` object's
  `client: JiraClient` field becomes `connectionService` (and anywhere `JiraDashboardPanel`/
  `SidebarProvider` constructed a `JiraViewController` using `jiraServices.client`, pass
  `jiraServices.connectionService` instead — update the `jiraServices`/`GitHubServices` bag
  type definitions in `DashboardPanel.ts`/`JiraDashboardPanel.ts`/`SidebarProvider.ts`
  accordingly). Replace `new GitHubConfigStore(authService, GitHubClient)` with
  `new GitHubConfigStore(authService, connectionService)`; every `GitHubViewController`/
  `DashboardPanel.createOrShow`/`SidebarProvider` construction's `client: GitHubClient` argument
  becomes `connectionService`. Register `context.subscriptions.push({ dispose: () =>
  connectionService.dispose() })` (or call `connectionService.dispose()` directly from
  `deactivate()` — either is acceptable; pick one and be consistent) so both MCP transports are
  closed on deactivation. Remove the now-unused `import { JiraClient } from './jira/client'` and
  `import { GitHubClient } from './github/client'` (already deleted by TASK-014/018, so these
  would already be compile errors if left in).
- **Dependencies**: TASK-013, TASK-014, TASK-017, TASK-018
- **Expected Output**: `extension.ts` and the three UI-host files compiling and activating with
  the new wiring; no remaining reference to either deleted client.
- **Acceptance Criteria**: `npm run compile` succeeds for the whole project; `npm test` passes
  for the whole project; manual smoke per Validation Steps.
- **Validation Steps**: Build; `npm test` (full suite); manual: run the extension in the
  Extension Development Host, open the Jira panel and the GitHub dashboard, confirm both render
  their setup/empty states without throwing (full OAuth round-trip against the live MCP
  endpoints is AC-015/OTQ-1's live validation, covered in `06-UnitTest`/`07-CodeReview`, not a
  requirement of this task's own validation).
- **Rollback Strategy**: Revert the four modified files.
- **Definition of Complete**: Whole-project build and test suite green; manual smoke confirms
  both panels activate without error.

## 6. Task Decomposition Rules
See `ai-factory/gates/eps-standard.md#task-decomposition-rules`. Every task above touches one
module (or one cross-cutting wiring concern in TASK-019's case) and has exactly one objective.

## 7. File Impact Analysis
| File | Reason for Change | Expected Modification | Risk Level | Owner Task |
|---|---|---|---|---|
| `src/mcp/types.ts` | New shared MCP types | Create | L | TASK-001 |
| `package.json` (dependency) | Add MCP SDK | Modify | L | TASK-002 |
| `src/mcp/secretTokenStore.ts` | OAuth secret persistence | Create | M | TASK-003 |
| `src/mcp/loopbackRedirect.ts` | OAuth redirect receiver | Create | M | TASK-004 |
| `src/mcp/errorMapper.ts` | Normalize MCP errors | Create | L | TASK-005 |
| `src/mcp/oauthClientProvider.ts` | DCR/PKCE/redirect wiring | Create | H | TASK-006 |
| `src/mcp/connectionService.ts` | Shared MCP connection manager | Create | H | TASK-007 |
| `src/jira/types.ts` | `JiraConnection` shape change | Modify | L | TASK-008 |
| `src/jira/atlassianMcpAdapter.ts` | Jira MCP adapter | Create | H | TASK-009 |
| `src/jira/connectionStore.ts` | No secret of its own; MCP-based | Modify | M | TASK-010 |
| `package.json` (jira settings) | `siteUrl`/`siteId`, drop `email` | Modify | L | TASK-010 |
| `src/jira/configStore.ts` | Validate via adapter | Modify | L | TASK-011 |
| `src/jira/errorClassifier.ts` | Classify `McpToolError` | Modify | L | TASK-012 |
| `src/jira/viewController.ts` | Depend on adapter | Modify | M | TASK-013 |
| `src/jira/client.ts` (+ test) | Superseded | Delete | L | TASK-014 |
| `src/github/githubMcpAdapter.ts` | GitHub MCP adapter | Create | H | TASK-015 |
| `src/github/configStore.ts` | Depend on adapter | Modify | L | TASK-016 |
| `src/github/viewController.ts` | Depend on adapter | Modify | M | TASK-017 |
| `package.json` (octokit dependency) | Remove superseded dependency | Modify | L | TASK-018 |
| `src/github/client.ts` (+ test) | Superseded | Delete | L | TASK-018 |
| `src/extension.ts` | Wire `McpConnectionService` | Modify | M | TASK-019 |
| `src/panels/DashboardPanel.ts` | Wire adapter | Modify | L | TASK-019 |
| `src/panels/JiraDashboardPanel.ts` | Wire adapter | Modify | L | TASK-019 |
| `src/views/SidebarProvider.ts` | Wire adapter | Modify | L | TASK-019 |

## 8. Database Changes
N/A — no database (Design.md §9).

## 9. API Changes
N/A — no extension-hosted HTTP API. External MCP tool calls are covered task-by-task above
(TASK-009, TASK-015) and in TechnicalDesign.md §11.

## 10. Event Changes
N/A — no event bus (Design.md §12).

## 11. Configuration Changes
- `devAssistant.jira.baseUrl` is renamed to `devAssistant.jira.siteUrl` (TASK-010).
- `devAssistant.jira.email` is removed (TASK-010).
- `devAssistant.jira.siteId` is added, internal/non-user-facing (TASK-010).
- `devAssistant.jira.apiToken` (secret) is deleted opportunistically on migration (TASK-010).
- `@modelcontextprotocol/sdk` is added as a dependency (TASK-002); `octokit` is removed
  (TASK-018).
- No new environment variables or feature flags.

## 12. Test Plan
- Unit tests: one `.test.ts` per new/modified module, per task above, run via `@vscode/test-cli`
  (`npm test`), matching existing project convention (`ai-factory/gates/coding-standard.md` §12).
- Integration tests: none beyond the existing Extension-Host-based unit tests — there is no
  separate integration-test tier in this project.
- Regression tests: every existing test file for an unmodified module (`attentionEngine.test.ts`,
  `lastSeenStore.test.ts`, `refreshScheduler.test.ts`, `pullRequestCache.test.ts`,
  `prLinkMatcher.test.ts`, `github/errorClassifier.test.ts`) must continue passing unmodified —
  verified as part of TASK-019's full-suite run.
- Performance tests: none automated — AC-015's parity/latency concern is validated manually
  during `06-UnitTest`/`07-CodeReview` against the live endpoints (TASK-015's Definition of
  Complete note).
- Negative tests / edge cases: DCR rejection (TASK-007), OAuth state mismatch and timeout
  (TASK-004), per-query/per-repo failure isolation (TASK-010/011/013/016/017), missing/legacy
  secret cleanup (TASK-010).
- Required coverage: every FR-ID in Requirement.md §8 maps to at least one task above (§1 Business
  Requirement Mapping fields); every acceptance criterion in Requirement.md §20 is exercised by
  the existing Jira/GitHub test suites once TASK-013/017 land, except AC-015 (explicitly deferred
  to live validation, not an automated unit test — TechnicalDesign.md §23).

## 13. Risk Analysis
Per `ai-factory/gates/risk-analysis.md`'s Low/Medium/High scale, extended per task.
| Task | Implementation Risk | Deployment Risk | Performance Risk | Security Risk | Regression Risk | Migration Risk | Mitigation |
|---|---|---|---|---|---|---|---|
| TASK-006/007 | H | M | L | M | L | L | OTQ-1 (DCR rejection) and OTQ-3/4 (SDK API shape) are the named unknowns; connect() surfaces a clear connection failure rather than a silent broker fallback, and the ESM/CJS finding is logged before TASK-007 writes import code, not discovered mid-task |
| TASK-009 | M | L | L | L | L | L | Tool/parameter names are best-effort from public docs (Analysis.md), not live-confirmed; task requires confirming against the live `tools/list` before shipping the call bodies and logging the result |
| TASK-015 | H | M | H | L | H | M | GitHub MCP may require several calls per PR (Design.md §15/§23) and may lack a dedicated repo/user-lookup tool (OTQ-2-adjacent); mitigated by `Promise.all` concurrency and an explicit escalation path if no viable existence-check tool exists; AC-015's live parity check is the final gate before this risk is considered resolved |
| TASK-010 | M | L | L | M | L | M | Legacy API-token secret must be deleted, not just left; tested explicitly (TASK-010 acceptance criteria) |
| TASK-017 | M | L | L | L | H | L | `GithubMcpAdapter` must throw the legacy `{status,message}` shape so the untouched `ErrorClassifier`/`GitHubFailure` pipeline isn't disturbed — explicit instruction in TASK-017, not left to the Developer to notice |
| TASK-018 | L | M | L | L | M | L | Dependency removal is gated on TASK-015/016/017 being complete and reference-free, verified by a repo-wide search before deleting |
| All others | L | L | L | L | L | L | Standard per-task validation (build/test) |

No remaining unmitigated High/High cell: TASK-006/007's Implementation=H pairs only with
Deployment=M (and a stated mitigation); TASK-015's Implementation=H pairs with Performance=H but
both have stated mitigations (concurrency + explicit escalation path + AC-015 as the final live
gate) rather than being silently accepted.

## 14. Verification Checklist
Before any task is marked complete, verify: compilation succeeds; `npm test` passes; no
unnecessary files modified beyond §6/§7/§8 of that task's own Task Package; no architecture
violations (only `McpConnectionService` imports the SDK; only `McpSecretTokenStore` calls
`context.secrets` for provider credentials; only the two adapters call `callTool`); no business
rules violated (BR-001..008).

## 15. Developer Constraints
See `ai-factory/gates/eps-standard.md#developer-constraints-apply-to-every-task-in-this-plan`.

## 16. Allowed Developer Decisions
See `ai-factory/gates/eps-standard.md#allowed-developer-decisions`. Additionally, per
TechnicalDesign.md §26: the exact pinned SDK version (TASK-002) and private helper
extraction/variable naming throughout.

## 17. Progress Tracking
Per-task status is tracked by the Developer role in `05-Implementation/notes.md`, keyed by Task
ID — not written back into this file.

## 18. Blocking Conditions
See `ai-factory/gates/eps-standard.md#blocking-conditions`. Specifically called out by this plan:
OTQ-1 materializing in TASK-007 (DCR rejected), no viable read-only existence-check tool for
`validateRepo`/`validateAuthor` in TASK-015, and any remaining reference found before a delete
task (TASK-014/018) — each is a stop-and-report condition, not something to resolve by guessing.

## 19. Implementation Review
After every completed task, the Developer verifies: the mapped FR ID is still satisfied, the
Technical Design is still followed, architecture is unchanged (single SDK import point, single
secrets-access point, adapters are the only `callTool` callers), no regression introduced, tests
updated. Recorded per-task in `05-Implementation/notes.md`.

## 20. Final Validation — Definition of Done
See `ai-factory/gates/eps-standard.md#definition-of-done-for-the-whole-plan`.
- [ ] All 19 tasks completed
- [ ] No skipped tasks
- [ ] No unresolved blockers (OTQ-1 either resolved live or escalated per TASK-007's note)
- [ ] No failed validation
- [ ] No failing tests
- [ ] Rollback documented per task (above)

## Definition of Done (base checklist)
See `ai-factory/gates/definition-of-done.md` for the base checklist; story-specific items:
- [ ] `@modelcontextprotocol/sdk` is imported only from `src/mcp/connectionService.ts`
- [ ] `context.secrets` is called for provider credentials only from
      `src/mcp/secretTokenStore.ts`
- [ ] No OAuth client secret, broker, or API-token fallback exists anywhere in the diff (BR-002,
      BR-003, BR-007)
- [ ] `src/jira/client.ts` and `src/github/client.ts` no longer exist; `octokit` is removed from
      `package.json`
- [ ] `AttentionEngine`, `LastSeenStore`, `RefreshScheduler`, `PullRequestCache`,
      `matchPullRequestForIssue`, and `src/github/errorClassifier.ts` are byte-for-byte unchanged
      from their pre-story state (diff them explicitly before declaring Done)
- [ ] Confirmed (or best-effort-and-logged) MCP tool names for both adapters are recorded in
      `DecisionLog.md`
- [ ] AC-015's live parity status is explicitly recorded (Pass, or "blocked per BR-008" with the
      specific gap named) before `07-CodeReview/CodeReview.md`'s verdict can be Pass

## Rollback Plan (plan-level)
Revert the entire story's commits back to the last commit before TASK-001 (the superseded
Basic-auth/octokit implementation was already working code, preserved in version control history
— this is not a feature-flagged rollback, it's a straight revert since there is no intermediate
shippable state between "old direct clients" and "new MCP adapters" that isn't also a full
revert). No migration/data to roll back (no database, and the only persisted state —
`devAssistant.jira.*` settings and the MCP/legacy secrets — degrades gracefully to "not
connected," requiring only re-authorization, not data recovery).

## Open Questions
- [ ] Carried forward from TechnicalDesign.md §28: OTQ-1 (Atlassian DCR acceptance), OTQ-2
      (GitHub MCP pagination parameter), OTQ-3 (SDK PKCE helper), OTQ-4 (SDK ESM/CJS shape) —
      assigned to TASK-002/006/007/009/015 above, each with a stated resolution path, not newly
      open at this stage.

## Approval Gate — Definition of Ready
See `ai-factory/gates/approval-gates.md#04-executionplan` and
`ai-factory/gates/eps-standard.md#definition-of-ready-for-development`.
- [x] Every task is atomic, with dependencies, files, acceptance criteria, validation steps, and
      rollback strategy defined
- [x] No implementation decisions remain (OTQ-1..4 are fact-finding-with-escalation-path items
      assigned to specific tasks, not decisions left open)
- [x] Risk Analysis has no unmitigated High/High risks (§13)
- [x] The Developer can implement every task without asking architectural questions

**Gate confirmed by user — 2026-10-31 (HumanAutoApprove; AI Quality Gate clean per
`ai-factory/gates/eps-standard.md#ai-quality-gate`; no unmitigated High/High risk; OTQ-1..4 carry
explicit resolution paths assigned to specific tasks)**
**Gate re-confirmed by user — 2026-10-31 (explicit approval to proceed; hand-off to Developer
role for stage 05-Implementation, starting at TASK-001)**
