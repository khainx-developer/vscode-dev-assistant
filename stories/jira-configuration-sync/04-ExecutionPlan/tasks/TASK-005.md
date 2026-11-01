# Implementation Task Package — TASK-005

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-005 · Feature: Jira Configuration & Task Sync (MCP migration) · Module: `src/mcp/`
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: Medium priority / Low complexity / Small · Owner: Developer role

## 2. Objective
Create `src/mcp/errorMapper.ts` exporting `McpErrorMapper.mapError`, normalizing any thrown
MCP/transport error into a shared `McpToolError` shape.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-010
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §12
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-005

## 4. Dependencies
TASK-001.

## 5. Scope
- Included: one classification function.
- Excluded: anything about redacting or retry policy (callers' job).
Never infer scope beyond what's listed here.

## 6. Files To Create
`src/mcp/errorMapper.ts`, `src/mcp/errorMapper.test.ts`

## 7. Files To Modify
none

## 8. Files Forbidden To Modify
Anything outside the two files above.

## 9. Implementation Instructions
- Responsibilities: classify one thrown error into one `McpToolError`.
- Required patterns: mirrors `src/jira/errorClassifier.ts`'s existing shape-inspection style
  (check `status` first, then provider-specific fields, then fall through to `network`).
- Required interfaces:
  ```ts
  export const McpErrorMapper = {
    mapError(serverId: McpServerId, error: unknown): McpToolError { /* ... */ },
  };
  ```
- Algorithm:
  1. If `error` has a numeric `status` field (the `{status, message}` shape already thrown by
     the deleted `src/jira/client.ts`/`src/github/client.ts`, and reused by TASK-006/007's
     transport-level errors): `401` → `auth-expired`; `429` → `rate-limited` (if a
     `retryAfter`/`resetAt` field is present on the error, compute `resetAt` the same way
     `src/jira/errorClassifier.ts:17-19` does); `400`/`404` → `invalid-entry`; any other status →
     `network`.
  2. Else if `error` has a numeric `code` field and a `message` string (MCP JSON-RPC error
     shape): if `code === -32001` or `message` contains "unauthorized"/"unauthenticated"
     (case-insensitive) → `auth-expired`; otherwise → `invalid-entry`.
  3. Else → `network`, with `detail` set to `(error as Error)?.message ?? 'Unknown MCP error'`.
  4. Always set `serverId` on the returned object. Never copy any header/token value into
     `detail` — only the message text.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/mcp/errorMapper.ts`; `McpErrorMapper` const object; connection-layer error normalizer |
| Signature | `mapError(serverId: McpServerId, error: unknown): McpToolError` |
| Dependencies | `src/mcp/types.ts` only |
| Algorithm | 4 numbered steps above |
| Complexity budget | well under 40 lines, no extraction needed |

**9.2 Data Access:** N/A — pure function, no I/O.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| Status-to-category mapping shape | `JiraErrorClassifier.classify` (`src/jira/errorClassifier.ts:3-28`) | Mirror its `status`-inspection structure and `resetAt` computation (lines 17-19), generalized to also handle an MCP JSON-RPC error shape |

**9.4 Forbidden shapes:** Never include a raw header object or token value in `detail` (no
applicable `recurring.md` category — file absent at planning time).

**9.5 Test cases:**
- `mapError_status401_authExpired`
- `mapError_status429WithRetryAfter_rateLimitedWithResetAt`
- `mapError_status429WithoutRetryAfter_rateLimitedNoResetAt`
- `mapError_status400_invalidEntry`
- `mapError_status404_invalidEntry`
- `mapError_status500_network`
- `mapError_jsonRpcUnauthorizedCode_authExpired`
- `mapError_jsonRpcOtherCode_invalidEntry`
- `mapError_unknownShape_network`
- `mapError_alwaysSetsServerId`

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
FR-010 — per-query/per-repo failure isolation depends on this classification being correct.

## 11. Technical Constraints
standard.

## 12. Security Constraints
Never include a token or header value in `detail`.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
All 9.5 test cases pass.

## 15. Validation Steps
Build; `npm test`.

## 16. Expected Output
`McpErrorMapper` const object as specified, with passing tests.

## 17. Rollback
Delete both files.

## 18. Common Mistakes
- Do not duplicate this classification logic inside `src/jira/errorClassifier.ts` or a GitHub
  adapter — TASK-012/015/017 call through this mapper (directly or via the adapter boundary),
  they do not re-implement it.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done).
