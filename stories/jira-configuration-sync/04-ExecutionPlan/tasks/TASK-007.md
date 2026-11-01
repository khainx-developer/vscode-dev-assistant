# Implementation Task Package — TASK-007

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-007 · Feature: Jira Configuration & Task Sync (MCP migration) · Module: `src/mcp/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: High priority / High complexity / Medium-Large · Owner: Developer
  role

## 2. Objective
Create `src/mcp/connectionService.ts` exporting `McpConnectionService`, the sole module that
imports the MCP SDK and the sole owner of one `Client`+transport pair per configured server.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001, FR-005, FR-008, FR-011,
  FR-012, FR-013
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §5, §6, §14, §20; OTQ-1, OTQ-4
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-007

## 4. Dependencies
TASK-001, TASK-002, TASK-005, TASK-006. If any is not yet complete: **STOP** — do not start.

## 5. Scope
- Included: `McpConnectionService` with `connect`/`disconnect`/`isConnected`/`callTool`/
  `dispose`.
- Excluded: any Jira/GitHub-specific tool name or argument shape (TASK-009/015's job).
Never infer scope beyond what's listed here.

## 6. Files To Create
`src/mcp/connectionService.ts`, `src/mcp/connectionService.test.ts`

## 7. Files To Modify
`DecisionLog.md` (any live DCR-rejection finding this task's §9 step 3 requires — logging to
`DecisionLog.md` is always permitted per `ai-factory/prompts/implementation.md` step 10,
independent of a task's own file list; listed here explicitly to avoid any doubt)

## 8. Files Forbidden To Modify
Anything outside the two files above; must not import `src/jira/*` or `src/github/*`.

## 9. Implementation Instructions
- Responsibilities: own MCP transport/session lifecycle for both configured servers; nothing
  provider-specific.
- Required patterns: apply TASK-002's logged ESM/CJS finding — if the SDK is ESM-only, use the
  same dynamic-import workaround as `createOctokit` (`src/github/client.ts:17-20`); if it has a
  usable CJS build, a static `import` is fine.
- Required interfaces:
  ```ts
  export class McpConnectionService {
    constructor(private readonly context: vscode.ExtensionContext) {}

    async connect(serverId: McpServerId, opts?: { extraHeaders?: Record<string, string> }): Promise<void> { /* ... */ }
    disconnect(serverId: McpServerId): Promise<void> { /* ... */ }
    isConnected(serverId: McpServerId): boolean { /* ... */ }
    async callTool(serverId: McpServerId, name: string, args: Record<string, unknown>): Promise<unknown> { /* ... */ }
    async dispose(): Promise<void> { /* ... */ }
  }
  ```
- Algorithm (amended — see `DecisionLog.md`'s "TASK-006 Blocked resolved" entry: building an
  `OAuthClientProvider` now requires `await`ing a loopback-server start (TASK-006), which cannot
  happen inside a constructor, so provider construction moved from the constructor into
  `connect()`, lazily):
  1. Constructor: read `.mcp.json` (project root, same file already configured) and resolve each
     `McpServerId`'s endpoint URL — `'atlassian'` →
     `mcpServers['com.atlassian/atlassian-mcp-server'].url`, `'github'` →
     `mcpServers['io.github.github/github-mcp-server'].url`. Store these URLs only (e.g.
     `Map<McpServerId, string>`). Do **not** construct `McpSecretTokenStore` or
     `OAuthClientProvider` here — that happens lazily in `connect()` (step 3), since building the
     provider is `async`. No `Client`/transport is constructed here either.
  2. Private `inFlightConnect: Map<McpServerId, Promise<void>>` — guards concurrent `connect()`
     calls for the same server (TechnicalDesign.md §20). Also private
     `authSessions: Map<McpServerId, { store: McpSecretTokenStore; provider: OAuthClientProvider
     & { authorizationResult: Promise<{code:string}> } }>` — the lazily-built, per-server pair;
     populated the first time a server is connected, and evicted on `disconnect()` (step 4) so
     the *next* `connect()` for that server builds a genuinely fresh provider/loopback server
     (this is what actually satisfies TASK-004/006's "never reuse one `LoopbackRedirectServer`
     across two authorization attempts" — each eviction-then-rebuild cycle is one attempt).
  3. `connect(serverId, opts)`: if `isConnected(serverId)`, return immediately. If
     `inFlightConnect.has(serverId)`, `await` and return that existing promise instead of
     starting a second one. Otherwise, start a new in-flight promise that: (a) if
     `authSessions` has no entry for this server, construct a `McpSecretTokenStore` (TASK-003)
     and `await createOAuthClientProvider(serverId, store)` (TASK-006), and store the
     `{store, provider}` pair in `authSessions` — this is the point where a fresh
     `LoopbackRedirectServer` actually starts; (b) construct a `StreamableHTTPClientTransport`
     for that server's URL, passing `opts?.extraHeaders` as request headers and `provider` as the
     `authProvider` option (exact option name per the installed SDK — confirm, don't assume,
     same OTQ-3/OTQ-4 class of check already done in TASK-002/006); (c) construct a `Client` and
     call its connect method with that transport; (d) if that call throws the SDK's
     `UnauthorizedError` (the provider's `redirectToAuthorization` has already fired, opening the
     browser), `await provider.authorizationResult` to get `{code}`, `await
     transport.finishAuth(code)`, then retry the client's connect call once; (e) on success,
     store `{client, transport}` in a per-server `Map<McpServerId, {client, transport}>`. If the
     underlying DCR call is rejected (a 4xx before any browser opens — OTQ-1 materializing), do
     not retry or fall back to any other auth mechanism: let the error propagate through
     `McpErrorMapper.mapError(serverId, error)` as an `auth-expired` `McpToolError`, and record
     this specific failure's first live occurrence in `DecisionLog.md` (this is the single most
     important thing this task can discover — don't let it pass silently).
  4. `disconnect(serverId)`: close the transport if present, delete it from the connected-clients
     map, delete this server's entry from `authSessions` (so the next `connect()` rebuilds a
     fresh provider — see step 2), and call `secretTokenStore.clear()` for that server using the
     store from the evicted `authSessions` entry (if one existed).
  5. `isConnected(serverId)`: `connectedClients.has(serverId)` — no network call.
  6. `callTool(serverId, name, args)`: if not connected, `await connect(serverId)` first (no
     `extraHeaders` — callers that need the Bearer-header path, i.e. `GithubMcpAdapter`, call
     `connect(serverId, {extraHeaders})` themselves before calling `callTool`, so by the time
     `callTool` runs, the service is already connected the way the caller wants). Then
     `client.callTool({ name, arguments: args })`. Wrap the whole call in a `try/catch` that
     rethrows `McpErrorMapper.mapError(serverId, error)` instead of the raw error.
  7. `dispose()`: for each connected server, call `disconnect(serverId)`. Called from
     `extension.ts`'s `deactivate()` (wired in TASK-019, not here).

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/mcp/connectionService.ts`; `McpConnectionService` class; connection-layer transport manager, sole MCP SDK import point |
| Signature | 5 public methods listed above |
| Dependencies | `@modelcontextprotocol/sdk` (TASK-002), `McpSecretTokenStore` (TASK-003), `createOAuthClientProvider` (TASK-006), `McpErrorMapper` (TASK-005) |
| Algorithm | 7 numbered steps above, including the in-flight-connect guard, the lazy per-server `authSessions` build/evict cycle, and the OTQ-1 propagation path |
| Complexity budget | `connect()` is the largest method; if it exceeds ~40 lines, extract a private `buildTransport(serverId, opts)` helper |

