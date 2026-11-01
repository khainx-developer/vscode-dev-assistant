# Implementation Task Package — TASK-018

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-018 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/github/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: Low priority / Low complexity / Small · Owner: Developer role

## 2. Objective
Delete `src/github/client.ts`/`src/github/client.test.ts` and remove the `octokit` dependency
now that nothing references either.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-012 (MCP is now the sole GitHub
  data source)
- Technical Design: `03-Design/TechnicalDesign.md` — §18, §25
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-018

## 4. Dependencies
TASK-015, TASK-016, TASK-017, TASK-019. If any is not yet complete: **STOP** — do not start.

(Amended — see `DecisionLog.md`'s "Circular dependency between TASK-019 and TASK-014/018
resolved" entry: added TASK-019, since `extension.ts`/`SidebarProvider.ts`/`DashboardPanel.ts`
hold the only remaining live references to `GitHubClient` and only TASK-019 removes them.
Without this, this task's own §9 step 2 reference check would never pass.)

## 5. Scope
- Included: deleting two files and one dependency, after confirming zero remaining references.
- Excluded: anything else.
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`package.json`, `package-lock.json`

## 8. Files To Delete
`src/github/client.ts`, `src/github/client.test.ts`

## 9. Implementation Instructions
- Responsibilities: cleanup only.
- Algorithm:
  1. Search the whole `src/` tree for `from './client'` (within `src/github/`), `from
     '../github/client'`, `GitHubClient`, and `'octokit'`.
  2. If any match remains outside the two files being deleted, **STOP** — Blocking Condition.
     Report in `05-Implementation/notes.md`.
  3. If zero matches remain, delete both files and run `npm uninstall octokit`.
- **This task is only allowed to run once AC-015's parity concern is either satisfied by
  TASK-015/017's mapping or explicitly deferred to `06-UnitTest`/`07-CodeReview`'s live
  validation per BR-008 — removing the dependency doesn't bypass that gate, it just means there
  is no code-level fallback left if parity fails. If a parity gap is found later, fix
  `GithubMcpAdapter` (TASK-015's file) — do not restore `octokit`/`client.ts` as a workaround.**

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:** N/A — deletion only.

**9.2 Data Access:** N/A.

**9.3 Reuse Map:** N/A — nothing is being added.

**9.4 Forbidden shapes:** Must not delete before confirming zero remaining references; must not
restore `octokit` as a parity-gap workaround later.

**9.5 Test cases:** N/A — verification is the repo-wide search plus a green build/lockfile.

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
FR-012 — MCP is the sole GitHub data source after this task.

## 11. Technical Constraints
standard.

## 12. Security Constraints
standard.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
`npm run compile` succeeds; a repo-wide search for `GitHubClient`, `github/client`, or `octokit`
returns no matches; `npm install` confirms lockfile consistency.

## 15. Validation Steps
Build; repo-wide text search; `npm install`.

## 16. Expected Output
The two files no longer exist; `octokit` removed from `package.json`.

## 17. Rollback
Restore both files and the `octokit` dependency from version control.

## 18. Common Mistakes
- Do not restore `octokit` later as a fix for a discovered parity gap — fix the adapter instead.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done).
