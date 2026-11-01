# Implementation Task Package — TASK-014

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-014 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/jira/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: Low priority / Low complexity / Small · Owner: Developer role

## 2. Objective
Delete `src/jira/client.ts` and `src/jira/client.test.ts` now that nothing references them.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — BR-002, BR-007
- Technical Design: `03-Design/TechnicalDesign.md` — §18, §25
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-014

## 4. Dependencies
TASK-009, TASK-010, TASK-011, TASK-012, TASK-013, TASK-019. If any is not yet complete:
**STOP** — do not start.

(Amended — see `DecisionLog.md`'s "Circular dependency between TASK-019 and TASK-014/018
resolved" entry: added TASK-019, since `extension.ts`/`JiraDashboardPanel.ts` hold the only
remaining live references to `JiraClient` and only TASK-019 removes them. Without this, this
task's own §9 step 2 reference check would never pass.)

## 5. Scope
- Included: deleting exactly two files, after confirming zero remaining references.
- Excluded: anything else.
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
none

## 8. Files To Delete
`src/jira/client.ts`, `src/jira/client.test.ts`

## 9. Implementation Instructions
- Responsibilities: cleanup only.
- Required patterns: N/A.
- Required interfaces: N/A.
- Algorithm:
  1. Search the whole `src/` tree for `from './client'` (within `src/jira/`), `from
     '../jira/client'`, and the identifier `JiraClient`.
  2. If any match remains outside the two files being deleted, **STOP** — this is a Blocking
     Condition (ITPS). Report it in `05-Implementation/notes.md` rather than deleting the file
     out from under a live import.
  3. If zero matches remain, delete both files.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:** N/A — deletion only, no new/modified type/function/component.

**9.2 Data Access:** N/A.

**9.3 Reuse Map:** N/A — nothing is being added.

**9.4 Forbidden shapes:** Must not delete the files before confirming zero remaining references.

**9.5 Test cases:** N/A — no new test; verification is the repo-wide search plus a green build.

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
BR-002, BR-007 — no REST/API-token path remains in the codebase after this task.

## 11. Technical Constraints
standard.

## 12. Security Constraints
standard.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
`npm run compile` succeeds; a repo-wide search for `JiraClient` or `jira/client` returns no
matches.

## 15. Validation Steps
Build; repo-wide text search (e.g. `grep -rn "JiraClient\|jira/client" src/`).

## 16. Expected Output
The two files no longer exist.

## 17. Rollback
Restore both files from version control.

## 18. Common Mistakes
- Do not skip the reference search "because TASK-013 should have caught everything" — verify it
  directly before deleting.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done).
