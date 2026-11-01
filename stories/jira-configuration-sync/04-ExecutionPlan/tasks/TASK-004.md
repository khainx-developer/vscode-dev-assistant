# Implementation Task Package — TASK-004

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-004 · Feature: Jira Configuration & Task Sync (MCP migration) · Module: `src/mcp/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: High priority / Medium complexity / Small-Medium · Owner: Developer
  role

## 2. Objective
Create `src/mcp/loopbackRedirect.ts` implementing `LoopbackRedirectServer`, a one-shot local HTTP
server that receives the OAuth browser redirect on `127.0.0.1` without using a custom URI scheme.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001; VR-002
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §6, and the "Grounded external facts"
  note (why a loopback server, not a `vscode://` URI handler)
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-004

## 4. Dependencies
TASK-001 (uses `McpToolError`).

## 5. Scope
- Included: `LoopbackRedirectServer` with `start`/`stop`.
- Excluded: anything about DCR, PKCE, or opening the browser (TASK-006).
Never infer scope beyond what's listed here.

## 6. Files To Create
`src/mcp/loopbackRedirect.ts`, `src/mcp/loopbackRedirect.test.ts`

## 7. Files To Modify
none

## 8. Files Forbidden To Modify
Anything outside the two files above.

## 9. Implementation Instructions
- Responsibilities: receive exactly one OAuth redirect request; nothing else.
- Required patterns: Node's built-in `http` module only — no new dependency.
- Required interfaces (amended — see `DecisionLog.md`'s "TASK-004 Blocked resolved" entry: the
  original sync-returning signature is not implementable in Node, since `server.address()` is
  `null` until the `'listening'` event fires on a later tick, confirmed empirically by the
  Developer):
  ```ts
  export class LoopbackRedirectServer {
    start(expectedState: string, timeoutMs?: number): Promise<{ redirectUri: string; result: Promise<{ code: string }> }> { /* ... */ }
    stop(): void { /* ... */ }
  }
  ```
- Algorithm (`start`, now `async`):
  1. Create an `http.Server` via `http.createServer((req, res) => { ... })`.
  2. `server.listen(0, '127.0.0.1')`, and `await` the `'listening'` event (e.g. wrap in `new
     Promise<void>(resolve => server.once('listening', resolve))`) before reading the assigned
     port from `(server.address() as net.AddressInfo).port`; `redirectUri =
     \`http://127.0.0.1:${port}/callback\``.
  3. Build `result` as a `new Promise<{code:string}>((resolve, reject) => { ... })`, with the
     request handler and a 120000ms `setTimeout` both able to settle it exactly once (guard with
     a `settled` boolean so the second attempt is a no-op).
  4. Request handler: parse the URL's query string (`new URL(req.url!, redirectUri)`). If
     `path !== '/callback'`, respond 404 and return (don't settle the promise — only `/callback`
     counts as "the" callback). If `error` is present, respond 200 with a short HTML page, call
     `stop()`, and `reject({ serverId: undefined, category: 'auth-expired', detail:
     searchParams.get('error_description') ?? searchParams.get('error')! } satisfies
     Omit<McpToolError,'serverId'> & {serverId?: undefined})` — actually: since this module has
     no `serverId` context (it's server-agnostic), reject with a plain `{ category: 'auth-expired'
     | 'invalid-entry' | 'network'; detail: string }` object (the caller, TASK-006's provider,
     already knows its own `serverId` and can attach it when re-throwing — don't try to inject
     `serverId` here). If `state !== expectedState`, respond 400, call `stop()`, reject with
     `{ category: 'invalid-entry', detail: 'OAuth state mismatch' }`. Otherwise (success):
     respond 200 with "You can close this window and return to VS Code.", call `stop()`, resolve
     with `{ code: searchParams.get('code')! }`.
  5. Timeout handler (120000ms): if not yet settled, call `stop()` and reject with
     `{ category: 'network', detail: 'OAuth callback timed out' }`.
  6. `stop()`: idempotent — `server.close()` if still listening; clear the timeout handle.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/mcp/loopbackRedirect.ts`; `LoopbackRedirectServer` class; connection-layer transport helper |
| Signature | `start(expectedState: string, timeoutMs?: number): Promise<{ redirectUri: string; result: Promise<{code:string}> }>` (amended — see §9 note); `stop(): void` |
| Dependencies | Node `http`, `net` (for `AddressInfo` typing) — no `vscode` dependency, this class is pure Node |
| Algorithm | 6 numbered steps above, including the error/state-mismatch/timeout paths |
| Complexity budget | `start`'s request handler stays under ~30 lines by extracting a private `respondAndSettle(status, body, settle)` helper if needed |

**9.2 Data Access:** N/A — local HTTP server, not a database or remote API call.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| One-shot local server for an OAuth-style callback | none exists in this codebase (the existing GitHub auth, `src/github/auth.ts`, uses VS Code's built-in `vscode.authentication` provider and never runs its own server) | Create new — no existing symbol to reuse |

**9.4 Forbidden shapes:**
- Must not bind to `0.0.0.0` or any non-loopback address.
- Must not leave the server listening after `result` settles or after `stop()` is called.
- Must not respond to a second request on the same server instance (only the first `/callback`
  request is handled; anything after that — even a legitimate-looking retry — is ignored because
  the server has already closed).

**9.5 Test cases:**
- `start_successfulCallback_resolvesWithCode`
- `start_stateMismatch_rejectsInvalidEntry`
- `start_errorQueryParam_rejectsAuthExpired`
- `start_timeout_rejectsNetwork` (inject a short timeout override for the test — do not make the
  real test wait 120 real seconds; expose a second, test-only parameter or a settable constant
  for the timeout duration)
- `start_afterSettling_serverIsClosed` (assert a further HTTP request to the same port fails to
  connect, for each of the above three outcomes)

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
VR-002 — an MCP connection is active only after successful browser authorization and valid
callback state.

## 11. Technical Constraints
Must bind only to `127.0.0.1`; must self-close after one request or 120s.

## 12. Security Constraints
Never log the `code` or `state` query parameter values beyond what's needed to compare `state`
against `expectedState`.

## 13. Performance Constraints
standard — this is a short-lived, single-request server; no load/concurrency concern.

## 14. Acceptance Criteria
All 9.5 test cases pass.

## 15. Validation Steps
Build; `npm test` (real ephemeral loopback socket — no live MCP server needed).

## 16. Expected Output
`LoopbackRedirectServer` class as specified, with passing tests, no port/socket leak across
tests.

## 17. Rollback
Delete both files.

## 18. Common Mistakes
- Do not make the timeout test actually wait 120 seconds — expose a way to shorten it for tests.
- Do not forget to close the server on the error/state-mismatch paths, not just the success path.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done), plus: confirm no lingering open socket after the test suite
finishes (e.g. via `--detectOpenHandles`-equivalent or manual `server.listening` assertion).
