# Implementation Task Package — TASK-008

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-008 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/jira/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: Medium priority / Low complexity / Small · Owner: Developer role

## 2. Objective
Change `JiraConnection`'s shape in `src/jira/types.ts` to carry only non-secret site identity
(`siteUrl`, `siteId`), removing the `baseUrl`/`email`/`apiToken` fields the MCP migration
deletes.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001; BR-002
- Technical Design: `03-Design/TechnicalDesign.md` — §2
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-008

## 4. Dependencies
None.

## 5. Scope
- Included: the `JiraConnection` interface only.
- Excluded: `JiraSavedQuery`, `JiraFailureCategory`, `JiraFailure`, `JiraPrLinkState`,
  `JiraTask`, `JiraViewState`, `JiraIncomingMessage`, `JiraOutgoingMessage` — unchanged. Fixing
  the resulting compile errors in `client.ts`/`connectionStore.ts`/`configStore.ts`/
  `viewController.ts` — that is TASK-009 through TASK-013, not this task.
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`src/jira/types.ts`

## 8. Files Forbidden To Modify
Every other type in the file; `src/jira/client.ts`, `src/jira/connectionStore.ts`,
`src/jira/configStore.ts`, `src/jira/viewController.ts` (even though this task will make them
fail to compile — leave them broken for TASK-009..013 to fix in order, per the Execution Plan's
dependency graph).

## 9. Implementation Instructions
- Responsibilities: one interface's shape.
- Required patterns: none beyond plain TypeScript interfaces, matching the file's existing
  style.
- Required interfaces: replace
  ```ts
  export interface JiraConnection {
    baseUrl: string;
    email: string;
    apiToken: string;
  }
  ```
  with
  ```ts
  export interface JiraConnection {
    siteUrl: string;
    siteId: string;
  }
  ```
- Expected behavior: this file's own type-check passes; the rest of the project is *expected* to
  fail to compile until TASK-013 — note that in `05-Implementation/notes.md`, don't treat it as
  this task's own failure.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:** File `src/jira/types.ts`. One interface's field list changes; no new
type/function/component is added (N/A for the "new class" trigger — this is a pure modification
of an existing type).

**9.2 Data Access:** N/A — type declaration only.

**9.3 Reuse Map:** N/A — modifying an existing type in place; no new symbol to search for.

**9.4 Forbidden shapes:** None task-specific.

**9.5 Test cases:** None — type-only change; `src/jira/types.ts` has no test file of its own
today (matches the existing convention for pure type files).

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
BR-002 — no credential field remains on this type.

## 11. Technical Constraints
standard.

## 12. Security Constraints
standard.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
`src/jira/types.ts` itself type-checks with the new shape (confirm by inspection or isolated
`tsc --noEmit` on the file if the toolchain supports it); the rest of the project is not expected
to compile yet.

## 15. Validation Steps
Visual confirmation of the type-only edit. Full `npm run compile` is not expected to pass again
until TASK-013 — record this explicitly in `05-Implementation/notes.md` so it isn't mistaken for
a broken build later in the sequence.

## 16. Expected Output
Updated `JiraConnection` interface as specified.

## 17. Rollback
Revert the interface to its prior shape.

## 18. Common Mistakes
- Do not "helpfully" also fix `client.ts`/`connectionStore.ts` in this task — that's scope creep
  into TASK-009/010.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done), with the exception that full-project compile is explicitly
not required yet — note this instead of treating it as incomplete.
