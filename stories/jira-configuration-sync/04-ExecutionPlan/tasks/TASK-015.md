# Implementation Task Package — TASK-015

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-015 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/github/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: High priority / High complexity / Medium-Large · Owner: Developer
  role

## 2. Objective
Create `src/github/githubMcpAdapter.ts` exporting `GithubMcpAdapter` with `validateRepo`,
`validateAuthor`, `fetchOpenPullRequests`, and `getRateLimitStatus` — the exact method names
`GitHubClient` exposes today, now backed by GitHub MCP.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-008, FR-012; AC-015
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §5, §17, §21
- Analysis: `02-Analysis/Analysis.md` — Feasibility Notes (GitHub MCP's `list_pull_requests`,
  `pull_request_read`, `get_label` read-only tools)
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-015

## 4. Dependencies
TASK-007. If not yet complete: **STOP** — do not start.

## 5. Scope
- Included: the four adapter methods only.
- Excluded: touching `src/github/client.ts` (left in place, unreferenced, until TASK-018) or any
  store/controller (TASK-016/017).
Never infer scope beyond what's listed here.

## 6. Files To Create
`src/github/githubMcpAdapter.ts`, `src/github/githubMcpAdapter.test.ts`

## 7. Files To Modify
`DecisionLog.md` (the confirmed/best-effort tool-name/parameter finding this task's §14 requires
— logging to `DecisionLog.md` is always permitted per `ai-factory/prompts/implementation.md`
step 10, independent of a task's own file list; listed here explicitly to avoid any doubt)

## 8. Files Forbidden To Modify
`src/github/client.ts`, `src/github/types.ts`, `src/github/attentionEngine.ts`.

## 9. Implementation Instructions
- Responsibilities: translate the existing four GitHub client operations into GitHub MCP tool
  calls; map results into the existing `PullRequestSummary`/`boolean`/`RateLimitStatus` shapes.
- Required patterns: plain const object (mirrors the deleted `GitHubClient`, same four method
  names/signatures the existing callers already use).
- Required interfaces:
  ```ts
  export const GithubMcpAdapter = {
    async validateRepo(
      connectionService: McpConnectionService,
      repo: MonitoredRepo,
      session: GitHubSession,
    ): Promise<boolean> { /* ... */ },

    async validateAuthor(
      connectionService: McpConnectionService,
      author: MonitoredAuthor,
      session: GitHubSession,
    ): Promise<boolean> { /* ... */ },

    async fetchOpenPullRequests(
      connectionService: McpConnectionService,
      repo: MonitoredRepo,
      session: GitHubSession,
    ): Promise<PullRequestSummary[]> { /* ... */ },

    async getRateLimitStatus(
      connectionService: McpConnectionService,
      session: GitHubSession,
    ): Promise<RateLimitStatus> { /* ... */ },
  };
  ```
- **Session-first, MCP-OAuth-fallback (Design.md §4) — implement this once as a private
  helper and reuse it from every method:**
  ```ts
  async function callWithSessionFallback(
    connectionService: McpConnectionService,
    session: GitHubSession,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      return await connectionService.callTool('github', name, args, {
        extraHeaders: { Authorization: `Bearer ${session.accessToken}` },
      });
    } catch (error) {
      if ((error as McpToolError).category !== 'auth-expired') throw error;
      await connectionService.connect('github');
      return await connectionService.callTool('github', name, args);
    }
  }
  ```
  Exactly one retry — never loop.
- **IMPORTANT — confirm before coding:** `list_pull_requests`, `pull_request_read`, and
  `get_label` are grounded in Analysis.md's Feasibility Notes (from GitHub's public MCP server
  source), but the exact parameter name `pull_request_read` uses to select which data to return
  (details vs. status vs. reviews vs. comments vs. check runs) was **not** confirmed by
  Analysis.md. Confirm it against the live `tools/list` response before writing this call; if it
  differs from what's assumed below, use the real shape. Log the confirmed parameter name to
  `DecisionLog.md`.
