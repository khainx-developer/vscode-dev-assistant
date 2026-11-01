# Implementation Task Package — TASK-009

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-009 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `src/jira/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: High priority / Medium-High complexity / Medium · Owner: Developer
  role

## 2. Objective
Create `src/jira/atlassianMcpAdapter.ts` exporting `AtlassianMcpAdapter` with `validateConnection`,
`validateQuery`, and `fetchIssues` — the Atlassian MCP-backed replacement for the deleted-in-spirit
`JiraClient`.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001, FR-003, FR-005; VR-002, VR-005
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §5, §10, §11
- Analysis: `02-Analysis/Analysis.md` — Feasibility Notes (Atlassian MCP v2 metadata: PKCE, DCR,
  `token_endpoint_auth_method: none`)
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-009

## 4. Dependencies
TASK-007 (`McpConnectionService`), TASK-008 (`JiraConnection` shape). If either is not yet
complete: **STOP** — do not start.

## 5. Scope
- Included: the three adapter methods only.
- Excluded: touching `src/jira/client.ts` (left in place, unreferenced, until TASK-014) or any
  store/controller (TASK-010..013).
Never infer scope beyond what's listed here.

## 6. Files To Create
`src/jira/atlassianMcpAdapter.ts`, `src/jira/atlassianMcpAdapter.test.ts`

## 7. Files To Modify
`DecisionLog.md` (the confirmed/best-effort tool-name finding this task's §14 requires — logging
to `DecisionLog.md` is always permitted per `ai-factory/prompts/implementation.md` step 10,
independent of a task's own file list; listed here explicitly to avoid any doubt)

## 8. Files Forbidden To Modify
`src/jira/client.ts` (leave in place, unreferenced by this file, until TASK-014).

## 9. Implementation Instructions
- Responsibilities: translate Jira use cases into Atlassian MCP tool calls; map raw tool results
  into existing `JiraTask`/connection shapes; never let a raw MCP response escape this file.
- Required patterns: plain const object (mirrors the deleted `JiraClient`'s shape, not a class).
- Required interfaces:
  ```ts
  export const AtlassianMcpAdapter = {
    async validateConnection(
      connectionService: McpConnectionService,
      siteUrl: string,
    ): Promise<{ ok: true; siteId: string } | { ok: false; reason: string }> { /* ... */ },

    async validateQuery(
      connectionService: McpConnectionService,
      siteId: string,
      jql: string,
    ): Promise<{ ok: true } | { ok: false; reason: string }> { /* ... */ },

    async fetchIssues(
      connectionService: McpConnectionService,
      siteId: string,
      jql: string,
    ): Promise<JiraTask[]> { /* ... */ },
  };
  ```
- **IMPORTANT — confirm before coding:** the tool/parameter names below
  (`getAccessibleAtlassianResources`, `searchJiraIssuesUsingJql`, `cloudId`) are the
  best-documented public names for Atlassian's remote MCP server, gathered from third-party
  documentation, not independently verified against a live `tools/list` response (Analysis.md's
  Feasibility Notes explicitly did not call any live MCP tool). Before writing the tool-call
  bodies, inspect the real `tools/list` result from the live `com.atlassian/atlassian-mcp-server`
  endpoint (via `McpConnectionService` once connected) and confirm these names and their request/
  response shape. If they differ, use the real names/shapes — the response-mapping logic below
  is what must hold, not the exact tool identifiers. Log whatever you confirm (same names, or
  different ones) to `DecisionLog.md`.
- Algorithm:
  1. `validateConnection(connectionService, siteUrl)`: call
     `connectionService.callTool('atlassian', 'getAccessibleAtlassianResources', {})`, expecting
     an array of `{ id: string; url: string; name: string }`. Normalize `siteUrl` (strip a
     trailing `/`, lowercase the host) and compare against each entry's `url`, normalized the
     same way. If found, return `{ ok: true, siteId: <that entry's id> }`. If the array is empty
     or nothing matches, return `{ ok: false, reason: 'Could not find an accessible Jira site at
     that URL.' }` (VR-002). Let any thrown `McpToolError` propagate (the caller, TASK-010,
     surfaces it as a connection failure).
  2. `validateQuery(connectionService, siteId, jql)`: call
     `connectionService.callTool('atlassian', 'searchJiraIssuesUsingJql', { cloudId: siteId,
     jql, maxResults: 1, fields: ['summary'] })`. On success, return `{ ok: true }`. Catch a
     thrown `McpToolError`: if `category === 'invalid-entry'`, return `{ ok: false, reason:
     error.detail }` (VR-005); any other category, rethrow.
  3. `fetchIssues(connectionService, siteId, jql)`: same tool call with `maxResults: 50, fields:
     ['summary', 'status', 'assignee']`. Expect `{ issues: Array<{ key: string; fields: {
     summary: string; status: { name: string }; assignee: { displayName: string } | null } }>
     }`. Map each issue to
     `{ key, summary: fields.summary, status: fields.status.name, assignee:
     fields.assignee?.displayName ?? null, url: \`${siteUrl-equivalent}/browse/${key}\`, prLink:
     { kind: 'not-available' } }` — **note**: this method does not receive `siteUrl`, only
     `siteId`; either accept `siteUrl` as a fourth parameter purely for building the `url` field
     (update the signature above if so — this is a Developer Freedom-level signature refinement,
     not a design change, since the Objective and response-mapping are unchanged) or have the
     caller (`JiraViewController`, TASK-013) fill in `url` from its own `connection.siteUrl` after
     this method returns a partial shape. Pick one, implement it consistently, and note the
     choice in `05-Implementation/notes.md` so TASK-013 matches it.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/jira/atlassianMcpAdapter.ts`; `AtlassianMcpAdapter` const object; Jira-domain MCP adapter |
| Signature | 3 methods listed above |
| Dependencies | `McpConnectionService` (passed in, not imported as a singleton), `src/jira/types.ts`'s `JiraTask` |
| Algorithm | 3 numbered steps above |
| Complexity budget | each method well under 40 lines; extract a private `mapIssue(siteUrl, rawIssue)` helper (mirrors the deleted `mapIssue` function, `src/jira/client.ts:20-28`, in spirit) |

**9.2 Data Access (remote MCP calls, not a database):**
| Field | Content |
|---|---|
| Purpose / caller | `validateConnection` confirms one accessible Jira site; `validateQuery`/`fetchIssues` run a JQL search; called by `JiraConnectionStore`/`JiraConfigStore`/`JiraViewController` (TASK-010/011/013) |
| Endpoint | `getAccessibleAtlassianResources` (no args) and `searchJiraIssuesUsingJql` (`{cloudId, jql, maxResults, fields}`) — names to confirm live, per the note above |
| Round trips | One `callTool` per method call; no loop of tool calls within a single adapter method |
| Writes | None — read-only (BR-003) |
| Skeleton | see the numbered algorithm above |

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| Issue-to-`JiraTask` mapping shape | `mapIssue` (`src/jira/client.ts:20-28`) | Mirror its field mapping (key/summary/status/assignee/url/prLink), adapted to the MCP response shape instead of the REST `SearchJqlIssue` shape |
| `JiraTask` type | `src/jira/types.ts:28-34` | Use as-is, unchanged |

**9.4 Forbidden shapes:**
- Never call a Jira write tool (create/edit/transition/comment) — BR-003.
- Never let a raw MCP tool response cross this file's boundary unmapped.

**9.5 Test cases:**
- `validateConnection_matchingSite_returnsOkWithSiteId`
- `validateConnection_noMatchingSite_returnsFailureReason`
- `validateConnection_urlNormalization_ignoresTrailingSlashAndCase`
- `validateQuery_validJql_returnsOk`
- `validateQuery_invalidJql_returnsFailureReason`
- `fetchIssues_mapsMultipleIssues_toJiraTask`
- `fetchIssues_assigneeNull_mapsToNullNotThrow`

Mock `McpConnectionService.callTool` — no live network call in unit tests.

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
BR-003 (read-only only), BR-004 (not used by this adapter — PR linkage matching lives in
`prLinkMatcher.ts`, unchanged), VR-002, VR-005.

## 11. Technical Constraints
Must not call any tool outside the two named read-only operations.

## 12. Security Constraints
standard.

## 13. Performance Constraints
standard — single bounded tool call per method, no pagination loop in this story's scope.

## 14. Acceptance Criteria
All 9.5 test cases pass; confirmed (or best-effort, logged) tool names recorded in
`DecisionLog.md`.

## 15. Validation Steps
Build; `npm test`.

## 16. Expected Output
`AtlassianMcpAdapter` const object as specified, with passing tests.

## 17. Rollback
Delete both files.

## 18. Common Mistakes
- Do not assume the documented tool names are correct without the live-confirmation step — log
  whichever turns out true.
- Do not duplicate `JiraErrorClassifier`'s category-mapping logic here — thrown `McpToolError`s
  pass through this adapter unchanged except for the one `invalid-entry` catch in
  `validateQuery`.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden), plus: the `siteUrl`-parameter-vs-caller-fills-url choice in
§9 step 3 (record the choice for TASK-013's benefit).

## 20. Completion Checklist
standard (ITPS Definition of Done), plus: tool-name confirmation logged to `DecisionLog.md`.
