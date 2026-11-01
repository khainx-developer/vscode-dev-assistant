# Implementation Task Package — TASK-003

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-003 · Feature: Jira Configuration & Task Sync (MCP migration) · Module: `src/mcp/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: High priority / Medium complexity / Small-Medium · Owner: Developer
  role

## 2. Objective
Create `src/mcp/secretTokenStore.ts` implementing `McpSecretTokenStore`, the sole owner of MCP
OAuth state (client registration, tokens, PKCE verifier) per server, persisted exclusively via
`vscode.ExtensionContext.secrets`.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001, FR-011; BR-002
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §5, §22
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-003

## 4. Dependencies
None.

## 5. Scope
- Included: `McpSecretTokenStore` class with get/save/clear methods for three secret kinds, per
  server.
- Excluded: adapting these generic methods to the MCP SDK's `OAuthClientProvider` shape
  (TASK-006); any MCP network call.
Never infer scope beyond what's listed here.

## 6. Files To Create
`src/mcp/secretTokenStore.ts`, `src/mcp/secretTokenStore.test.ts`

## 7. Files To Modify
none

## 8. Files Forbidden To Modify
Anything outside the two files above.

## 9. Implementation Instructions
- Responsibilities: own exactly three `context.secrets` keys per server; no OAuth protocol logic.
- Required patterns: mirrors the existing store-class shape (`JiraConnectionStore`,
  `src/jira/connectionStore.ts:9-13` — constructor-injected `vscode.ExtensionContext`, one class
  per storage surface).
- Required interfaces:
  ```ts
  export class McpSecretTokenStore {
    constructor(
      private readonly context: vscode.ExtensionContext,
      private readonly serverId: McpServerId,
    ) {}

    async getClientInformation(): Promise<unknown | undefined> { /* ... */ }
    async saveClientInformation(info: unknown): Promise<void> { /* ... */ }
    async getTokens(): Promise<unknown | undefined> { /* ... */ }
    async saveTokens(tokens: unknown): Promise<void> { /* ... */ }
    async getCodeVerifier(): Promise<string | undefined> { /* ... */ }
    async saveCodeVerifier(verifier: string): Promise<void> { /* ... */ }
    async clear(): Promise<void> { /* ... */ }
  }
  ```
  Secret key names: `` `devAssistant.mcp.${this.serverId}.clientInformation` ``,
  `` `devAssistant.mcp.${this.serverId}.tokens` ``,
  `` `devAssistant.mcp.${this.serverId}.codeVerifier` ``. `get*` methods: `JSON.parse(await
  context.secrets.get(key))`, returning `undefined` if the key is unset (guard
  `JSON.parse(undefined)` by checking the raw string first). `save*` methods: `await
  context.secrets.store(key, JSON.stringify(value))`. `clear()`: `await
  context.secrets.delete(key)` for all three keys (use `Promise.all`).
- Expected behavior: a value saved for one server is invisible under another server's keys
  (namespacing works); `clear()` removes exactly its own server's three keys, not the other
  server's.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/mcp/secretTokenStore.ts`; `McpSecretTokenStore` class; connection-layer storage, owns `context.secrets` for MCP credentials |
| Signature | constructor `(context: vscode.ExtensionContext, serverId: McpServerId)`; 7 async methods listed above |
| Dependencies | `vscode.ExtensionContext.secrets` only |
| Algorithm | each method is a single `get`/`store`/`delete` call (or three, for `clear()`) against a namespaced key — no branching beyond "key unset → return undefined" |
| Complexity budget | well under 40 lines per method; no extraction needed |

**9.2 Data Access:** N/A — `context.secrets` is a key-value store, not a database; no
join/filter/query exists to specify.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| Secret read/write pattern | `context.secrets.get`/`store`/`delete` usage in `src/jira/connectionStore.ts:19,52,60` (the `SECRET_KEY = 'devAssistant.jira.apiToken'` pattern) | Reuse the same `context.secrets` API shape, generalized to a per-server, per-kind key; this task's constructor is new (none exists for a generic multi-kind secret store) |

**9.4 Forbidden shapes:** Never log a secret value (no applicable `recurring.md` category —
file absent at planning time).

**9.5 Test cases:**
- `getClientInformation_whenUnset_returnsUndefined`
- `saveClientInformation_thenGet_roundTrips`
- `getTokens_whenUnset_returnsUndefined`
- `saveTokens_thenGet_roundTrips`
- `getCodeVerifier_whenUnset_returnsUndefined`
- `saveCodeVerifier_thenGet_roundTrips`
- `clear_removesAllThreeKeys_forThisServerOnly` (seed both `'atlassian'` and `'github'` stores,
  clear one, assert the other's values are untouched)

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
BR-002 — MCP credentials stored only in `SecretStorage`; no API token/client secret
entered/logged/embedded.

## 11. Technical Constraints
This class must be the only module (besides TASK-006's provider, which calls *through* it) that
reads/writes these three secret key namespaces.

## 12. Security Constraints
Never include a secret value in a thrown error, log line, or test assertion failure message
beyond what the test framework itself prints on mismatch.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
All 9.5 test cases pass; `npm run compile` succeeds.

## 15. Validation Steps
Build; `npm test` (fake `ExtensionContext.secrets` — an in-memory `Map`-backed stub).

## 16. Expected Output
`McpSecretTokenStore` class as specified, with passing tests.

## 17. Rollback
Delete both files.

## 18. Common Mistakes
- Do not couple this class to the MCP SDK's `OAuthClientProvider` interface names — it exposes
  generic get/save/clear methods; TASK-006 does the adapting.
- Do not store raw (non-JSON-stringified) values — `context.secrets` only stores strings.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done).
