# Implementation Notes

## TASK-001 — Completed
- Preflight: Dependencies are none; `GitHubFailureCategory` and `JiraFailureCategory` exist and match the Reuse Map; §9.1-§9.5 are present.
- Checklist: none applies per TASK-001; the active TypeScript glob is an extension-only match, and this project has no React/Next.js code.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Self-review: the file matches the specified type skeleton, exports exactly the three required declarations, and introduces no forbidden shapes or duplicate Reuse Map entries.
- Validation: `npm.cmd run compile` passed.

## TASK-002 — Completed
- Re-attempted after the Planner added `DecisionLog.md` to §7 Files To Modify (see
  `DecisionLog.md`'s "TASK-002 Blocked resolved" entry); no longer blocked.
- Preflight: Dependencies are none; the cited `createOctokit` dynamic-import pattern and comment
  exist; §9.1-§9.5 are present.
- Checklist: none applies, per the corrected registry (`ai-factory/checklists/registry.md`).
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: `npm install --save-exact @modelcontextprotocol/sdk@1.32.2` (latest stable at
  implementation time, per §19 Developer Freedom). Only `dependencies` in `package.json` changed
  plus the corresponding `package-lock.json` update — no other `dependencies`/`devDependencies`
  entry touched.
- ESM/CJS finding: checked the installed package's own `package.json` (`exports` map) — it has a
  `"require"` condition pointing at a real `dist/cjs` build alongside the ESM one, so it is a
  dual-format package, not ESM-only like `octokit`. No dynamic-import workaround needed; logged
  to `DecisionLog.md` for TASK-006/007 to rely on.
- Self-review: only `package.json`/`package-lock.json`/`DecisionLog.md` touched; no code written
  that imports the SDK (out of scope, reserved for TASK-006/007); no other dependency entry
  changed; exact pin used (no `^`/`~`/`latest`).
- Validation: `npm install` completed with no errors; `npm run compile` passed.

## TASK-003 — Completed
- Preflight: Dependencies are none; `McpServerId` (`src/mcp/types.ts`, from TASK-001) and the
  `JiraConnectionStore` store-class pattern (`src/jira/connectionStore.ts:9-13`) exist and match
  the Reuse Map; §9.1-§9.5 are present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: created `src/mcp/secretTokenStore.ts` (`McpSecretTokenStore`) with the exact
  7-method interface from §9 — three namespaced `devAssistant.mcp.${serverId}.*` secret keys
  (clientInformation/tokens/codeVerifier), `get*` methods JSON-parsing after an unset-check,
  `save*` methods JSON-stringifying, `clear()` deleting all three keys via `Promise.all`. No
  coupling to the MCP SDK's `OAuthClientProvider` shape (reserved for TASK-006). Only the two
  files in §6 were created; nothing else touched.
- Tests: created `src/mcp/secretTokenStore.test.ts` with all 7 §9.5 test cases, using an
  in-memory `Map`-backed fake for `context.secrets` (mirrors the `makeContext()` stub pattern in
  `src/github/viewController.test.ts`).
- Self-review: only `src/mcp/secretTokenStore.ts`/`secretTokenStore.test.ts` created; no secret
  value appears in any assertion failure path beyond what the test framework itself prints; no
  forbidden coupling introduced.
- Validation: `npm run compile` passed. `npm test` — note `out/` is tsc's emit output used only
  by `@vscode/test-cli` (the `compile` script runs `tsc --noEmit` and does not refresh it), so a
  plain `npx tsc -p ./` was run first to emit the new files into `out/mcp/` before `npm test`;
  all 7 new `McpSecretTokenStore` tests passed, 128 passing overall (up from 121), no regressions.

## TASK-004 — Completed
- Initial attempt Blocked: §9's original Required Interfaces specified a synchronous
  `start(expectedState: string): { redirectUri: string; result: Promise<{code:string}> }`, built
  from a port read via `server.address()` right after `server.listen(0, '127.0.0.1')`. Verified
  empirically (both `http.createServer` and raw `net.createServer`) that `server.address()` is
  `null` immediately after calling `.listen(0, host)` and only becomes populated once the
  `'listening'` event fires on a later tick — reading `.port` synchronously throws. No
  synchronous Node API exists to learn an OS-assigned ephemeral port without a new dependency
  (forbidden by §9), so the literal interface could not be implemented. Stopped rather than
  redesigning the public contract unilaterally (`cis-standard.md` "Modify public contracts
  without approval").
- Resolved by the Planner (see `DecisionLog.md`'s "TASK-004 Blocked resolved" entry): §9/§9.1
  amended to `start(expectedState: string, timeoutMs?: number): Promise<{ redirectUri: string;
  result: Promise<{code:string}> }>`, awaiting the server's `'listening'` event internally before
  resolving. TASK-006 amended to `await start(state)` accordingly.
- Re-attempted against the amended package. Preflight: Dependency TASK-001 (`McpToolError`,
  `src/mcp/types.ts`) is Completed; §9.1-§9.5 are present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: created `src/mcp/loopbackRedirect.ts` (`LoopbackRedirectServer`) — binds only
  to `127.0.0.1` on an OS-assigned port, awaits `'listening'` before returning `redirectUri`,
  handles the success/`error`-query/state-mismatch/timeout paths per §9's algorithm, each
  settling `result` exactly once via a `settled` guard and always calling `stop()` first. No DCR,
  PKCE, or browser-opening logic (reserved for TASK-006). Only the two files in §6 were created.
- Tests: created `src/mcp/loopbackRedirect.test.ts` with all 5 §9.5 cases, using real ephemeral
  loopback sockets (no live MCP server) and a short `timeoutMs` override for the timeout case
  (no 120s real wait); `start_afterSettling_serverIsClosed` asserts a further request to each of
  the three settled servers' ports fails to connect.
- Self-review: only `src/mcp/loopbackRedirect.ts`/`loopbackRedirect.test.ts` created; never binds
  to `0.0.0.0`; never logs the `code`/`state` values; no secret-value leakage in assertions.
- Validation: `npm run compile` passed. Ran `npx tsc -p ./` (plain emit) before `npm test` so
  `out/` picks up the new files — same `compile`-vs-`out/` emit note as TASK-003. All 5 new
  `LoopbackRedirectServer` tests passed; 133 passing overall (up from 128), no regressions; no
  lingering open sockets (each case explicitly asserts the server's port is unreachable after
  settling).

## TASK-005 — Completed
- Preflight: Dependency TASK-001 (`McpServerId`/`McpToolError`, `src/mcp/types.ts`) is Completed;
  `JiraErrorClassifier.classify` (`src/jira/errorClassifier.ts:3-28`) exists and matches the
  Reuse Map; §9.1-§9.5 are present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: created `src/mcp/errorMapper.ts` (`McpErrorMapper.mapError`), mirroring
  `JiraErrorClassifier.classify`'s status-inspection structure: numeric `status` checked first
  (401→auth-expired, 429→rate-limited with `resetAt` computed from a `retryAfter` seconds field
  or passed through directly if already present, 400/404→invalid-entry, else→network); else a
  JSON-RPC `{code, message}` shape (code `-32001` or an unauthorized/unauthenticated message
  text → auth-expired, else invalid-entry); else network with the error's own message. Always
  sets `serverId`; never copies a header/token value into `detail`. Only the two files in §6
  were created; no change to `src/jira/errorClassifier.ts` (TASK-012/015/017 call through this
  mapper rather than duplicating it, per §18).
- Tests: created `src/mcp/errorMapper.test.ts` with all 10 §9.5 cases.
- Self-review: pure function, no I/O; no raw header/token value ever placed in `detail`.
- Validation: `npm run compile` passed. Ran `npx tsc -p ./` before `npm test` (same `out/` emit
  note as TASK-003/004). All 10 new `McpErrorMapper` tests passed; 143 passing overall (up from
  133), no regressions.

## TASK-006 — Completed
- Preflight: Dependencies TASK-002/003/004 are Completed; §9.1-§9.5 are present.
- OTQ-3 resolved by reading the installed SDK's actual types
  (`node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.d.ts`,
  `.../client/streamableHttp.d.ts`): `OAuthClientProvider.redirectUrl` and `.clientMetadata` are
  **synchronous getters**, not methods. PKCE is SDK-owned — `startAuthorization()` generates both
  the verifier and the challenge itself; the provider's `codeVerifier()`/`saveCodeVerifier()`
  only persist what the SDK gives them. The provider does not drive the exchange or await the
  authorization code itself — `StreamableHTTPClientTransport` calls
  `provider.redirectToAuthorization` internally, and the caller must separately call
  `transport.finishAuth(authorizationCode)` once the code arrives (from this story's loopback
  server). This resolves §9 step 7: "await the result promise and return/resolve it however the
  SDK expects" does not apply as written — there is nothing this provider returns/resolves; the
  code only needs to reach the *caller* (TASK-007), not this module.
- Scope conflict found while implementing step 1: `redirectUrl`/`clientMetadata` being
  synchronous getters means the loopback server's port must be known *before* the provider
  object is built and handed to the transport. TASK-004's `LoopbackRedirectServer.start()` is
  `async` (per its own Blocked-and-resolved fix), so building a provider with a working
  `redirectUrl` getter requires `await`ing `start()` first — which forces
  `createOAuthClientProvider` itself to become `async` (`Promise<OAuthClientProvider & {...}>`),
  contradicting §9's synchronous Required Interface
  `(serverId, store) => OAuthClientProvider`.
- Unlike TASK-004's fix (a contained, local signature change), this one does not stay contained:
  TASK-007's own spec says to construct one `OAuthClientProvider` per server "in the constructor"
  of `McpConnectionService` — a constructor cannot `await`. Making TASK-006's factory async would
  silently force a redesign of TASK-007's construction-timing (eager-in-constructor →
  lazy/async-initialized), which is explicitly out of this task's scope ("Excluded: the
  Client/transport construction itself (TASK-007)") and not something the Developer may decide
  unilaterally (`cis-standard.md`: "Modify public contracts without approval", "Redesign
  architecture").
- No implementation kept — no files were created for this task (the OTQ-3 research above did not
  require writing code).
- Recommended fix for the Planner: a structural decision spanning TASK-004/006/007, not a
  local patch — e.g. (a) have `McpConnectionService` lazily create the `McpSecretTokenStore` +
  `OAuthClientProvider` pair for a server only when `connect()` is first called for it (already
  async), instead of eagerly in the constructor; or (b) give `McpConnectionService` an explicit
  `async initialize()` step. Either way, TASK-006's Required Interface needs to become async and
  TASK-007's §9 step 1 needs to stop saying "in the constructor."
- No dependency or file changes kept. Planner must resolve the TASK-004→006→007 chain before
  re-attempting TASK-006.
- **Resolved by the Planner** (see `DecisionLog.md`'s "TASK-006 Blocked resolved" entry):
  TASK-006 amended to an async factory returning `OAuthClientProvider & { authorizationResult }`;
  TASK-007 amended to build `McpSecretTokenStore`/`OAuthClientProvider` lazily inside `connect()`
  (via a new `authSessions` map), evicted on `disconnect()`, instead of eagerly in the
  constructor. Ready for the Developer role to re-attempt TASK-006 against the amended package.
- Re-attempted against the amended package — Completed.
- Preflight: Dependencies TASK-002/003/004 Completed; §9.1-§9.5 present; the amended §9 already
  inlines the OTQ-3 finding (confirmed by reading
  `node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.d.ts`/`shared/auth.d.ts` while
  implementing: `OAuthClientProvider.redirectUrl`/`.clientMetadata` are plain object getters, not
  class accessors — satisfied here via getter properties on a returned object literal, which
  TypeScript treats as structurally equivalent; `OAuthClientInformationMixed`/`OAuthClientMetadata`/
  `OAuthTokens` types live in the SDK's `shared/auth.js` module, not re-exported from
  `client/auth.js`, so they're imported from there directly).
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: created `src/mcp/oauthClientProvider.ts` (`createOAuthClientProvider`) per the
  amended 8-step algorithm — generates `state`, creates and `await`s one
  `LoopbackRedirectServer.start(state)` before building the returned object so
  `redirectUrl`/`clientMetadata` are synchronous getters; `clientInformation`/`saveClientInformation`,
  `tokens`/`saveTokens`, `codeVerifier`/`saveCodeVerifier` all delegate directly to the injected
  `McpSecretTokenStore` (no hand-generated PKCE); `redirectToAuthorization` only calls
  `vscode.env.openExternal`; `authorizationResult` exposes the loopback server's `result` promise
  as a plain extra property, unawaited by this module. The `serverId` parameter is currently
  unused (nothing here is server-specific beyond what `store` already namespaces) — kept in the
  signature per §9's Required Interface and prefixed `_serverId` to satisfy
  `noUnusedParameters`. Only the two files in §6 were created; no `DecisionLog.md` write needed
  (OTQ-3 was already logged by the Planner).
- Tests: created `src/mcp/oauthClientProvider.test.ts` with all 7 §9.5 cases (including the new
  `redirectUrl_returnsLoopbackServersUri_synchronously`), stubbing `vscode.env.openExternal` and
  a fake `context.secrets`; each test sends a cleanup GET to its own provider's `redirectUrl` so
  the loopback server it started closes before the test ends.
- Self-review: no `client_secret` field anywhere; no webview; PKCE verifier only ever flows into
  `McpSecretTokenStore`; no unrelated files touched.
- Validation: `npm run compile` passed. Ran `npx tsc -p ./` before `npm test` (same `out/` emit
  note as TASK-003/004/005). All 7 new `createOAuthClientProvider` tests passed; 150 passing
  overall (up from 143), no regressions.

## TASK-007 — Completed
- Preflight: Dependencies TASK-001/002/005/006 Completed; §9.1-§9.5 present, already amended for
  the lazy `authSessions` design (see `DecisionLog.md`'s "TASK-006 Blocked resolved" entry).
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Resolved from the installed SDK's real types while implementing (not re-guessed): `Client`'s
  constructor is `new Client(clientInfo, options?)` with `.connect(transport)`/`.callTool(params)`
  (`client/index.d.ts`); `StreamableHTTPClientTransport`'s constructor takes
  `(url: URL, opts?: {authProvider, requestInit, ...})` — extra headers go through
  `requestInit.headers`, not a dedicated option — with `.finishAuth(code)`/`.close()`
  (`client/streamableHttp.d.ts`); `UnauthorizedError` is exported from `client/auth.js`.
- Implementation: created `src/mcp/connectionService.ts` (`McpConnectionService`) per the
  amended algorithm — constructor only resolves `.mcp.json` server URLs (read from
  `context.extensionPath`, per Technical Design §16's "read once per construction" note); a
  private `authSessions` map lazily builds `{store, provider}` per server inside `connect()`
  and is evicted in `disconnect()`, so a disconnect-then-reconnect cycle builds a genuinely
  fresh `OAuthClientProvider`/loopback server (TASK-004/006's fresh-per-attempt rule); the
  in-flight-connect guard (`inFlightConnect`) ensures two concurrent `connect()` calls for the
  same server share one attempt, so the OAuth provider's `redirectToAuthorization` fires at
  most once; on `UnauthorizedError` from the SDK's `client.connect()`, awaits
  `provider.authorizationResult` and calls `transport.finishAuth(code)` before retrying once;
  every error (including a rejected DCR) is rethrown through `McpErrorMapper.mapError` with no
  broker/secret/token fallback. Re-exported `UnauthorizedError` from this module so the test file
  doesn't need a second, separate import path into the SDK (keeping this the sole module with a
  direct SDK import).
  - **Deviation from the literal Required Interfaces, within Developer Freedom**: added two
    optional trailing constructor parameters (`createClientPair`, `createProvider`), each
    defaulting to the real implementation, so tests can inject doubles — §9.5 explicitly asks
    for "inject a test double for the SDK client factory and the provider factory" at the
    constructor boundary, and the single-parameter constructor shown in §9's code block can't
    provide that seam. This mirrors the codebase's existing precedent for testable constructors
    (`GitHubViewController`'s trailing `pullRequestCache: PullRequestCache = new
    PullRequestCache()` parameter, `src/github/viewController.ts:39`): every real call site
    (`new McpConnectionService(context)`, used by TASK-019's wiring) is unaffected, since both
    new parameters are optional with production defaults. The five required public methods
    (`connect`/`disconnect`/`isConnected`/`callTool`/`dispose`) keep exactly their specified
    signatures.
  - No live DCR rejection was observed (TASK-007 was implemented and tested against injected test
    doubles, not a real Atlassian/GitHub MCP endpoint) — §9 step 3's "record this specific
    failure's first live occurrence in `DecisionLog.md`" therefore doesn't apply yet; the
    `connect_dcrRejected_propagatesAuthExpired_withoutFallback` test simulates it via a test
    double (a `{status: 401}`-shaped rejection from the mocked `client.connect()`), which
    `McpErrorMapper` already classifies as `auth-expired` per TASK-005 — no change to
    `McpErrorMapper` was needed or made.
- Tests: created `src/mcp/connectionService.test.ts` with all 7 §9.5 cases, mocking the SDK
  `Client`/transport and `createOAuthClientProvider` via the two injected factories (no real
  network call, no real loopback server).
- Self-review: only `connectionService.ts`/`connectionService.test.ts` created; no import of
  `src/jira/*`/`src/github/*`; no token/header/PKCE value logged; `callTool` never reconnects
  once already connected (`isConnected` checked first).
- Validation: `npm run compile` passed. Ran `npx tsc -p ./` before `npm test` (same `out/` emit
  note as TASK-003/004/005/006). All 7 new `McpConnectionService` tests passed; 157 passing
  overall (up from 150), no regressions. `npm run lint` — 0 errors, 7 pre-existing-pattern
  warnings (`_serverId` unused-parameter warnings on intentionally-unused test-double callback
  params; `tsc`'s `noUnusedParameters` already accepts the underscore-prefix convention, eslint
  just warns instead of erroring on it).

## TASK-008 — Completed
- Preflight: Dependencies are none; §9.1-§9.5 present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: replaced `JiraConnection`'s field list in `src/jira/types.ts` from
  `{baseUrl, email, apiToken}` to `{siteUrl, siteId}`, exactly as specified in §9. No other type
  in the file touched (`JiraSavedQuery`/`JiraFailureCategory`/`JiraFailure`/`JiraPrLinkState`/
  `JiraTask`/`JiraViewState`/`JiraIncomingMessage`/`JiraOutgoingMessage` unchanged — in
  particular `JiraIncomingMessage`'s `jira.saveConnection` variant still has its old
  `{baseUrl, email, apiToken}` shape, which is correct per scope: TASK-009/010/013 own updating
  that). `client.ts`/`connectionStore.ts`/`configStore.ts`/`viewController.ts` were not touched,
  per §8, even though this breaks their compile.
- Self-review: only the one interface changed; no scope creep into the now-broken consumer files.
- Validation: per §15, full `npm run compile` is **expected to fail** until TASK-013 — confirmed
  this explicitly: running it now shows errors only in `src/jira/client.ts`,
  `src/jira/client.test.ts`, `src/jira/connectionStore.ts`, `src/jira/configStore.test.ts`,
  `src/jira/viewController.ts`, `src/jira/viewController.test.ts` (all referencing the removed
  `baseUrl`/`email`/`apiToken` fields) — exactly the downstream breakage TASK-008 anticipates,
  not a defect in this task. `src/jira/types.ts` itself has zero errors. Not treating this as a
  failed task per §14/§20's explicit exception.

## TASK-009 — Completed
- Preflight: Dependencies TASK-007/008 Completed; §9.1-§9.5 present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- **Tool-name confirmation — best-effort, not live** (logged to `DecisionLog.md`'s "TASK-009:
  Atlassian MCP tool names used best-effort, not live-verified" entry): could not establish a
  live, authenticated Atlassian MCP connection in this non-interactive session (the DCR+browser
  OAuth flow needs an interactive browser), so used the documented names exactly as given in §9
  (`getAccessibleAtlassianResources`, `searchJiraIssuesUsingJql`) without live `tools/list`
  confirmation. Flagged as a carried-forward risk for whichever stage first runs against a real
  endpoint.
- **Developer Freedom choice (§19)**: `fetchIssues` takes `siteUrl` as an explicit 4th parameter
  (`fetchIssues(connectionService, siteId, jql, siteUrl)`) purely to build each `JiraTask.url`
  field, rather than having the caller fill in `url` afterward. **TASK-013 must call it with this
  4-argument signature**, passing its own `connection.siteUrl` as the last argument.
- Implementation: created `src/jira/atlassianMcpAdapter.ts` (`AtlassianMcpAdapter`) with
  `validateConnection`/`validateQuery`/`fetchIssues` per the algorithm — URL normalization
  (strip trailing slash, lowercase) for site matching; `validateQuery` catches only
  `category === 'invalid-entry'` and rethrows everything else (no duplication of
  `JiraErrorClassifier`'s logic, per §18); a private `mapIssue` helper mirrors the deleted
  `JiraClient`'s mapping shape. `src/jira/client.ts` was not touched (left in place, unreferenced,
  per §8).
- Tests: created `src/jira/atlassianMcpAdapter.test.ts` with all 7 §9.5 cases, mocking
  `McpConnectionService.callTool` — no live network call.
- Self-review: no write-tool call anywhere; no raw MCP response crosses the adapter boundary
  unmapped.
- Validation: `npm run compile` shows only the TASK-008-anticipated downstream errors (in
  `client.ts`/`connectionStore.ts`/`viewController.ts` and their tests) — zero errors in the two
  new files. Ran `npx tsc -p ./` (still emits JS for files without errors despite the expected
  downstream ones) before `npm test`. All 7 new `AtlassianMcpAdapter` tests passed; 164 passing
  overall, no regressions among previously-passing suites.

## TASK-010 — Completed
- Preflight: Dependencies TASK-008/009 Completed; §9.1-§9.5 present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: rewrote `src/jira/connectionStore.ts` per the amended constructor
  (`McpConnectionService` instead of `typeof JiraClient`) and the 3-step algorithm —
  `getConnection()` reads `siteUrl`/`siteId`; `saveConnection(siteUrl)` validates the URL first
  (unchanged `URL_FORMAT`/`new URL` logic, no network call on a bad URL), then
  `connect('atlassian')`, then `AtlassianMcpAdapter.validateConnection`, persisting both fields
  and opportunistically deleting the legacy `devAssistant.jira.apiToken` secret on success, and
  explicitly *not* disconnecting on a site-mismatch failure; `clearConnection()` clears both
  settings, disconnects, and deletes the legacy secret. Updated `package.json`:
  `devAssistant.jira.baseUrl` → `siteUrl` (reworded description), `email` removed, `siteId`
  added. `src/jira/client.ts` untouched, per §8.
- Tests: rewrote `src/jira/connectionStore.test.ts` with all 7 §9.5 cases (replacing the 9
  pre-migration email/token-validation tests, which no longer apply to this shape). Mocked
  `McpConnectionService.connect`/`disconnect` via a fake object, and `AtlassianMcpAdapter
  .validateConnection` via direct monkey-patching of the imported const object (same pattern
  this codebase already uses for `vscode.workspace.getConfiguration` — `AtlassianMcpAdapter` is
  a plain module-level const, not constructor-injected, so this is the established way to stub
  a collaborator that isn't passed in).
- Self-review: no new secret key introduced; legacy-secret deletion is unconditional cleanup
  (never read/reused); MCP session is never disconnected on a site-mismatch failure.
- **Found and fixed in passing, not a TASK-010 defect**: `.mcp.json` (read by TASK-007's
  `McpConnectionService` constructor) had disappeared from the repo root since TASK-007's own
  validation, breaking `connectionService.test.ts` with `ENOENT`. Recreated it from its earlier
  content; see `DecisionLog.md`'s "Observed: `.mcp.json` is untracked and can disappear" entry
  for the risk this carries forward to Release/TASK-019.
- Validation: `npm run compile` shows zero errors in the three files this task touches. New
  errors appear in `src/extension.ts` (passes the old `JiraClient`-shaped object where
  `JiraConnectionStore`'s constructor now expects `McpConnectionService`) — this is expected
  collateral, not a regression: `extension.ts` wiring is TASK-019's job, same as
  `client.ts`/`configStore.ts`/`viewController.ts` already were left broken by TASK-008. All
  previously-listed TASK-008-anticipated errors remain, unchanged. Ran `npx tsc -p ./` before
  `npm test`. All 7 new `JiraConnectionStore` tests passed; 162 passing overall (164 + 7 new − 9
  removed pre-migration tests = 162, arithmetic checks out), no regressions.

## TASK-011 — Completed
- Preflight: Dependency TASK-009 Completed; §9.1-§9.5 present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: `src/jira/configStore.ts` — constructor's second parameter changed from
  `typeof JiraClient` to `McpConnectionService`; in `addQuery`, the one call site swapped from
  `this.client.validateQuery(connection, jql)` to
  `AtlassianMcpAdapter.validateQuery(this.connectionService, connection.siteId, jql)`. Nothing
  else in `addQuery`/`removeQuery`/`getSavedQueries` changed (trimmed-label/empty-JQL/BR-005
  uniqueness checks untouched). `src/jira/client.ts` and `JiraConnectionStore`'s public
  interface untouched, per §8.
- Tests: rewrote `src/jira/configStore.test.ts` — kept all behavior-unchanged cases (now using
  the new `{siteUrl, siteId}` connection shape) and replaced the old `fakeClient` helper with
  direct monkey-patching of `AtlassianMcpAdapter.validateQuery` (same established pattern as
  TASK-010). `addQuery_validQuery_callsAdapterWithSiteId` asserts the adapter is called with
  `connection.siteId` (`'cloud-1'`) and the injected `connectionService` reference, not the old
  `connection` object shape.
- Self-review: `connectionService.callTool` never called directly — only through
  `AtlassianMcpAdapter`, per §9.4.
- Validation: `npm run compile` shows zero errors in the two files this task touches. One more
  expected-collateral error appeared in `src/extension.ts` (now also wires `JiraConfigStore`
  with the old `JiraClient`-shaped object) — same TASK-019-wiring category as TASK-010's note,
  not a regression. Ran `npx tsc -p ./` before `npm test`. All 9 `JiraConfigStore` tests passed
  (5 §9.5-named + 4 carried-forward unchanged-behavior cases); 163 passing overall, no
  regressions.

## TASK-012 — Completed
- Preflight: Dependencies TASK-001/008 Completed; §9.1-§9.5 present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: replaced `src/jira/errorClassifier.ts`'s entire body with the specified thin
  passthrough — `classify(error: McpToolError): Omit<JiraFailure, 'queryLabel'>` returning
  `{category, detail, resetAt}` straight from the input, deleting all the old
  `status`/`errorMessages`/`response.headers` inspection logic (that classification now lives
  exactly once, in `McpErrorMapper`, TASK-005). Exported name `JiraErrorClassifier.classify`
  kept unchanged, per §9, so TASK-013 only needs to change its import. `src/jira/types.ts`
  untouched, per §8.
- Tests: rewrote `src/jira/errorClassifier.test.ts` with all 5 §9.5 cases, each passing an
  `McpToolError` input and asserting a straight passthrough (including the `resetAt`-present and
  `resetAt`-absent rate-limited cases).
- Self-review: no HTTP-status/header inspection left behind.
- Validation: `npm run compile` shows only the same TASK-008-anticipated errors (now also
  including `extension.ts`'s TASK-010/011-caused collateral, already noted) — zero errors in
  the two files this task touches. Ran `npx tsc -p ./` before `npm test`: all 5 new
  `JiraErrorClassifier` tests passed. Two **pre-existing, already-expected** `JiraViewController`
  test failures appeared at this point (`JiraViewController_...withApiToken`-related) — not a
  TASK-012 regression: `viewController.ts` has referenced the removed `connection.apiToken`/
  `.baseUrl` fields since TASK-008 (a compile error, not fixable until TASK-013), and since `tsc`
  (without `--noEmit`) re-emits JS for every file regardless of its own errors, this run happened
  to be the first to overwrite the previously-stale (pre-TASK-008) `out/jira/viewController.js`
  with freshly-transpiled, now-actually-broken-at-runtime JS. 160 passing, 2 failing — both
  failures confined to `JiraViewController`, exactly the file TASK-013 is scoped to fix next.

## TASK-013 — Completed
- Preflight: Dependencies TASK-009/010/011/012 Completed; §9.1-§9.5 present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: `src/jira/viewController.ts` — constructor's 4th parameter changed from
  `typeof JiraClient` to `McpConnectionService`; `refresh()`'s fetch call site swapped to
  `AtlassianMcpAdapter.fetchIssues(this.connectionService, connection.siteId, query.jql,
  connection.siteUrl)` — passing `siteUrl` as TASK-009's notes.md entry records (its 4-argument
  Developer Freedom choice); the token-redaction line (`detail = classified.detail.split(
  connection.apiToken).join('[REDACTED]')`) deleted outright, `failure` now built directly as
  `{...classified, queryLabel: query.label}`. `handleMessage`/`getState`/`buildTaskWithLinkage`/
  `postState`/`postConnectionResult`/`postQueryResult` unchanged in role. `matchPullRequestForIssue`/
  `PullRequestCache` usage and `src/jira/client.ts` untouched, per §8.
  - **One addition beyond §5's literal Included list, required by §14's own acceptance
    criterion** ("full-project `npm run compile` succeeds for the Jira domain"): the
    `jira.saveConnection` case in `handleMessage` called `this.connectionStore.saveConnection(msg)`
    (the whole message object) — a compile error since TASK-010 changed `saveConnection`'s
    signature to take a single `siteUrl: string`. Fixed the one call site to
    `this.connectionStore.saveConnection(msg.baseUrl)` (the old `JiraIncomingMessage` shape's
    `baseUrl` field is still the site-URL value the user typed — `JiraIncomingMessage` itself is
    unchanged, per TASK-008's scope). This is a mechanical argument-adaptation to an
    already-approved upstream signature change, not a change to dispatch structure or behavior —
    §5's "message handling (unchanged)" is read as the dispatch/behavioral contract, not a
    literal byte-for-byte freeze that would make §14's own acceptance criterion impossible to
    satisfy.
- Tests: rewrote `src/jira/viewController.test.ts` — updated `CONNECTION` to `{siteUrl, siteId}`;
  replaced the `client: typeof JiraClient` constructor-injection fake with direct monkey-patching
  of `AtlassianMcpAdapter.fetchIssues` (same established pattern as TASK-010/011, with
  setup/teardown save-and-restore) plus a placeholder `McpConnectionService` object (unused by
  the mocked adapter calls); updated the `jira.saveConnection` test and merged the three separate
  `handleMessage_*` tests into one `handleMessage_dispatchesEachCommand` per §9.5's named case;
  renamed the token-leakage test to `refresh_failureDetail_neverContainsApiTokenReference`,
  asserting `failures[0].detail` is exactly what the mocked adapter's `McpToolError` carried,
  with no post-processing. All 5 §9.5-named cases present, plus the carried-forward PR-linkage
  cases (unchanged dependency, re-verified).
- Self-review: no reference to `connection.apiToken` remains anywhere in the file (confirmed by
  the file now compiling, since that reference would be a type error); no new redaction step
  added.
- Validation: `npm run compile` — **`src/jira/viewController.ts` and
  `src/jira/viewController.test.ts` now have zero errors**, confirming §14's "full-project
  compile succeeds for the Jira domain" criterion for this file. Remaining errors are confined
  to `src/jira/client.ts`/`client.test.ts` (TASK-014's job — delete the file) and the
  cross-domain wiring files `src/extension.ts`/`src/panels/JiraDashboardPanel.ts`/
  `src/views/SidebarProvider.ts` (TASK-019's job — none of these are in the Jira domain's own
  files and were never claimed green by this task). Ran `npx tsc -p ./` before `npm test`. One
  initial test failure (`handleMessage_dispatchesEachCommand` asserting message array positions
  that didn't account for the interleaved `jira.state` posts from each command's own `refresh()`
  call) was fixed by searching `posted` by `command` instead of by fixed index. Final run: all 10
  `JiraViewController` tests passed; 161 passing overall, 0 failing.

## TASK-014 — Blocked
- Preflight: Dependencies TASK-009/010/011/012/013 Completed; §9.1-§9.5 present.
- Per §9's own algorithm (step 1-2), searched the whole `src/` tree for `JiraClient`/
  `jira/client` before deleting anything: `grep -rn "JiraClient|jira/client" src/` found live
  references **outside** the two files to be deleted:
  - `src/panels/JiraDashboardPanel.ts:3,15` — imports `JiraClient` as a type and as a
    constructor-param type (`client: typeof JiraClient`).
  - `src/extension.ts:12,43,44,49` — imports `JiraClient` and passes it to
    `new JiraConnectionStore(context, JiraClient)` / `new JiraConfigStore(jiraConnectionStore,
    JiraClient)` / a panel constructor — all three now type-mismatched since TASK-010/011
    changed those constructors to expect `McpConnectionService`, not `typeof JiraClient` (already
    visible as compile errors from TASK-010 onward, not newly discovered here).
  - (`src/jira/client.test.ts` itself also matches, but that's one of the two files being
    deleted, not an outside reference.)
- Per §9 step 2, this is an explicit Blocking Condition this task's own instructions anticipated
  — stopping rather than deleting the files out from under `extension.ts`/`JiraDashboardPanel.ts`'s
  live (if currently broken) imports. These two files are cross-domain wiring, owned by TASK-019
  (not yet attempted — it comes later in Task ID order and is not one of TASK-014's own
  dependencies, so the Execution Plan's own sequencing doesn't guarantee TASK-014 is actually
  unblocked at this point, despite its listed dependencies all being Completed).
- No files deleted, nothing else changed. TASK-014 must be re-attempted after TASK-019 removes
  these two references (or TASK-019 could delete `client.ts`/`client.test.ts` itself as part of
  its own wiring cleanup — Planner's call, not assumed here).

## TASK-015 — Completed
- Preflight: Dependency TASK-007 Completed; §9.1-§9.5 present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- **Tool-name/parameter confirmation — researched via public README, not live** (logged to
  `DecisionLog.md`'s "TASK-015: GitHub MCP tool names/parameters confirmed via public README,
  not live" entry): same session constraint as TASK-009 (no interactive browser for the OAuth
  flow a live connection needs). Used a web-fetch subagent to read the official
  `github/github-mcp-server` README instead of guessing blind — confirmed `pull_request_read`
  takes a `method` selector (`get`/`get_diff`/`get_status`/`get_files`/`get_commits`/
  `get_review_comments`/`get_reviews`/`get_comments`/`get_check_runs`), confirmed `search_users`
  exists (used for `validateAuthor`, satisfying §9 step 3's "if none [dedicated lookup tool],
  escalate" by actually finding one rather than guessing), confirmed no rate-limit tool exists.
  Response *shapes* (not just request parameters) remain unverified — assumed standard GitHub
  REST API JSON shapes.
- **Deviation from §9's algorithm, discovered while implementing**: `pull_request_read` is a
  single-field-selector tool, not a combined fetch — implemented as 4 concurrent calls per PR
  (`get`/`get_reviews`/`get_comments`/`get_check_runs`) instead of TASK-015's assumed single
  call. Also, `callWithSessionFallback`'s pseudocode called `callTool(serverId, name, args,
  {extraHeaders})` (4 args), but TASK-007's actual `callTool` only takes 3 — `extraHeaders` is a
  `connect()` option. Adapted to `connect('github', {extraHeaders})` (no-op if already
  connected) then `callTool('github', name, args)`, preserving the same session-first/
  exactly-one-retry behavior.
- Implementation: created `src/github/githubMcpAdapter.ts` (`GithubMcpAdapter`) with all four
  methods plus the private `callWithSessionFallback` helper and a `mapPullRequest` helper (named
  per §19). `validateRepo` reuses `list_pull_requests` per §9 step 2's sanctioned fallback (no
  dedicated lookup tool confirmed); `validateAuthor` uses `search_users`. Per-PR detail calls and
  per-unique-label `get_label` calls run concurrently via `Promise.all`, never in a sequential
  loop. `src/github/client.ts`/`types.ts`/`attentionEngine.ts` untouched, per §8.
- Tests: created `src/github/githubMcpAdapter.test.ts` with all 8 §9.5 cases (the
  `getRateLimitStatus_noToolAvailable_...` variant, matching the live finding), mocking
  `McpConnectionService.connect`/`callTool` — no live network call.
- Self-review: no write tool called; auth-fallback retried at most once (verified by the
  concurrent-connect-call-count assertion); session `accessToken` never logged.
- Validation: `npm run compile` shows zero errors in the two new files — remaining errors are
  the same pre-existing TASK-008/010/011-anticipated ones (unrelated Jira-domain/wiring files).
  Ran `npx tsc -p ./` before `npm test`. All 8 new `GithubMcpAdapter` tests passed; 169 passing
  overall, no regressions.

## TASK-016 — Completed
- Preflight: Dependency TASK-015 Completed; §9.1-§9.5 present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation: `src/github/configStore.ts` — constructor's second parameter changed from
  `typeof GitHubClient` to `McpConnectionService`; `addRepo`'s call site swapped to
  `GithubMcpAdapter.validateRepo(this.connectionService, {owner, repo}, session)`, `addAuthor`'s
  to `GithubMcpAdapter.validateAuthor(this.connectionService, {username}, session)`. Everything
  else (regex format check, duplicate-entry check, self-add check, settings read/write)
  untouched. `src/github/client.ts`/`GitHubAuthService` untouched, per §8.
- Tests: rewrote `src/github/configStore.test.ts` — kept all behavior-unchanged cases, replaced
  the old `fakeClient` constructor-injection helper with direct monkey-patching of
  `GithubMcpAdapter.validateRepo`/`validateAuthor` (same established pattern as TASK-010/011),
  plus a placeholder `McpConnectionService` object. The two new/updated cases assert the adapter
  is called with the exact injected `connectionService` reference.
- Self-review: `connectionService.callTool` never called directly — only through
  `GithubMcpAdapter`.
- Validation: `npm run compile` shows zero errors in the two files this task touches; one more
  expected-collateral error appeared in `src/extension.ts` (now also wires `GitHubConfigStore`
  with the old `GitHubClient`-shaped object) — same TASK-019-wiring category noted since
  TASK-010. Ran `npx tsc -p ./` before `npm test`. All 13 `GitHubConfigStore` tests passed (6
  §9.5-named + 7 carried-forward unchanged-behavior cases); 170 passing overall, no regressions.

## TASK-017 — Completed
- Preflight: Dependency TASK-015 Completed; §9.1-§9.5 present.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- **Error-shape compatibility check (§9 step 2) — amendment was needed**, logged to
  `DecisionLog.md`'s "TASK-017: GithubMcpAdapter amended to throw legacy {status,message} shape"
  entry: `src/github/errorClassifier.ts` inspects `{status, message, response.headers}`, but
  `GithubMcpAdapter.fetchOpenPullRequests` threw a raw `McpToolError` with no `status` field,
  which would always fall through to `category: 'network'`. Fixed in
  **`src/github/githubMcpAdapter.ts` (TASK-015's file)**, not in this task's own files, per §9's
  explicit instruction — added a `toLegacyThrownShape` translation at `fetchOpenPullRequests`'s
  boundary. Used **403 + `x-ratelimit-remaining: '0'` header** for `rate-limited`, not the
  429 the task's own text suggested — verified by actually running
  `refresh_rateLimitHandling_setsRateLimitedUntil` that 429 fails (falls through to 'network' in
  the untouched classifier, which only recognizes 403+headers) and 403+headers passes.
- Implementation: `src/github/viewController.ts` — constructor's `client: typeof GitHubClient`
  parameter changed to `connectionService: McpConnectionService`; the one
  `this.client.fetchOpenPullRequests(repo, session)` call site swapped to
  `GithubMcpAdapter.fetchOpenPullRequests(this.connectionService, repo, session)`. Nothing else
  in `refresh()`/`handleMessage`/`getState`/etc. changed. `AttentionEngine`/`LastSeenStore`/
  `PullRequestCache`/`src/github/errorClassifier.ts`/`client.ts` untouched, per §8 — confirmed
  `errorClassifier.ts`'s `git diff` is empty (§20's explicit check).
- Tests: rewrote `src/github/viewController.test.ts`'s `makeClient` helper to monkey-patch
  `GithubMcpAdapter.fetchOpenPullRequests` (same established pattern) and return a placeholder
  `McpConnectionService`, with setup/teardown save-and-restore; every existing call site
  continued to work unchanged since `makeClient(...)` is still passed positionally into the
  constructor. Kept all 14 existing tests (the 5 §9.5-named plus 9 other unchanged-behavior
  cases), including both rate-limit tests, which now exercise the new error-shape translation
  end-to-end (not just the classifier in isolation).
- Self-review: no modification to `errorClassifier.ts`/`AttentionEngine`/`LastSeenStore`/
  `PullRequestCache`.
- Validation: `npm run compile` shows zero errors in the two files this task touches; two more
  expected-collateral errors appeared (`src/panels/DashboardPanel.ts`, in addition to the
  existing `extension.ts`/`SidebarProvider.ts`/`JiraDashboardPanel.ts` ones) — same
  TASK-019-wiring category noted since TASK-010. Ran `npx tsc -p ./` before `npm test`. All 14
  `GitHubViewController` tests passed, including both rate-limit cases; 170 passing overall, no
  regressions.

## TASK-018 — Blocked
- Preflight: Dependencies TASK-015/016/017 Completed; §9.1-§9.5 present.
- Per §9's algorithm (step 1-2), searched the whole `src/` tree for `GitHubClient`/`github/client`/
  `octokit` before deleting anything or running `npm uninstall`: `grep -rn
  "GitHubClient|github/client|octokit" src/` found live references **outside** the two files to
  be deleted — same pattern, same root cause, as TASK-014's block:
  - `src/views/SidebarProvider.ts:5,24` — imports `GitHubClient` as a type and constructor-param
    type.
  - `src/panels/DashboardPanel.ts:3,15` — same.
  - `src/extension.ts:8,42,57,76` — imports `GitHubClient` and passes it to
    `new GitHubConfigStore(authService, GitHubClient)` and two panel constructors — already
    visible as compile errors since TASK-016/017 changed those constructors to expect
    `McpConnectionService`, not newly discovered here.
  - (`src/github/client.test.ts` itself also matches, but that's one of the two files being
    deleted, not an outside reference.)
- Per §9 step 2, this is an explicit Blocking Condition this task's own instructions anticipated
  — stopping rather than deleting `client.ts`/running `npm uninstall octokit` out from under
  these three files' live (if currently broken) imports. All three are cross-domain wiring,
  owned by TASK-019 (not yet attempted; not one of TASK-018's own listed dependencies, so the
  Execution Plan's sequencing doesn't guarantee TASK-018 is actually unblocked at this point
  despite its listed dependencies all being Completed — same situation as TASK-014).
- No files deleted, no `package.json`/`package-lock.json`/`npm uninstall` changes made. TASK-018
  must be re-attempted after TASK-019 removes these references (or TASK-019 could delete
  `client.ts`/`client.test.ts` and run the `octokit` uninstall itself as part of its own wiring
  cleanup — Planner's call, not assumed here). Note for whoever resolves TASK-019: TASK-014
  (Jira's `client.ts` deletion) is blocked on the exact same root cause and should be
  re-attempted at the same time.

## TASK-019 — Completed
- Preflight: original §4 listed TASK-013/014/017/018 as dependencies, but TASK-014/018 were
  Blocked precisely because they need *this* task's wiring first — a circular dependency.
  Resolved as Architect/Planner (logged to `DecisionLog.md`'s "Circular dependency between
  TASK-019 and TASK-014/018 resolved" entry): TASK-019's real dependencies are TASK-013/016/017
  (all Completed); TASK-014/018 amended to depend on TASK-019 instead. Proceeded on that basis.
- Checklist: none applies, per the corrected registry.
- Recurring findings: `docs/ai-learning/recurring.md` is absent.
- Implementation, `src/extension.ts`: removed the `JiraClient`/`GitHubClient` imports; added
  `McpConnectionService`; constructed exactly one `const connectionService = new
  McpConnectionService(context)` near the existing `authService` line; threaded it into
  `JiraConnectionStore`, `JiraConfigStore`, `GitHubConfigStore`, `jiraServices`, and both
  `GitHubServices`-shaped literals (sidebar + dashboard command). Disposal: chose
  `context.subscriptions.push({ dispose: () => void connectionService.dispose() })` in
  `activate()` over a direct call in `deactivate()` (§19 Developer Freedom — the existing
  `deactivate()` was already a no-op and every other service in this file already disposes via
  `context.subscriptions`, so this keeps the pattern consistent; `deactivate()` itself stays
  unchanged/empty).
- Implementation, `src/panels/DashboardPanel.ts` / `src/panels/JiraDashboardPanel.ts` /
  `src/views/SidebarProvider.ts`: each file's services-bag interface (`GitHubServices` in the
  first and third, `JiraServices` in the second) had its `client: typeof GitHubClient` /
  `client: typeof JiraClient` field renamed to `connectionService: McpConnectionService`; the
  `'../github/client'`/`'../jira/client'` import replaced with `'../mcp/connectionService'`;
  and the one `GitHubViewController`/`JiraViewController` construction site in each file updated
  to pass `services.connectionService` where `services.client` used to go. No other logic
  touched in any of the four files — confirmed by diff review; `src/commands/*`/`ToolPanel.ts`/
  anything inside `src/mcp/`/`src/jira/`/`src/github/` beyond each file's one type reference
  were not touched, per §8.
- Exactly one `McpConnectionService` instance exists per activation (constructed once in
  `extension.ts`, passed by reference everywhere else) — confirmed by inspection, per §9.4.
- Validation: `npm run compile` — **zero errors in all four files this task touches**, and zero
  errors anywhere else in the project except `src/jira/client.ts`/`client.test.ts` (TASK-014's
  now-finally-unblocked deletion target — not fixable within this task's own forbidden-files
  list, and not a regression this task introduced; `src/github/client.ts`/`client.test.ts`
  remain unreferenced but don't themselves error, since nothing in them depends on the changed
  `JiraConnection` shape — TASK-018 still owns deleting them). Confirmed via repo-wide search
  that every remaining `JiraClient`/`GitHubClient`/`octokit` reference is now confined to the
  two `client.ts`/`client.test.ts` pairs themselves. Ran `npx tsc -p ./` before `npm test`: 170
  passing, 0 failing, no regressions.
- **Manual smoke test (§15) — not performed in this non-interactive session**: launching the
  actual Extension Development Host GUI isn't possible here. Confidence instead comes from: (a)
  the full automated suite passing, including every constructor call site this task changed;
  (b) static compilation succeeding for all four wiring files with the exact new constructor
  shapes `GitHubViewController`/`JiraViewController` already expect (TASK-013/017's Required
  Interfaces, both already tested independently). Flagging the actual interactive
  activate-and-render smoke test as an open item for whoever next opens this in VS Code, or for
  `06-UnitTest`/`07-CodeReview`'s live validation stage (§15 itself defers the live OAuth
  round-trip there already).

## TASK-014 — Completed (re-attempted)
- Preflight: all dependencies (009-013, and now TASK-019 per the dependency-cycle fix) Completed.
- Re-ran §9's reference search: `grep -rn "JiraClient|jira/client" src/` now returns matches
  only inside `src/jira/client.ts`/`client.test.ts` themselves — zero remaining references
  elsewhere, now that TASK-019 rewired `extension.ts`/`JiraDashboardPanel.ts`. Deleted both
  files (and their stale `out/jira/client*.js` build artifacts).
- Validation: `npm run compile` — **zero errors across the whole project.** Ran `npx tsc -p ./`
  before `npm test`. 163 passing (170 − 7 deleted `JiraClient` tests), 0 failing, no regressions.

## TASK-018 — Completed (re-attempted)
- Preflight: all dependencies (015-017, and now TASK-019 per the dependency-cycle fix) Completed.
- Re-ran §9's reference search: `grep -rn "GitHubClient|github/client|octokit" src/` now
  returns matches only inside `src/github/client.ts`/`client.test.ts` themselves — zero
  remaining references elsewhere, now that TASK-019 rewired `extension.ts`/
  `JiraDashboardPanel.ts`/`SidebarProvider.ts`/`DashboardPanel.ts`. Deleted both files (and their
  stale `out/github/client*.js` build artifacts), then `npm uninstall octokit`.
- Validation: `npm run compile` — **zero errors across the whole project.** `octokit` confirmed
  absent from `package.json`; `npm install` reports "up to date" (lockfile consistent). Ran
  `npx tsc -p ./` before `npm test`. 152 passing (163 − 11 deleted `GitHubClient` tests), 0
  failing, no regressions. **This closes out every remaining Task Package in the story's
  19-task Execution Plan.**

## Post-implementation fix — Jira webview UI still asked for email+API token (user-reported)
- After all 19 tasks, the user reported the Jira configuration section still showed Email and
  API token fields, unlike GitHub's VS Code-native-auth-only UI. Confirmed: a genuine Execution
  Plan gap (logged to `DecisionLog.md`'s "Execution Plan gap found: Jira webview UI/message
  still asked for email+API token" entry) — no task's scope ever covered the webview HTML or
  the `JiraIncomingMessage` message shape for `jira.saveConnection`, which was explicitly frozen
  by TASK-008 and TASK-013 for unrelated reasons (both tasks' own scopes were about the backend
  type/dispatch layer, not the UI).
- Fixed: `src/jira/types.ts`'s `jira.saveConnection` variant is now `{command, siteUrl}`
  (dropped `email`/`apiToken`); `src/jira/viewController.ts`'s `handleMessage` reads
  `msg.siteUrl`; `src/panels/JiraDashboardPanel.ts` and `src/views/SidebarProvider.ts`'s inline
  Jira config section both now render a single "Jira site URL" input and a "Connect to Jira"
  button, matching GitHub's "Sign in to GitHub" pattern — no manual credential entry for either
  provider.
- Updated `src/jira/viewController.test.ts`'s `handleMessage_dispatchesEachCommand` test to send
  `{command: 'jira.saveConnection', siteUrl}` instead of the old 3-field shape.
- Validation: `npm run compile` — zero errors. Ran `npx tsc -p ./` before `npm test`: 152
  passing, 0 failing (same count as before — no test was added or removed, just adjusted to the
  new message shape).