**9.2 Data Access (remote MCP calls, not a database):**
| Field | Content |
|---|---|
| Purpose / caller | `callTool` answers "invoke one read-only MCP tool on one server"; called by `AtlassianMcpAdapter`/`GithubMcpAdapter` (TASK-009/015), never directly by a view controller |
| Endpoint | MCP `tools/call` JSON-RPC method, via the SDK's `Client.callTool` — not a REST path; the SDK's `StreamableHTTPClientTransport` owns the actual HTTP framing |
| Fetch mechanism | SDK-owned (`StreamableHTTPClientTransport` + `Client`), not a raw `fetch` |
| Round trips | One `tools/call` per `callTool` invocation; `connect()` (DCR + OAuth + `initialize`) happens at most once per server per session, amortized across every later `callTool` |
| Writes | N/A — every tool this story calls is read-only (BR-003); this service does not itself enforce which tools are read-only (that's each adapter's job to only call read-only tool names) |
| Skeleton | see the numbered algorithm above — this is the compilable shape to implement |

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| ESM-only dynamic import pattern | `createOctokit` (`src/github/client.ts:17-20`) | Reuse the exact pattern if TASK-002 found the SDK is ESM-only |
| Error normalization | `McpErrorMapper.mapError` (TASK-005, `src/mcp/errorMapper.ts`) | Call directly, do not re-classify errors here |
| Per-server OAuth provider | `createOAuthClientProvider` (TASK-006, `src/mcp/oauthClientProvider.ts`) | Construct lazily, one per server, inside `connect()` (not the constructor — building it requires `await`); cache in `authSessions` until `disconnect()` evicts it |

