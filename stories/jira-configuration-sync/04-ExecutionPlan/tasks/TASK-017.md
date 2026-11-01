# Implementation Task Package — TASK-017

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-017 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/github/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: High priority / Medium complexity / Medium · Owner: Developer role

## 2. Objective
Modify `src/github/viewController.ts`'s constructor and `refresh()` to depend on
`GithubMcpAdapter`/`McpConnectionService` instead of `GitHubClient`, without touching the
untouched `src/github/errorClassifier.ts` pipeline.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-012; AC-015
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §6
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-017

## 4. Dependencies
TASK-015. If not yet complete: **STOP** — do not start.

## 5. Scope
- Included: constructor and the one `fetchOpenPullRequests` call site.
- Excluded: `AttentionEngine`, `LastSeenStore`, `PullRequestCache`, `src/github/errorClassifier.ts`
  — all unchanged and forbidden to touch.
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`src/github/viewController.ts`, `src/github/viewController.test.ts`

## 8. Files Forbidden To Modify
`AttentionEngine`, `LastSeenStore`, `PullRequestCache`, `src/github/errorClassifier.ts`,
`src/github/client.ts`.

## 9. Implementation Instructions
- Responsibilities: unchanged orchestration role; only the fetch dependency changes, and — if
  needed — the thrown-error shape at the adapter boundary (see the constraint below).
- Required patterns: unchanged class shape.
- Required interfaces:
  ```ts
  export class GitHubViewController {
    constructor(
      _context: vscode.ExtensionContext,
      private readonly view: GitHubViewHost,
      private readonly authService: GitHubAuthService,
      private readonly configStore: GitHubConfigStore,
      private readonly connectionService: McpConnectionService,
      private readonly lastSeenStore: LastSeenStore,
      private readonly pullRequestCache: PullRequestCache = new PullRequestCache(),
    ) {}
    // handleMessage/refresh/getState/etc. unchanged in name and role
  }
  ```
- Algorithm:
  1. Replace `this.client.fetchOpenPullRequests(repo, session)` with
     `GithubMcpAdapter.fetchOpenPullRequests(this.connectionService, repo, session)`.
  2. **Error-shape compatibility constraint — check this, don't skip it:**
     `src/github/errorClassifier.ts` (untouched by this story) classifies a thrown error by
     inspecting a `{status, message}`-shaped object (the same shape the deleted
     `src/github/client.ts` threw). If TASK-015's `GithubMcpAdapter` instead throws a raw
     `McpToolError` (`{serverId, category, detail, resetAt}`), `ErrorClassifier.classify` will
     **not** classify it correctly, because it has no `status` field. Before finishing this
     task, run the existing `ErrorClassifier` tests against a real `GithubMcpAdapter` failure
     and confirm classification still works. If it doesn't: amend `GithubMcpAdapter`
     (TASK-015's file) so it throws `{status: <mapped from McpToolError.category:
     auth-expired→401, rate-limited→429, invalid-entry→400, network→0>, message: detail}`
     at its own boundary instead of a raw `McpToolError` — this keeps
     `src/github/errorClassifier.ts` and `GitHubFailure` entirely untouched, which is the whole
     point of this constraint. Record in `05-Implementation/notes.md` whether this amendment was
     needed, and if so, that it was made in `src/github/githubMcpAdapter.ts` (TASK-015's file),
     not in this task's own files.
  3. Everything else in `refresh()`/`handleMessage`/`getState`/etc. is unchanged.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/github/viewController.ts`; `GitHubViewController` class; GitHub-domain controller |
| Signature | constructor parameter swap only (`client` → `connectionService`); all method signatures unchanged |
| Dependencies | `GithubMcpAdapter`, `McpConnectionService` (new, replace `typeof GitHubClient`); `ErrorClassifier`, `AttentionEngine`, `LastSeenStore`, `PullRequestCache` (all unchanged) |
| Algorithm | 3 steps above — a small, surgical diff |
| Complexity budget | `refresh()` stays the same size |

**9.2 Data Access:** N/A — no database; the fetch itself is `GithubMcpAdapter`'s concern
(TASK-015), already specced.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| `Promise.allSettled` per-repo fetch/failure-isolation loop | `refresh()` (`src/github/viewController.ts:114-139`) | Reuse unchanged except the one fetch call site |
| `ErrorClassifier.classify` | `src/github/errorClassifier.ts` | Reuse unchanged — do not modify; verify compatibility per §9 step 2 instead |
| `pullRequestCache.setForRepo` write | `refresh()` (`src/github/viewController.ts:125`) | Reuse unchanged |

**9.4 Forbidden shapes:**
- Must not modify `src/github/errorClassifier.ts`, `AttentionEngine`, `LastSeenStore`, or
  `PullRequestCache` — if the error-shape mismatch in §9 step 2 is real, the fix belongs in
  `GithubMcpAdapter` (TASK-015's file), not here.

**9.5 Test cases:**
- `refresh_buildsLastFetchResult_fromAdapter` (existing test, re-verify with the adapter
  substituted)
- `refresh_perRepoFailureIsolation_oneFailureDoesNotBlockOthers` (existing test, re-verify)
- `refresh_rateLimitHandling_setsRateLimitedUntil` (existing test, re-verify — this is the test
  that most directly exercises §9 step 2's error-shape constraint)
- `refresh_writesIntoPullRequestCache` (existing test, re-verify, unchanged dependency)
- `handleMessage_dispatchesEachCommand` (existing test, re-verify, unchanged)

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
FR-012 — existing behavior preserved, including rate-limit/failure classification.

## 11. Technical Constraints
`src/github/errorClassifier.ts` must remain byte-for-byte unchanged (diff it explicitly before
declaring this task complete).

## 12. Security Constraints
standard.

## 13. Performance Constraints
standard — `Promise.allSettled` concurrency across monitored repos is unchanged.

## 14. Acceptance Criteria
All 9.5 test cases pass; `src/github/errorClassifier.ts` confirmed unmodified (diff check).

## 15. Validation Steps
Build; `npm test`.

## 16. Expected Output
`GitHubViewController` depending on `GithubMcpAdapter`/`McpConnectionService`, with the rate-
limit/failure classification pipeline intact and unmodified.

## 17. Rollback
Revert the two modified files (and `GithubMcpAdapter`'s error-boundary shape in TASK-015's file,
if that amendment was made here).

## 18. Common Mistakes
- Do not "fix" `ErrorClassifier` to accept the new error shape — fix the shape at
  `GithubMcpAdapter`'s boundary instead, so the existing classifier stays untouched.
- Do not skip actually running the rate-limit test against a real adapter failure — this is the
  one test most likely to silently pass for the wrong reason if the error shape is subtly off.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done), plus: confirm `src/github/errorClassifier.ts` diff is empty.
