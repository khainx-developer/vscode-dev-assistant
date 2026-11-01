# Implementation Task Package — TASK-019

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task.

## 1. Package Information
- Task ID: TASK-019 · Feature: Jira Configuration & Task Sync (MCP migration) · Module:
  extension wiring (`src/extension.ts`, `src/panels/*`, `src/views/SidebarProvider.ts`)
- Checklists: none match (see TASK-001's note).
- Priority/Complexity/Effort: Medium priority / Medium complexity / Medium · Owner: Developer
  role

## 2. Objective
Construct one `McpConnectionService` in `extension.ts` and wire it through both adapters into
every place that previously held a direct reference to `JiraClient`/`GitHubClient`.

## 3. Background
- Business Requirement: `01-Requirement/Requirement.md` — FR-001, FR-012, FR-013
- Technical Design: `03-Design/TechnicalDesign.md` — §2, §14
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — TASK-019

## 4. Dependencies
TASK-013, TASK-016, TASK-017. If any is not yet complete: **STOP** — do not start.

(Amended — see `DecisionLog.md`'s "Circular dependency between TASK-019 and TASK-014/018
resolved" entry: the original list also named TASK-014/TASK-018, but those two tasks cannot
complete until *this* task removes the dangling `JiraClient`/`GitHubClient` imports from the
wiring files — a genuine cycle. TASK-019 only actually needs the domain work (013/016/017) to be
done; it does not need `client.ts`/`client.test.ts` to already be deleted, since step 1 below
removes the import regardless of whether the target file still exists. TASK-014/018 have been
amended in turn to depend on this task instead.)

## 5. Scope
- Included: `extension.ts`'s `activate`/`deactivate`, and the `jiraServices`/`GitHubServices`
  bag types + their one `client`/`connectionService` field in `DashboardPanel.ts`,
  `JiraDashboardPanel.ts`, `SidebarProvider.ts`.
- Excluded: `src/commands/*`, `ToolPanel.ts`, any logic inside `src/mcp/`, `src/jira/`,
  `src/github/` beyond the import/type changes this wiring requires.
Never infer scope beyond what's listed here.

## 6. Files To Create
none

## 7. Files To Modify
`src/extension.ts`, `src/panels/DashboardPanel.ts`, `src/panels/JiraDashboardPanel.ts`,
`src/views/SidebarProvider.ts`

## 8. Files Forbidden To Modify
`src/commands/*`, `src/panels/ToolPanel.ts`, anything inside `src/mcp/`, `src/jira/`,
`src/github/` beyond each file's one `client`/`JiraClient`/`GitHubClient` type reference.

## 9. Implementation Instructions
- Responsibilities: wiring only — no new business logic.
- Algorithm (`src/extension.ts.activate`):
  1. Remove `import { JiraClient } from './jira/client';` and
     `import { GitHubClient } from './github/client';` (already compile errors at this point,
     since TASK-014/018 deleted their targets — this task's job is to remove the dangling
     imports, not to have caused them).
  2. Add `import { McpConnectionService } from './mcp/connectionService';`.
  3. Construct `const connectionService = new McpConnectionService(context);` once, near the
     existing `const authService = new GitHubAuthService();` line.
  4. Replace `new JiraConnectionStore(context, JiraClient)` with
     `new JiraConnectionStore(context, connectionService)`.
  5. Replace `new JiraConfigStore(jiraConnectionStore, JiraClient)` with
     `new JiraConfigStore(jiraConnectionStore, connectionService)`.
  6. In the `jiraServices` object literal, replace the `client: JiraClient` field with
     `connectionService` (i.e. `jiraServices = { connectionStore: jiraConnectionStore,
     configStore: jiraConfigStore, connectionService, pullRequestCache, outputChannel:
     jiraOutputChannel }`).
  7. Replace `new GitHubConfigStore(authService, GitHubClient)` with
     `new GitHubConfigStore(authService, connectionService)`.
  8. Every `GitHubServices`-shaped object literal passed to `SidebarProvider`'s constructor and
     `DashboardPanel.createOrShow` (currently `{ authService, configStore, client: GitHubClient,
     lastSeenStore, pullRequestCache }`) becomes `{ authService, configStore, connectionService,
     lastSeenStore, pullRequestCache }`.
  9. Add, in `deactivate()`: `void connectionService.dispose();` (or register
     `context.subscriptions.push({ dispose: () => connectionService.dispose() })` in `activate`
     instead — pick one, not both, and be consistent).
- Algorithm (`src/panels/DashboardPanel.ts`, `src/panels/JiraDashboardPanel.ts`,
  `src/views/SidebarProvider.ts`): in each file's own services-bag interface (`GitHubServices`
  in `DashboardPanel.ts`; the inline `jiraServices` parameter type in `JiraDashboardPanel.ts`;
  both in `SidebarProvider.ts`), rename the `client: typeof GitHubClient` /
  `client: typeof JiraClient` field to `connectionService: McpConnectionService`, and update the
  import at the top of the file from `'../github/client'`/`'../jira/client'` to
  `'../mcp/connectionService'`. Update the one place each file constructs a `GitHubViewController`/
  `JiraViewController` to pass `services.connectionService` in the constructor-argument position
  that used to hold `services.client`.

