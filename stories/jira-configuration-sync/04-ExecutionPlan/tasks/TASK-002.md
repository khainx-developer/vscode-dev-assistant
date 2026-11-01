# Implementation Task Package — TASK-002

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-002 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  `package.json` dependencies
- Checklists: none match (see TASK-001's note on the registry/stack mismatch — same reasoning
  applies to every task in this story).
- Priority/Complexity/Effort: High priority (blocks every later task) / Low complexity / Small ·
  Owner: Developer role

## 2. Objective
Add `@modelcontextprotocol/sdk` as a pinned runtime dependency, and determine (not guess) whether
it needs the same ESM dynamic-import workaround the codebase already uses for `octokit`.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001, FR-013
- Technical Design: `03-Design/TechnicalDesign.md` — §25 (Implementation Constraints), §24 (OTQ-4)
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-002

## 4. Dependencies
None.

## 5. Scope
- Included: adding exactly one dependency; determining its module format.
- Excluded: writing any code that imports it (TASK-006/007).
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`package.json`, `package-lock.json`, `DecisionLog.md` (the ESM/CJS finding this task's §14
requires — logging to `DecisionLog.md` is always permitted per
`ai-factory/prompts/implementation.md` step 10, independent of a task's own file list; listed
here explicitly to avoid any doubt)

## 8. Files Forbidden To Modify
Any other `dependencies`/`devDependencies` entry.

## 9. Implementation Instructions
- Responsibilities: dependency management only.
- Required patterns: pin an exact version (no `^`, `~`, `latest`, `*`) — matches this project's
  existing care around dependency pinning (`octokit: "^4.0.0"` is actually a caret range today,
  but TechnicalDesign.md §25 explicitly requires an exact pin for the *new* MCP dependency — do
  not copy the caret-range style for this one).
- Required interfaces: N/A.
- Expected behavior: `npm install` succeeds; the package is importable.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:** N/A — no new type/function/component; this task only edits `package.json`
and runs `npm install`.

**9.2 Data Access:** N/A — no database, no remote call.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| ESM-only package workaround pattern | dynamic `import('octokit')` in `createOctokit` (`src/github/client.ts:17-20`), with its explaining comment at `src/github/client.ts:9-11` | If the installed `@modelcontextprotocol/sdk` version is also ESM-only, TASK-007 reuses this exact pattern — this task's job is only to determine which case applies and record it, not to write the import |

**9.4 Forbidden shapes:** Do not add a floating version range for this dependency (project
convention elsewhere uses `^`, but TechnicalDesign.md §25 overrides that for this one package).

**9.5 Test cases:** None (dependency-only change) — verification is `npm install` + `npm run
compile` succeeding.

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
standard.

## 11. Technical Constraints
Must pin an exact version, not a range (TechnicalDesign.md §25).

## 12. Security Constraints
standard.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
- `npm install` completes with no errors.
- `npm run compile` still succeeds (nothing imports the SDK yet).
- `DecisionLog.md` has a new entry stating: the exact pinned version, and whether the installed
  package is ESM-only or has a usable CJS build for this project's `esbuild`/`format: cjs`
  bundle target (check the package's own `package.json` `"type"`/`"exports"` fields and its
  published `dist` layout — don't assume from memory).

## 15. Validation Steps
`npm install`; Build (`npm run compile`).

## 16. Expected Output
`package.json`/`package-lock.json` updated with the pinned dependency; `DecisionLog.md` entry
recording the ESM/CJS finding.

## 17. Rollback
`npm uninstall @modelcontextprotocol/sdk`; revert `package.json`/`package-lock.json`.

## 18. Common Mistakes
- Do not skip checking the ESM/CJS shape "because it'll probably be fine" — TASK-007 needs this
  answer before it writes its import, and re-deriving it there wastes a task.
- Do not add the dependency with a `^`/`~` range.

## 19. Developer Freedom
`standard`, plus: choosing the exact version to pin is explicitly delegated (TechnicalDesign.md
§26) — pick the latest stable release at implementation time.

## 20. Completion Checklist
standard (ITPS Definition of Done), plus: ESM/CJS finding logged to `DecisionLog.md`.
