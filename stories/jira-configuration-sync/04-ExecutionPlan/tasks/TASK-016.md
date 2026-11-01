# Implementation Task Package — TASK-016

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-016 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/github/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: Medium priority / Low complexity / Small · Owner: Developer role

## 2. Objective
Modify `src/github/configStore.ts` to validate monitored repos/authors through `GithubMcpAdapter`
instead of the deleted-in-spirit `GitHubClient`.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-012
- Technical Design: `03-Design/TechnicalDesign.md` — §2
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-016

## 4. Dependencies
TASK-015. If not yet complete: **STOP** — do not start.

## 5. Scope
- Included: constructor and the `addRepo`/`addAuthor` call sites.
- Excluded: `getConfig`/`removeRepo`/`removeAuthor` (no change needed — they don't touch the
  client).
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`src/github/configStore.ts`, `src/github/configStore.test.ts`

## 8. Files Forbidden To Modify
`src/github/client.ts`, `GitHubAuthService`.

## 9. Implementation Instructions
- Responsibilities: unchanged (own repo-format/duplicate checks, persist settings); only the
  validation dependency changes.
- Required patterns: unchanged class shape.
- Required interfaces:
  ```ts
  export class GitHubConfigStore {
    constructor(
      private readonly authService: GitHubAuthService,
      private readonly connectionService: McpConnectionService,
    ) {}
    // getConfig/addRepo/addAuthor/removeRepo/removeAuthor signatures unchanged
  }
  ```
- Algorithm: in `addRepo`, replace `await this.client.validateRepo({ owner, repo }, session)`
  with `await GithubMcpAdapter.validateRepo(this.connectionService, { owner, repo }, session)`.
  In `addAuthor`, replace `await this.client.validateAuthor({ username }, session)` with
  `await GithubMcpAdapter.validateAuthor(this.connectionService, { username }, session)`.
  Everything else (regex format check, duplicate-entry check, `session.username === username`
  self-add check, settings read/write) is unchanged.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/github/configStore.ts`; `GitHubConfigStore` class; GitHub-domain store |
| Signature | constructor change only; method signatures unchanged |
| Dependencies | `GitHubAuthService` (unchanged), `McpConnectionService` (new, replaces `typeof GitHubClient`) |
| Algorithm | two call-site swaps, described above |
| Complexity budget | no change to method size |

**9.2 Data Access:** N/A — no database; the remote calls are `GithubMcpAdapter`'s concern,
already specced in TASK-015.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| Repo-format regex, duplicate checks | `addRepo`/`addAuthor` (`src/github/configStore.ts:27-57`) | Reuse unchanged |
| Adapter | `GithubMcpAdapter.validateRepo`/`validateAuthor` (TASK-015) | Call with `this.connectionService` as the first argument |

**9.4 Forbidden shapes:** Must not call `connectionService.callTool` directly — only through
`GithubMcpAdapter`.

**9.5 Test cases:**
- `addRepo_invalidFormat_returnsFailure` (unchanged, re-verify)
- `addRepo_duplicate_returnsFailure` (unchanged, re-verify)
- `addRepo_notSignedIn_returnsFailure` (unchanged, re-verify)
- `addRepo_validRepo_callsAdapterAndPersists` (new/updated — assert `GithubMcpAdapter.validateRepo`
  is called with `this.connectionService`)
- `addAuthor_selfAdd_returnsFailure` (unchanged, re-verify)
- `addAuthor_validAuthor_callsAdapterAndPersists` (new/updated)

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
FR-012 — existing behavior preserved.

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
`GitHubConfigStore` depending on `GithubMcpAdapter`/`McpConnectionService`.

## 17. Rollback
Revert the two modified files.

## 18. Common Mistakes
- Do not change the repo-format regex or duplicate-check logic — only the two validation call
  sites and the constructor signature.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done).
