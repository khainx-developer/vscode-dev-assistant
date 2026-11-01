# Implementation Task Package — TASK-013

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-013 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/jira/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: High priority / Medium complexity / Medium · Owner: Developer role

## 2. Objective
Modify `src/jira/viewController.ts` to depend on `AtlassianMcpAdapter`/`McpConnectionService`
instead of `JiraClient`, completing the Jira domain's compile-ability (TASK-008 broke it;
this task fixes it).

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-005, FR-006, FR-007, FR-008,
  FR-009, FR-010
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §5, §6
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-013

## 4. Dependencies
TASK-009, TASK-010, TASK-011, TASK-012. If any is not yet complete: **STOP** — do not start.

## 5. Scope
- Included: constructor, the `refresh()` fetch call site, and the token-redaction line's
  removal.
- Excluded: `matchPullRequestForIssue`/`PullRequestCache` usage (read-only dependencies,
  unchanged); message handling (unchanged).
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`src/jira/viewController.ts`, `src/jira/viewController.test.ts`

## 8. Files Forbidden To Modify
`matchPullRequestForIssue`/`PullRequestCache`; `src/jira/client.ts`.

## 9. Implementation Instructions
- Responsibilities: unchanged orchestration role; only the fetch dependency and the now-dead
  redaction line change.
- Required patterns: unchanged class shape.
- Required interfaces:
  ```ts
  export class JiraViewController {
    constructor(
      private readonly view: JiraViewHost,
      private readonly connectionStore: JiraConnectionStore,
      private readonly configStore: JiraConfigStore,
      private readonly connectionService: McpConnectionService,
      private readonly pullRequestCache: PullRequestCache,
      private readonly outputChannel: vscode.OutputChannel,
    ) {}
    // handleMessage/refresh/getState/buildTaskWithLinkage unchanged in name and role
  }
  ```
- Algorithm (exact diff from the pre-migration file):
  1. In `refresh()`, replace
     `this.client.fetchIssues(connection, query.jql).then((tasks) => ({ query, tasks }))` with
     `AtlassianMcpAdapter.fetchIssues(this.connectionService, connection.siteId,
     query.jql).then((tasks) => ({ query, tasks }))` — if TASK-009 chose to also pass `siteUrl`
     for building each task's `url` field, pass `connection.siteUrl` as well, matching whatever
     TASK-009 actually implemented (check `05-Implementation/notes.md`'s TASK-009 entry for that
     choice before writing this call).
  2. **Delete outright** the line
     `const detail = classified.detail.split(connection.apiToken).join('[REDACTED]');` and the
     now-unused `detail` variable's use — `connection.apiToken` no longer exists
     (`JiraConnection` has no credential field after TASK-008), and `McpErrorMapper` (TASK-005)
     already guarantees `classified.detail` never contains a token. The failure object becomes
     `const failure = { ...classified, queryLabel: query.label };` (no `detail` rebinding step).
  3. Everything else — `handleMessage`, `getState`, `buildTaskWithLinkage`, `postState`,
     `postConnectionResult`, `postQueryResult` — is unchanged.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/jira/viewController.ts`; `JiraViewController` class; Jira-domain controller |
| Signature | constructor parameter swap only; all method signatures unchanged |
| Dependencies | `AtlassianMcpAdapter`, `McpConnectionService` (new, replace `typeof JiraClient`); `JiraErrorClassifier`, `matchPullRequestForIssue`, `PullRequestCache` (unchanged) |
| Algorithm | 3 numbered steps above — a small, surgical diff, not a rewrite |
| Complexity budget | `refresh()` stays the same size or shrinks slightly (the redaction line is removed, nothing is added in its place) |

**9.2 Data Access:** N/A — no database; the fetch itself is `AtlassianMcpAdapter`'s concern
(TASK-009), already specced.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| `Promise.allSettled` per-query fetch/failure-isolation loop | `refresh()` (`src/jira/viewController.ts:81-102` pre-migration) | Reuse unchanged except the one fetch call site (step 1) and the redaction line's removal (step 2) |
| Linkage building | `buildTaskWithLinkage` (`src/jira/viewController.ts:124-133` pre-migration) | Reuse unchanged |

**9.4 Forbidden shapes:**
- Must not leave any reference to `connection.apiToken` anywhere in the file (it would be a
  compile error after TASK-008, so this is self-verifying, but call it out explicitly since it's
  the one line most likely to be missed in a mechanical find-and-replace).

**9.5 Test cases:**
- `refresh_buildsTasksByQuery_fromAdapter` (existing test, re-verify with the adapter
  substituted)
- `refresh_perQueryFailureIsolation_oneFailureDoesNotBlockOthers` (FR-010, existing test,
  re-verify)
- `refresh_linkageComputedViaMatchPullRequestForIssue` (existing test, re-verify, unchanged
  dependency)
- `handleMessage_dispatchesEachCommand` (existing test, re-verify, unchanged)
- `refresh_failureDetail_neverContainsApiTokenReference` (new — since there's no `apiToken`
  field left to leak, this test can simply assert the redaction line/variable no longer exists
  in the compiled behavior, e.g. by asserting a failure's `detail` is exactly what
  `McpErrorMapper` produced, with no post-processing applied)

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
FR-005 through FR-010 — all already satisfied by the unchanged orchestration logic; this task
must not change any of their behavior, only the fetch dependency.

## 11. Technical Constraints
This is the task where full-project `npm run compile` is expected to pass again for the Jira
domain (TASK-008 intentionally broke it).

## 12. Security Constraints
standard — no new secret handling in this file.

## 13. Performance Constraints
standard — `Promise.allSettled` concurrency across saved queries is unchanged.

## 14. Acceptance Criteria
All 9.5 test cases pass; full-project `npm run compile` succeeds for the Jira domain.

## 15. Validation Steps
Build (this is the task where it's expected to go green again); `npm test`.

## 16. Expected Output
`JiraViewController` compiling against the new adapter/types, with the token-redaction line
removed.

## 17. Rollback
Revert the two modified files.

## 18. Common Mistakes
- Do not add a new redaction step "to be safe" — there is nothing left to redact once
  `apiToken` doesn't exist, and `McpErrorMapper` already owns never leaking a token into
  `detail`.
- Do not change the per-query failure isolation (`Promise.allSettled`) structure.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done), plus: confirm full-project build is green again.
