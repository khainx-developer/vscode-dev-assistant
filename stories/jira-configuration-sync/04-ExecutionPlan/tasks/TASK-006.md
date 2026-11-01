# Implementation Task Package — TASK-006

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-006 · Feature: Jira Configuration & Task Sync (MCP migration) · Module: `src/mcp/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: High priority / High complexity / Medium · Owner: Developer role

## 2. Objective
Create `src/mcp/oauthClientProvider.ts` exporting `createOAuthClientProvider(serverId, store)`,
implementing the installed MCP SDK's `OAuthClientProvider` contract by wiring dynamic client
registration (DCR), PKCE, and the loopback redirect (TASK-004) together.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001, FR-013; BR-002
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §6, §22; OTQ-3
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-006

## 4. Dependencies
TASK-002 (SDK installed; ESM/CJS finding), TASK-003 (`McpSecretTokenStore`), TASK-004
(`LoopbackRedirectServer`). If any of these is not yet complete: **STOP** — do not start.

## 5. Scope
- Included: one factory function producing an `OAuthClientProvider`-shaped object for one server.
- Excluded: the `Client`/transport construction itself (TASK-007); any Jira/GitHub domain logic.
Never infer scope beyond what's listed here.

## 6. Files To Create
`src/mcp/oauthClientProvider.ts`, `src/mcp/oauthClientProvider.test.ts`

## 7. Files To Modify
`DecisionLog.md` (the OTQ-3 finding this task's §14 requires — logging to `DecisionLog.md` is
always permitted per `ai-factory/prompts/implementation.md` step 10, independent of a task's own
file list; listed here explicitly to avoid any doubt)

## 8. Files Forbidden To Modify
Anything outside the two files above.

## 9. Implementation Instructions
- **OTQ-3 — resolved** (see `DecisionLog.md`'s "TASK-006 Blocked resolved" entry; confirmed by
  reading `node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.d.ts` and
  `.../client/streamableHttp.d.ts` directly — do not re-derive this, just implement it):
  - `OAuthClientProvider.redirectUrl` and `.clientMetadata` are **synchronous getters**
    (`get redirectUrl()`, `get clientMetadata()`), not methods.
  - PKCE is **SDK-owned**: the SDK's `startAuthorization()` generates both the code verifier and
    the challenge itself. This provider's `codeVerifier()`/`saveCodeVerifier()` only ever persist
    what the SDK gives them — never generate a verifier by hand.
  - This provider does **not** drive the token exchange and does not itself resolve/return the
    authorization code. `StreamableHTTPClientTransport` calls `provider.redirectToAuthorization`
    internally when auth is needed, throws `UnauthorizedError` from `connect`/`start`, and the
    *caller* (TASK-007) must separately call `transport.finishAuth(authorizationCode)` once the
    code arrives from the loopback server. This provider's only job regarding the code is to
    expose the pending result so TASK-007 can await it (see the amended Required Interfaces
    below) — never to parse, validate, or act on the code itself.
- Responsibilities: implement every required/optional method of `OAuthClientProvider` that this
  story needs (listed below), plus the one additional `authorizationResult` property needed to
  hand the awaited code to TASK-007.
- Required patterns: no client secret anywhere; `vscode.env.openExternal` for the browser step,
  never a webview.
- Required interfaces (amended — see `DecisionLog.md`'s "TASK-006 Blocked resolved" entry: the
  original synchronous factory could not work, because `redirectUrl`/`clientMetadata` being sync
  getters means the loopback server's port must already be known before this object is built,
  which requires awaiting TASK-004's `start()` first):
  ```ts
  export async function createOAuthClientProvider(
    serverId: McpServerId,
    store: McpSecretTokenStore,
  ): Promise<OAuthClientProvider & { authorizationResult: Promise<{ code: string }> }> { /* ... */ }
  ```
  Each call creates exactly one fresh `LoopbackRedirectServer` and returns exactly one provider
  for exactly one authorization attempt — this factory itself enforces "never reuse one
  `LoopbackRedirectServer` across two attempts" simply by never being called twice for the same
  attempt. TASK-007 is responsible for calling this factory again (a fresh call, fresh server) on
  a later re-authorization rather than reusing an old returned object — see TASK-007's amended
  §9 step 1/4.
- Algorithm:
  1. Generate `state` via `crypto.randomBytes(16).toString('hex')`. Create one
     `LoopbackRedirectServer` (TASK-004) and `await start(state)` to obtain `{ redirectUri,
     result }` *before* building the returned object, so the getters below can be synchronous.
  2. `get redirectUrl()`: return the `redirectUri` from step 1.
  3. `get clientMetadata()`: return `{ redirect_uris: [redirectUri],
     token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'],
     response_types: ['code'] }` — never include a `client_secret` field.
  4. `clientInformation()` / `saveClientInformation()`: delegate directly to
     `store.getClientInformation()` / `store.saveClientInformation()`.
  5. `tokens()` / `saveTokens()`: delegate directly to `store.getTokens()` /
     `store.saveTokens()`.
  6. `codeVerifier()` / `saveCodeVerifier()`: delegate directly to `store.getCodeVerifier()` /
     `store.saveCodeVerifier()` — no hand-generated verifier (PKCE is SDK-owned, per the OTQ-3
     note above).
  7. `redirectToAuthorization(authorizationUrl: URL)`: `await
     vscode.env.openExternal(vscode.Uri.parse(authorizationUrl.toString()))` — nothing else; do
     not parse or follow the URL.
  8. Attach `authorizationResult: result` (the `Promise<{code:string}>` from step 1) as a plain
     extra property on the returned object, alongside the `OAuthClientProvider` methods. TASK-007
     awaits this itself and passes the resulting code to `transport.finishAuth(code)` — this
     module never awaits it.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/mcp/oauthClientProvider.ts`; factory function `createOAuthClientProvider`; connection-layer OAuth glue |