**9.4 Forbidden shapes:**
- Must be the only module in the codebase that imports `@modelcontextprotocol/sdk`.
- Must never fall back to a broker, client secret, or API token if DCR/OAuth fails (BR-002,
  BR-003).
- Must never let two concurrent `connect()` calls for the same server open two browser windows.
- Must never construct `McpSecretTokenStore`/`OAuthClientProvider` in the constructor — only
  `connect()` may do so (the constructor cannot `await`).
- Must never skip evicting a server's `authSessions` entry in `disconnect()` — leaving it in
  place would let the next `connect()` reuse an already-closed `LoopbackRedirectServer`,
  violating TASK-006's fresh-provider-per-attempt rule.

**9.5 Test cases:**
- `callTool_onUnconnectedServer_connectsFirst`
- `connect_twoConcurrentCallsForSameServer_opensOnlyOneBrowserWindow` (assert the OAuth
  provider's `redirectToAuthorization`-equivalent is invoked exactly once for two simultaneous
  `connect()` callers)
- `callTool_thrownError_isMappedThroughMcpErrorMapper`
- `disconnect_clearsStoredCredentials`
- `isConnected_reflectsState_withoutNetworkCall`
- `connect_dcrRejected_propagatesAuthExpired_withoutFallback` (simulate a DCR rejection via the
  injected SDK test double; assert no broker/secret code path is taken)
- `disconnect_thenConnect_buildsAFreshOAuthProvider_notTheEvictedOne` (assert
  `createOAuthClientProvider` (or its test double) is invoked again after `disconnect()`, not
  reused from the first `connect()`)

Mock the SDK's `Client`/transport and `createOAuthClientProvider` at the constructor/connect
boundary (inject a test double for the SDK client factory and the provider factory) rather than
hitting a real network endpoint or starting a real loopback server.

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
BR-002, BR-003 — no broker/secret/token fallback, read-only tools only (enforced by adapters,
but this service must never undermine it by silently retrying with a different auth mechanism).

## 11. Technical Constraints
Sole MCP SDK import point; sole module allowed to read `.mcp.json`.

## 12. Security Constraints
Never log a token, header, or PKCE value; only `serverId`, tool name, and `McpToolError.category`.

## 13. Performance Constraints
`connect()` must be shared across concurrent callers for the same server (§9.4); `callTool` must
not reconnect on every call once already connected.

## 14. Acceptance Criteria
All 9.5 test cases pass.

## 15. Validation Steps
Build; `npm test`.

## 16. Expected Output
`McpConnectionService` class as specified, with passing tests, compiling against TASK-002's
chosen import style.

## 17. Rollback
Delete both files.

## 18. Common Mistakes
- Do not add a retry-with-different-auth path when DCR is rejected — that is explicitly
  forbidden (BR-002) and the correct behavior is to propagate the failure, not paper over it.
- Do not let `callTool` silently reconnect on every invocation — check `isConnected` first.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden), plus: naming of any extracted private helper (§9.1).

## 20. Completion Checklist
standard (ITPS Definition of Done), plus: any live DCR-rejection finding recorded in
`DecisionLog.md` per §9 step 3.
