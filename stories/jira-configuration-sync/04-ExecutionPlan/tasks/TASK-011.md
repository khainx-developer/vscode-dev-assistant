# Implementation Task Package — TASK-011

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-011 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/jira/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: Medium priority / Low complexity / Small · Owner: Developer role

## 2. Objective
Modify `src/jira/configStore.ts` to validate a new saved query through `AtlassianMcpAdapter`
instead of the deleted-in-spirit `JiraClient`.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-002, FR-003, FR-004; BR-001,
  BR-005, VR-004, VR-005
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §5, §9
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-011

## 4. Dependencies
TASK-009. If not yet complete: **STOP** — do not start.

## 5. Scope
- Included: constructor and `addQuery`'s one call site.
- Excluded: `removeQuery`/`getSavedQueries` (no change needed — they don't touch the client).
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`src/jira/configStore.ts`, `src/jira/configStore.test.ts`

## 8. Files Forbidden To Modify
`JiraConnectionStore`'s public interface (read `connection.siteId` from the already-updated
`JiraConnection`, don't change the store's contract further); `src/jira/client.ts`.

## 9. Implementation Instructions
- Responsibilities: unchanged (own `devAssistant.jira.savedQueries`, enforce BR-001/BR-005);
  only the validation dependency changes.
- Required patterns: unchanged class shape.
- Required interfaces:
  ```ts
  export class JiraConfigStore {
    constructor(
      private readonly connectionStore: JiraConnectionStore,
      private readonly connectionService: McpConnectionService,
    ) {}
    // getSavedQueries/addQuery/removeQuery signatures unchanged
  }
  ```
- Algorithm: in `addQuery`, after the existing trimmed-label/empty-JQL/BR-005-uniqueness checks
  and after fetching `connection = await this.connectionStore.getConnection()` (unchanged),
  replace `await this.client.validateQuery(connection, jql)` with
  `await AtlassianMcpAdapter.validateQuery(this.connectionService, connection.siteId, jql)`.
  Everything else in `addQuery`/`removeQuery`/`getSavedQueries` is unchanged.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/jira/configStore.ts`; `JiraConfigStore` class; Jira-domain store |
| Signature | constructor change only; method signatures unchanged |
| Dependencies | `JiraConnectionStore` (unchanged), `McpConnectionService` (new, replaces `typeof JiraClient`) |
| Algorithm | one call-site swap, described above |
| Complexity budget | no change to method size |

**9.2 Data Access:** N/A — no database; the one remote call is `AtlassianMcpAdapter`'s concern,
already specced in TASK-009.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| BR-005 uniqueness check, trimmed-label/JQL validation | `addQuery` (`src/jira/configStore.ts:16-27` pre-migration) | Reuse unchanged, only the `validateQuery` call site changes |
| Adapter | `AtlassianMcpAdapter.validateQuery` (TASK-009) | Call with `connection.siteId` instead of the old `connection` object |

**9.4 Forbidden shapes:** Must not call `connectionService.callTool` directly — only through
`AtlassianMcpAdapter` (TechnicalDesign.md §2's forbidden-dependency rule).

**9.5 Test cases:**
- `addQuery_emptyLabel_returnsFailure` (unchanged behavior, re-verify after the swap)
- `addQuery_duplicateLabel_returnsFailure` (BR-005, unchanged behavior, re-verify)
- `addQuery_validQuery_callsAdapterWithSiteId` (new/updated — assert
  `AtlassianMcpAdapter.validateQuery` is called with `connection.siteId`, not the old
  `connection` object shape)
- `addQuery_adapterRejectsQuery_returnsFailureReason`
- `removeQuery_removesByLabel` (unchanged, re-verify)

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
BR-001, BR-005, VR-004, VR-005.

## 11. Technical Constraints
standard.

## 12. Security Constraints
standard.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
All 9.5 test cases pass.

## 15. Validation Steps
Build; `npm test`.

## 16. Expected Output
`JiraConfigStore` depending on `AtlassianMcpAdapter`/`McpConnectionService`.

## 17. Rollback
Revert the two modified files.

## 18. Common Mistakes
- Do not change the BR-005/trimmed-label validation logic — only the one `validateQuery` call
  site and the constructor signature change.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done).