- Algorithm:
  1. `fetchOpenPullRequests(connectionService, repo, session)`: call
     `callWithSessionFallback(..., 'list_pull_requests', { owner: repo.owner, repo: repo.repo,
     state: 'open' })`, expecting an array of PR summaries (number/title/url/author/state/
     draft/merged/created/updated per Analysis.md). Filter out drafts (matches the deleted
     client's `.filter((node) => !node.isDraft)`). For each remaining PR, concurrently
     (`Promise.all`) call `callWithSessionFallback(..., 'pull_request_read', { owner, repo,
     pullNumber: pr.number, <the confirmed parameter selecting status+reviews+comments+checks>
     })`. Once per unique label name across all fetched PRs, concurrently call
     `callWithSessionFallback(..., 'get_label', { owner, repo, name: labelName })` for its color.
     Map every field into `PullRequestSummary` (`repoKey`, `number`, `title`, `url`, `author`,
     `state`, `mergedAt`, `createdAt`, `updatedAt`, `mergeable`, `labels` (name+color),
     `checkStatus`, `reviews` (author/state/submittedAt), `comments`, requested reviewers) —
     mirror the deleted `fetchOpenPullRequests`'s mapping (`src/github/client.ts`, the
     `.map((node) => ({...}))` block) field-for-field, sourcing each field from whichever MCP
     tool call actually returns it.
  2. `validateRepo(connectionService, repo, session)`: Analysis.md did not confirm a dedicated
     repo-lookup MCP tool. Check the live `tools/list` for a read-only repo-lookup tool (e.g. a
     `get_repository`-shaped tool); if one exists, call it and treat a not-found-shaped MCP
     error as `false`, any success as `true`. If no such tool exists, fall back to calling
     `list_pull_requests` with `{ owner: repo.owner, repo: repo.repo }` and treating a
     not-found-shaped error the same way (existence, not PR count, is what's being checked —
     any successful response, even an empty PR list, means the repo exists and is accessible).
     **Do not invent a tool name with unverified fields** — if neither a dedicated lookup tool
     nor this fallback is viable live, stop and escalate (Blocking Condition) rather than always
     returning `true`.
  3. `validateAuthor(connectionService, author, session)`: same approach — check for a
     read-only user-lookup tool (e.g. `get_me`/`search_users`-shaped); if none, escalate rather
     than guess. Do not reuse `list_pull_requests` for this one (it doesn't look up a user by
     itself).
  4. `getRateLimitStatus(connectionService, session)`: check the live `tools/list` for a
     read-only rate-limit/quota tool; if one exists, call it and map to `{remaining, resetAt}`.
     If none exists, return `{ remaining: Infinity, resetAt: new Date(0).toISOString() }` and
     log (output channel or `DecisionLog.md`) that the tool is unavailable. **This method's
     result is not currently consumed anywhere in `GitHubViewController`** (confirmed by reading
     `src/github/viewController.ts` — rate-limiting there is inferred from a fetch failure's
     `resetAt`, not from a proactive `getRateLimitStatus` call) — TASK-017 must not introduce a
     new caller of it; this method exists only to keep `GitHubClient`'s full public surface
     available for any caller that might appear later.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/github/githubMcpAdapter.ts`; `GithubMcpAdapter` const object; GitHub-domain MCP adapter |
| Signature | 4 public methods + 1 private `callWithSessionFallback` helper, all listed above |
| Dependencies | `McpConnectionService` (passed in), `src/github/types.ts`'s `PullRequestSummary`/`RateLimitStatus`/`GitHubSession`/`MonitoredRepo`/`MonitoredAuthor`, `src/mcp/types.ts`'s `McpToolError` |
| Algorithm | 4 numbered steps above |
| Complexity budget | `fetchOpenPullRequests` is the largest method; extract a private `mapPullRequest(listEntry, detail, labelColors)` helper to stay under ~40 lines in the main method |

**9.2 Data Access (remote MCP calls, not a database):**
| Field | Content |
|---|---|
| Purpose / caller | `fetchOpenPullRequests` answers "what are this repo's open PRs, with full detail"; called by `GitHubViewController` (TASK-017). `validateRepo`/`validateAuthor` answer "does this exist/is it accessible"; called by `GitHubConfigStore` (TASK-016) |
| Endpoint | `list_pull_requests`, `pull_request_read`, `get_label` (names grounded in Analysis.md; confirm live before coding, per the note above) |
| Dependencies / waterfalls | `list_pull_requests` must complete before the per-PR `pull_request_read` calls (dependent fetch); all per-PR `pull_request_read` calls run in parallel via `Promise.all`, as do the per-unique-label `get_label` calls — no sequential loop over PRs |
| Round trips | 1 (`list_pull_requests`) + N (`pull_request_read`, one per non-draft PR, parallel) + M (`get_label`, one per unique label, parallel) — bounded by the repo's actual open-PR/label count, never re-fetched inside a loop |
| Writes | None — read-only (BR-003) |
| Skeleton | see the numbered algorithm above |

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| PR mapping field list | `fetchOpenPullRequests`'s `.map((node) => ({...}))` block (`src/github/client.ts`, tail of the file) | Mirror every field, re-sourced from MCP tool responses instead of the GraphQL node shape |
| Draft filtering | `.filter((node) => !node.isDraft)` (same location) | Reuse unchanged logic, applied to the MCP list response |
| `PullRequestSummary`/`RateLimitStatus` types | `src/github/types.ts:42-58,85-88` | Use as-is, unchanged |

**9.4 Forbidden shapes:**
- Never call a GitHub write tool — BR-003.
- Never retry the auth-fallback more than once (no retry loop).
- Never invent a repo/user-lookup tool name with unverified fields (§9 step 2/3) — escalate
  instead if none exists.

**9.5 Test cases:**
- `fetchOpenPullRequests_sessionBearerPath_succeedsWithoutCallingConnect`
- `fetchOpenPullRequests_authExpired_triggersExactlyOneConnectAndRetry` (assert `connect` is
  called once, not in a loop, on a second failure)
- `fetchOpenPullRequests_mapsMultiplePrs_filtersDrafts_attachesLabelColors`
- `validateRepo_found_returnsTrue`
- `validateRepo_notFound_returnsFalse`
- `validateAuthor_found_returnsTrue`
- `validateAuthor_notFound_returnsFalse`
- `getRateLimitStatus_noToolAvailable_returnsPlaceholderAndLogs` (if that's the live finding) or
  `getRateLimitStatus_toolAvailable_mapsRemainingAndResetAt` (if a tool is found) — write
  whichever matches what was actually confirmed live

Mock `McpConnectionService.callTool`/`connect` — no live network call in unit tests.

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
BR-003 (read-only only).

## 11. Technical Constraints
Must preserve every field `AttentionEngine` consumes today (AC-015) — do not drop a field
because one MCP tool call didn't return it; find the call that does.

## 12. Security Constraints
Never log the session's `accessToken`.

## 13. Performance Constraints
Per-PR and per-label calls must run concurrently (`Promise.all`), never in a sequential loop
(TechnicalDesign.md §17/§21).

## 14. Acceptance Criteria
All 9.5 test cases pass; confirmed (or best-effort, logged) tool names/parameters recorded in
`DecisionLog.md`, flagged for AC-015's live parity check.

## 15. Validation Steps
Build; `npm test`.

## 16. Expected Output
`GithubMcpAdapter` const object as specified, with passing tests.

## 17. Rollback
Delete both files.

## 18. Common Mistakes
- Do not fetch per-PR detail sequentially — use `Promise.all`.
- Do not guess a repo/user-lookup tool's field names if none is confirmed live — escalate
  instead (this is explicitly allowed to be a Blocking Condition for this task).
- Do not introduce a new caller of `getRateLimitStatus` — it has none today.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden), plus: naming of the extracted `mapPullRequest` helper.

## 20. Completion Checklist
standard (ITPS Definition of Done), plus: tool-name/parameter confirmation logged to
`DecisionLog.md`.