### 9.1-9.5 Code & Data Access Spec
**9.1 Code Design:**
| Field | Content |
|---|---|
| File & type | `src/extension.ts` (activation wiring), `src/panels/DashboardPanel.ts`, `src/panels/JiraDashboardPanel.ts`, `src/views/SidebarProvider.ts` (services-bag type + one constructor-arg each) |
| Signature | no new function — existing `activate`/`deactivate`/`createOrShow`/constructor signatures keep their shape; only the one `client`/`connectionService` field/argument changes |
| Dependencies | `McpConnectionService` (TASK-007), `JiraConnectionStore`/`JiraConfigStore` (TASK-010/011), `GitHubConfigStore` (TASK-016), `GitHubViewController`/`JiraViewController` (TASK-013/017) |
| Algorithm | 9 steps for `extension.ts`, 1 step (repeated per file) for the three UI-host files, both listed above |
| Complexity budget | no method grows — this is a renaming/wiring change, not new logic |

**9.2 Data Access:** N/A — no database, no remote call; this task only constructs and passes
objects.

**9.3 Reuse Map:**
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| Activation wiring shape | `src/extension.ts:16-77` (pre-migration) | Reuse the exact same construction/wiring order, substituting `connectionService` for the two deleted clients |
| `GitHubServices` bag type | `src/panels/DashboardPanel.ts:12-17` | Rename its `client` field's type, nothing else |
| `jiraServices` bag shape | `src/extension.ts:42-48` (pre-migration), `src/panels/JiraDashboardPanel.ts` | Rename its `client` field, nothing else |

**9.4 Forbidden shapes:** Must not introduce a second `McpConnectionService` instance — exactly
one per extension activation, shared by both domains.

**9.5 Test cases:** None of these four files has an existing `.test.ts` (matches current
convention — they're thin wiring/webview-host files); verification is the build + manual smoke
below, not a unit test.

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
FR-001, FR-012, FR-013.

## 11. Technical Constraints
Exactly one `McpConnectionService` instance per activation.

## 12. Security Constraints
standard.

## 13. Performance Constraints
standard.

## 14. Acceptance Criteria
`npm run compile` succeeds for the whole project; `npm test` passes for the whole project; the
Extension Development Host activates without throwing and both panels render their setup/empty
states.

## 15. Validation Steps
Build; `npm test` (full suite); manual: launch the Extension Development Host, open the Jira
panel and the GitHub dashboard, confirm both render their setup/empty states without throwing. A
full OAuth round-trip against the live MCP endpoints is AC-015/OTQ-1's live validation, covered
in `06-UnitTest`/`07-CodeReview` — not required for this task's own validation.

## 16. Expected Output
`extension.ts` and the three UI-host files compiling and activating with the new wiring; no
remaining reference to either deleted client anywhere in the project.

## 17. Rollback
Revert the four modified files.

## 18. Common Mistakes
- Do not construct a second `McpConnectionService` for the GitHub side "to be safe" — one
  shared instance is the whole point of the connection layer (FR-013).
- Do not forget to dispose the connection service on deactivation.

## 19. Developer Freedom
standard (CIS Allowed/Forbidden), plus: choosing `context.subscriptions.push` vs. a direct
`deactivate()` call for disposal (§9).

## 20. Completion Checklist
standard (ITPS Definition of Done), plus: whole-project build/test green; manual smoke confirmed.
