# Implementation Task Package — TASK-012

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-012 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/jira/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: Low priority / Low complexity / Small · Owner: Developer role

## 2. Objective
Modify `src/jira/errorClassifier.ts`'s `classify` function to accept the already-normalized
`McpToolError` shape instead of a raw thrown HTTP-like error.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-010
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §12
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-012

## 4. Dependencies
TASK-001, TASK-008. If either is not yet complete: **STOP** — do not start.

## 5. Scope
- Included: `classify`'s signature and body.
- Excluded: `JiraFailure`/`JiraFailureCategory` (unchanged shapes, TASK-008's scope).
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`src/jira/errorClassifier.ts`, `src/jira/errorClassifier.test.ts`

## 8. Files Forbidden To Modify
`src/jira/types.ts`'s `JiraFailure`/`JiraFailureCategory`.

## 9. Implementation Instructions
- Responsibilities: become a thin passthrough/rename from `McpToolError` to `JiraFailure`
  (minus `queryLabel`, which the caller adds).
- Required patterns: keep the exported name `JiraErrorClassifier.classify` unchanged so
  `JiraViewController` (TASK-013) only needs to change its *import*, not its call site.
- Required interfaces:
  ```ts
  export const JiraErrorClassifier = {
    classify(error: McpToolError): Omit<JiraFailure, 'queryLabel'> {
      return { category: error.category, detail: error.detail, resetAt: error.resetAt };
    },
  };
  ```
  Delete all the old `status`/`errorMessages`/`response.headers` inspection logic — that
  classification now happens once, upstream, in `McpErrorMapper` (TASK-005); this function must
  not duplicate it.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/jira/errorClassifier.ts`; `JiraErrorClassifier` const object; Jira-domain classifier |
| Signature | `classify(error: McpToolError): Omit<JiraFailure, 'queryLabel'>` |
| Dependencies | `src/mcp/types.ts` (`McpToolError`), `src/jira/types.ts` (`JiraFailure`) |
| Algorithm | single object literal passthrough, no branching |
| Complexity budget | trivially under budget |

**9.2 Data Access:** N/A — pure function.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| Category mapping (now obsolete here) | `src/jira/errorClassifier.ts:3-28` (pre-migration body) | Delete this logic entirely — it moved to `McpErrorMapper` (TASK-005); do not keep a parallel copy |

**9.4 Forbidden shapes:** Must not re-implement HTTP-status inspection here — that logic lives
exactly once, in `McpErrorMapper`.

**9.5 Test cases:**
- `classify_authExpired_mapsThrough`
- `classify_rateLimitedWithResetAt_mapsThrough`
- `classify_rateLimitedWithoutResetAt_mapsThrough`
- `classify_invalidEntry_mapsThrough`
- `classify_network_mapsThrough`

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
FR-010 — unchanged behavior from the caller's perspective, just a different input shape.

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
`JiraErrorClassifier.classify(error: McpToolError)` as specified.

## 17. Rollback
Revert the two modified files.

## 18. Common Mistakes
- Do not leave any `status`/`errorMessages` inspection code behind "just in case" — it's dead
  code once `McpErrorMapper` is the only classifier of raw errors.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done).
