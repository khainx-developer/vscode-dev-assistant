# Implementation Task Package — TASK-010

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-010 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/jira/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: High priority / Medium complexity / Medium · Owner: Developer role

## 2. Objective
Modify `src/jira/connectionStore.ts` to persist only non-secret Jira site identity and to trigger
MCP authorization through `McpConnectionService`/`AtlassianMcpAdapter`, removing the stored
`apiToken` secret entirely.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001, FR-011; BR-002, BR-007,
  VR-001, VR-002
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §5, §9
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-010

## 4. Dependencies
TASK-008, TASK-009. If either is not yet complete: **STOP** — do not start.

## 5. Scope
- Included: `JiraConnectionStore`'s constructor and all three methods; the two
  `package.json`/`contributes.configuration` settings it reads.
- Excluded: `JiraConfigStore` (TASK-011), `JiraViewController` (TASK-013).
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`src/jira/connectionStore.ts`, `src/jira/connectionStore.test.ts`, `package.json`

## 8. Files Forbidden To Modify
`src/jira/client.ts` (still present, unreferenced by this file after this task; deleted in
TASK-014).

## 9. Implementation Instructions
- Responsibilities: own `devAssistant.jira.siteUrl`/`siteId` settings; trigger/verify MCP
  authorization; own cleanup of the legacy secret.
- Required patterns: same store-class shape as today, just a different dependency.
- Required interfaces:
  ```ts
  export class JiraConnectionStore {
    constructor(
      private readonly context: vscode.ExtensionContext,
      private readonly connectionService: McpConnectionService,
    ) {}

    async getConnection(): Promise<JiraConnection | undefined> { /* ... */ }
    async saveConnection(siteUrl: string): Promise<{ ok: true } | { ok: false; reason: string }> { /* ... */ }
    async clearConnection(): Promise<void> { /* ... */ }
  }
  ```
- Algorithm:
  1. `getConnection()`: read `devAssistant.jira.siteUrl`/`devAssistant.jira.siteId` from
     `vscode.workspace.getConfiguration('devAssistant.jira')`. If either is empty, return
     `undefined`. Otherwise return `{ siteUrl, siteId }`.
  2. `saveConnection(siteUrl)`: validate with the existing `URL_FORMAT`/`new URL(...)` checks
     (unchanged logic, VR-001) — return the existing-style failure reasons on a bad URL
     *before* touching the network. Then `await this.connectionService.connect('atlassian')` —
     if this throws/rejects, return `{ ok: false, reason: <its message> }` (propagate, don't
     swallow). Then `await AtlassianMcpAdapter.validateConnection(this.connectionService,
     siteUrl)`. On `{ok:true, siteId}`: persist both `siteUrl` and `siteId` to
     `devAssistant.jira.*` settings (`ConfigurationTarget.Global`), opportunistically delete the
     legacy secret `context.secrets.delete('devAssistant.jira.apiToken')` (safe no-op if unset,
     BR-007), and return `{ok:true}`. On `{ok:false, reason}`: return `{ok:false, reason}`
     **without** calling `this.connectionService.disconnect('atlassian')` — the OAuth session
     itself may still be valid even though this particular site didn't match (Design.md §7's
     "more than one Jira site is authorized → developer chooses one" implies keeping the session
     for a retry with a different `siteUrl`).
  3. `clearConnection()`: clear both settings (empty string), call
     `this.connectionService.disconnect('atlassian')` (FR-011), and delete the legacy secret.
  4. `package.json`: in `contributes.configuration.properties`, rename
     `devAssistant.jira.baseUrl` → `devAssistant.jira.siteUrl` (same `type`/`description`,
     reworded); remove `devAssistant.jira.email` entirely; add `devAssistant.jira.siteId` (
     `type: "string"`, `default: ""`, `description: "Internal: the Jira site's Atlassian cloud
     ID, set automatically after connecting."`).

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/jira/connectionStore.ts`; `JiraConnectionStore` class; Jira-domain store |
| Signature | constructor + 3 methods, as above |
| Dependencies | `vscode.workspace`, `vscode.ExtensionContext.secrets` (legacy-cleanup only), `McpConnectionService`, `AtlassianMcpAdapter` |
| Algorithm | 4 numbered steps above |
| Complexity budget | `saveConnection` is the largest method; keep it under 40 lines by not inlining the URL-validation block if it grows — extract a private `isValidSiteUrl(url)` if needed |

**9.2 Data Access:** N/A — no database; the MCP tool calls inside this flow are
`AtlassianMcpAdapter`'s concern (TASK-009), already specced there. This store's own "data access"
is two `vscode.workspace.getConfiguration` reads/writes and one opportunistic
`context.secrets.delete` — trivial key-value operations, not a query.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| URL validation regex/logic | `URL_FORMAT`, `new URL(...)` check (`src/jira/connectionStore.ts:5,29-36` in the pre-migration file) | Reuse unchanged |
| Settings read/write pattern | `vscode.workspace.getConfiguration('devAssistant.jira')` (`src/jira/connectionStore.ts:16-17,49-51` pre-migration) | Reuse the same API shape, different keys |
| Adapter | `AtlassianMcpAdapter` (TASK-009, `src/jira/atlassianMcpAdapter.ts`) | Call `validateConnection` |

**9.4 Forbidden shapes:**
- Must not call `context.secrets` for anything except the one-time legacy-key cleanup — no new
  secret is stored by this class (BR-002; the MCP credential itself lives in
  `McpSecretTokenStore`, owned by `McpConnectionService`).
- Must not disconnect the MCP session on a site-mismatch failure (see algorithm step 2).

**9.5 Test cases:**
- `getConnection_emptySettings_returnsUndefined`
- `getConnection_bothSettingsPresent_returnsConnection`
- `saveConnection_invalidUrl_returnsFailure_withoutCallingConnectionService` (assert
  `connectionService.connect` was never called)
- `saveConnection_validUrlAndMatchingSite_persistsAndReturnsOk`
- `saveConnection_validUrlNoMatchingSite_returnsFailure_withoutDisconnecting` (assert
  `connectionService.disconnect` was never called)
- `clearConnection_clearsSettings_disconnects_andDeletesLegacySecret`
- `saveConnection_onSuccess_deletesLegacySecretIfPresent` (pre-seed the old
  `devAssistant.jira.apiToken` secret key, assert it's gone after success)

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
BR-002, BR-007, VR-001, VR-002.

## 11. Technical Constraints
Must not introduce a new secret key beyond the legacy one it cleans up.

## 12. Security Constraints
The legacy-secret deletion must be unconditional cleanup (safe no-op if unset), never a silent
read/reuse of its value.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
All 9.5 test cases pass.

## 15. Validation Steps
Build; `npm test`.

## 16. Expected Output
`JiraConnectionStore` with the new constructor/method signatures; updated `package.json`
settings.

## 17. Rollback
Revert the three modified files.

## 18. Common Mistakes
- Do not disconnect the MCP session just because one site didn't match — that would force the
  developer to re-authorize for a simple typo correction.
- Do not forget the `package.json` settings rename/removal — a stale `devAssistant.jira.baseUrl`
  left alongside the new `siteUrl` would silently do nothing.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done).
