# Implementation Task Package — TASK-001

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-001 · Feature: Jira Configuration & Task Sync (MCP migration) · Module: `src/mcp/`
- Checklists: none — no active checklist plugin applies to this project
  (`ai-factory/checklists/registry.md` has none active for this stack). No plugin Rules apply to
  this task.
- Priority/Complexity/Effort: High priority (foundation for everything else) / Low complexity /
  Small · Owner: Developer role · Status tracked in `05-Implementation/notes.md`

## 2. Objective
Create `src/mcp/types.ts` declaring the shared `McpServerId`, `McpToolErrorCategory`, and
`McpToolError` types used by every other `src/mcp/` module and both provider adapters.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001, FR-011, FR-013
- System Design: `03-Design/Design.md` — §6 (MCP connection layer)
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §8
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-001

## 4. Dependencies
None.

## 5. Scope
- Included: three type/interface declarations, no logic.
- Excluded: everything else in `src/mcp/`.
Never infer scope beyond what's listed here.

## 6. Files To Create
`src/mcp/types.ts`

## 7. Files To Modify
none

## 8. Files Forbidden To Modify
Anything outside `src/mcp/types.ts`.

## 9. Implementation Instructions
- Responsibilities: pure type declarations only.
- Required patterns: match this codebase's existing type-file style
  (`src/github/types.ts`/`src/jira/types.ts` — plain `export interface`/`export type`, no
  classes).
- Required interfaces:
  ```ts
  export type McpServerId = 'atlassian' | 'github';

  export type McpToolErrorCategory = 'auth-expired' | 'rate-limited' | 'invalid-entry' | 'network';

  export interface McpToolError {
    serverId: McpServerId;
    category: McpToolErrorCategory;
    detail: string;
    resetAt?: string;
  }
  ```
  Use exactly these four `McpToolErrorCategory` string values — they match the existing
  `GitHubFailureCategory` (`src/github/types.ts:76`) and `JiraFailureCategory`
  (`src/jira/types.ts:14`) string unions verbatim; do not invent new category names.
- Expected behavior: none (types only).

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:** File `src/mcp/types.ts`. No classes/functions — three type declarations as
above. No layer ambiguity (shared types file, same role as the existing `types.ts` files).

**9.2 Data Access:** N/A — no database, no remote call, type declarations only.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| Four-category failure vocabulary | `GitHubFailureCategory` (`src/github/types.ts:76`), `JiraFailureCategory` (`src/jira/types.ts:14`) | Reuse the exact same four string literals in `McpToolErrorCategory` — none exists as a *shared* type today, this task creates the first one |

**9.4 Forbidden shapes:** None task-specific; no applicable `docs/ai-learning/recurring.md`
category (file absent at planning time).

**9.5 Test cases:** None — this is a types-only file; `npm run compile` is the only verification
(no `.test.ts` for a pure type file, matching how `src/github/types.ts`/`src/jira/types.ts` have
no test files of their own today).

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
standard — no task-specific business rule.

## 11. Technical Constraints
standard.

## 12. Security Constraints
standard.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
- `npm run compile` succeeds.
- `src/mcp/types.ts` exports exactly `McpServerId`, `McpToolErrorCategory`, `McpToolError` and
  nothing else.

## 15. Validation Steps
Build (`npm run compile`).

## 16. Expected Output
`src/mcp/types.ts` exporting the three declarations above.

## 17. Rollback
Delete `src/mcp/types.ts`.

## 18. Common Mistakes
- Do not add a fifth error category "for convenience" — only the four listed are used anywhere
  in this story.
- Do not make `McpToolError` a class or give it methods — it is a plain data shape, thrown and
  caught as a plain object (matches the existing `{status,message}` throw pattern already used
  by the clients this story replaces).

## 19. Developer Freedom
standard (CIS Allowed/Forbidden).

## 20. Completion Checklist
standard (ITPS Definition of Done).