| Signature | `(serverId: McpServerId, store: McpSecretTokenStore) => Promise<OAuthClientProvider & { authorizationResult: Promise<{code:string}> }>` (amended — see §9 note) |
| Dependencies | `McpSecretTokenStore` (TASK-003), `LoopbackRedirectServer` (TASK-004), `vscode.env`, Node `crypto` |
| Algorithm | 8 numbered steps above |
| Complexity budget | if the full provider object literal exceeds ~40 lines, extract a private `generatePkce()` helper and a private `exchangeCodeForTokens()` helper (name them exactly this if extracted, for consistency with TASK-007's expectations) |

**9.2 Data Access:** N/A — no database; the "remote call" here (the authorization-code/token
exchange) is owned by the MCP SDK itself once this provider supplies the pieces above, not a
query this module writes directly.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| Secret persistence | `McpSecretTokenStore` (TASK-003, `src/mcp/secretTokenStore.ts`) | Delegate every persistence method directly, no re-implementation |
| Redirect receiver | `LoopbackRedirectServer` (TASK-004, `src/mcp/loopbackRedirect.ts`) | Call `start()`/use its `result` promise |
| OAuth provider interface shape | `@modelcontextprotocol/sdk`'s own `OAuthClientProvider` type (installed by TASK-002) | Read it directly from `node_modules/@modelcontextprotocol/sdk` — do not guess its method names |

**9.4 Forbidden shapes:**
- Never include a `client_secret` field in `clientMetadata()`.
- Never open a webview for the authorization step — only `vscode.env.openExternal`.
- Never reuse one `LoopbackRedirectServer` instance across two separate authorization attempts
  (satisfied structurally: each call to this factory makes a new server; never cache/return the
  same provider object across two attempts — that is TASK-007's responsibility, not this one's).
- Never generate the PKCE verifier/challenge by hand — SDK-owned, per the OTQ-3 note.

**9.5 Test cases** (factory is now `async` — `await createOAuthClientProvider(...)` in each test):
- `clientMetadata_neverIncludesClientSecret`
- `clientInformation_saveClientInformation_roundTripsThroughStore`
- `tokens_saveTokens_roundTripsThroughStore`
- `codeVerifier_saveCodeVerifier_roundTripsThroughStore`
- `redirectToAuthorization_callsOpenExternal_withExactUrl`
- `redirectToAuthorization_doesNotItselfParseOrFollowTheUrl`
- `redirectUrl_returnsLoopbackServersUri_synchronously` (new — asserts the getter needs no
  `await` once the factory's promise has resolved)

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
BR-002 — no client secret; FR-001/FR-013 — browser-based authorization, extension owns the
session.

## 11. Technical Constraints
Must satisfy the installed SDK's actual `OAuthClientProvider` type (confirm, don't assume).

## 12. Security Constraints
No client secret anywhere in this file; PKCE verifier only ever leaves this module into
`McpSecretTokenStore`, never into a log line.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
All 9.5 test cases pass. (OTQ-3 is already resolved and logged — see §9's note and
`DecisionLog.md`'s "TASK-006 Blocked resolved" entry; no further logging required for OTQ-3
itself, just implement per the resolved shape.)

## 15. Validation Steps
Build; `npm test`.

## 16. Expected Output
`createOAuthClientProvider` factory as specified, satisfying the installed SDK's interface, with
passing tests.

## 17. Rollback
Delete both files.

## 18. Common Mistakes
- Do not generate PKCE by hand — OTQ-3 confirmed the SDK does it; `codeVerifier()`/
  `saveCodeVerifier()` only persist what the SDK supplies.
- Do not make `redirectUrl`/`clientMetadata` methods instead of getters — the installed SDK
  declares them as `get` accessors (OTQ-3).
- Do not await `authorizationResult` inside this module — expose it and let TASK-007 await it.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden), plus: naming of any extracted private helper (§9.1).

## 20. Completion Checklist
standard (ITPS Definition of Done). OTQ-3 is already resolved and logged (§9/§14) — nothing
further to log for it.
