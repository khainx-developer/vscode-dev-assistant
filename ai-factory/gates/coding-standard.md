# Coding Standard — VS Code Extension (TypeScript, esbuild)

**Version**: 1.0

Unlike BRS/SDS/TDS/EPS/ITPS, this is not a per-story artifact standard, and unlike
`cis-standard.md` it is not a behavioral contract either — it's the concrete, stack-specific
style and structure reference for this project (single VS Code extension package, TypeScript,
bundled with esbuild, no runtime dependencies beyond the `vscode` API — see `DecisionLog.md` of
the story that locks this in). CIS says "follow project coding standards" — this document is
what that phrase means until the actual codebase itself becomes the authority (see
`ai-factory-technical-design` and `prompts/implementation.md`, which point here first and to the
real code second, once real code exists to diverge from this doc).

This file is **project-owned, not framework content**. It was filled in directly from this
repo's existing code (`src/extension.ts`, `src/commands/*.ts`, `src/utils/textEdit.ts`) rather
than during a story's `ai-factory-technical-design` stage, since the project already had working
conventions before the AI Factory framework was installed. Treat it as yours: if you later
re-copy framework files from a newer clone of the `ai-factory` repo, don't let that overwrite
this content — diff and merge by hand instead. See `README.md`.

## Purpose
Gives every stage that writes or reviews code — `ai-factory-technical-design` (TDS class/layer
naming), `prompts/implementation.md` (actual code), `prompts/unit-test.md` (test code),
`prompts/code-review.md` (review) — one shared, concrete answer for "how do we structure and
name things" in this project, so each story doesn't re-derive conventions from scratch and no two
stories drift into incompatible styles. Where the real codebase already does something
differently than this document by the time a story is implemented, the codebase wins (update
this document to match in that story's `DecisionLog.md`, don't silently diverge).

## 1. Solution & Project Structure
Single deployable: one VS Code extension package (`dev-assistant`), no monorepo, no sub-packages.

- `src/extension.ts` — the only activation entry point. Registers every command from
  `allCommands` in a single loop, routes errors to `vscode.window.showErrorMessage`, and does
  nothing else. New cross-cutting activation logic (status bar items, providers, etc.) is added
  here, not scattered into command files.
- `src/commandTypes.ts` — the shared `DevUtilityCommand` contract every command group implements.
- `src/commands/` — one file per feature group (`encoding.ts`, `json.ts`, `caseTransform.ts`,
  `idAndTime.ts`, ...), each exporting a `const xCommands: DevUtilityCommand[]`. `index.ts`
  re-exports the concatenation as `allCommands`.
- `src/utils/` — stateless helpers shared across command groups (`textEdit.ts`: editor
  selection/replacement helpers). Utils never import from `src/commands/`.
- `dist/` (esbuild output, gitignored) is what actually ships; `out/` (tsc output, gitignored) is
  only used for type-checking (`tsc --noEmit`) and the `@vscode/test-cli` runner.
- `src/mcp/` — the shared MCP connection layer (added by the Jira Configuration & Task Sync
  story's MCP revision): owns MCP transport, OAuth/DCR/PKCE state, and SecretStorage-backed
  token persistence for both the Atlassian and GitHub remote MCP servers. Neither `src/github/*`
  nor `src/jira/*` imports the MCP SDK directly or calls `context.secrets` for provider
  credentials — both go through `src/mcp/connectionService.ts`.
- `src/github/` — the entire GitHub Attention Inbox domain (added by the GitHub Attention Inbox
  story; its data source was later migrated to GitHub MCP by the Jira Configuration & Task Sync
  story): auth-session resolution, config, a GitHub MCP adapter (`githubMcpAdapter.ts`, replacing
  the original octokit/GraphQL client), attention computation, Last Seen store, refresh
  scheduling, error classification, and the view controller that ties them together.
- `src/jira/` — the Jira Configuration & Task Sync domain, mirroring `src/github/`'s split:
  non-secret connection store (site URL/id only — no credential), saved-query config store, an
  Atlassian MCP adapter (`atlassianMcpAdapter.ts`, replacing the original Basic-auth REST
  client), error classification, PR-link matching, and the view controller that ties them
  together. One-way, read-only dependency on `src/github/pullRequestCache.ts` for PR-linkage
  data; `src/github/*` has no dependency on `src/jira/*` in either direction.

Dependency direction: `extension.ts` → `commands/index.ts` → individual command files →
`utils/` → `vscode` API. Nothing flows backward.

## 2. Naming Conventions
- **Files**: `camelCase.ts`, named after the feature group they contain (`caseTransform.ts`,
  `encoding.ts`), not after a class (there are no classes). Test files mirror the source file
  name with a `.test.ts` suffix (see §12) under `test/` or `src/**/__tests__/` — not yet
  established in this repo; pick one and stay consistent across the first test-bearing story.
- **Command ids**: `devUtilities.<verbNoun>` in camelCase, exactly matching the id declared in
  `package.json`'s `contributes.commands` — see the comment on `DevUtilityCommand.id`. Never
  invent an id that isn't registered in `package.json`, and never register a `package.json`
  command without a matching handler.
- **Command titles** (in `package.json`): `"Dev Assistant: <Verb Noun>"` — fixed prefix, title
  case after the colon.
- **Exported command arrays**: `<group>Commands` (e.g. `encodingCommands`, `jsonCommands`),
  typed `DevUtilityCommand[]`.
- **Functions**: camelCase, verb-first (`toCamelCase`, `splitWords`, `insertAtCursor`,
  `getActiveEditorOrWarn`). Internal-only helpers (not exported) are declared above the exported
  array in the same file, e.g. `splitWords` in `caseTransform.ts`.
- **Types/interfaces**: PascalCase (`DevUtilityCommand`). No `I` prefix.
- **Variables**: camelCase; destructure from `vscode.TextEditor` (`document`, `selections`)
  rather than repeating `editor.` paths.
- **User-facing messages**: every `showErrorMessage`/`showWarningMessage` string is prefixed with
  `'Dev Assistant: '` so the source is identifiable in VS Code's notification area.

## 3. Layering & Dependency Rules
Three layers only, strictly one-directional:

1. **Entry point** (`extension.ts`) — activation, command registration, top-level error
   boundary. Must not contain feature logic.
2. **Command groups** (`src/commands/*.ts`) — one `handler` per command; may call `vscode` APIs
   directly and call into `src/utils/`. Must not import another command group file — if two
   groups need the same logic, it belongs in `src/utils/`, not in whichever group wrote it first.
3. **Utils** (`src/utils/*.ts`) — pure/stateless helpers and the only place that owns editor
   edit-building (`editor.edit(...)`) logic shared across commands. Must not import from
   `src/commands/` or depend on a specific command's behavior.

`commandTypes.ts` sits beside, not above, these layers — any file may import it.

## 4. Architecture Pattern
Plain command-registration pattern (flat array of `{id, handler}` objects consumed by one
registration loop) — no CQRS, no mediator, no DI container. This fits a stateless-utility
extension; introducing a mediator/DI layer would be over-engineering at this project's current
scope. Revisit only if commands start needing shared, non-trivial state (then: a Design Decision
in that story's `Design.md`, not an ad hoc addition).

## 5. Persistence Conventions
`src/github/lastSeenStore.ts` is the one place that reads/writes `ExtensionContext.globalState`,
keyed `"owner/repo#number"` → timestamp (number, ms since epoch). Not registered via
`setKeysForSync` (Design.md D-5). `src/github/configStore.ts` is the one place that reads/writes
`vscode.workspace.getConfiguration('devAssistant.github')`. `src/jira/connectionStore.ts` is the
one place that reads/writes `devAssistant.jira.baseUrl`/`email` settings and the
`devAssistant.jira.apiToken` secret (via `context.secrets` — see §13).
`src/jira/configStore.ts` is the one place that reads/writes
`vscode.workspace.getConfiguration('devAssistant.jira')`'s `savedQueries`. No other module
touches any of these storage surfaces directly. Outside `src/github/` and `src/jira/`, this
extension still holds no persistent state — all other commands are pure text transforms on the
active editor's selection(s). If a future command needs persisted state (e.g. a remembered
preference), that is a Design Decision — document the storage choice (`globalState` vs.
`workspaceState` vs. a VS Code setting vs. `secrets`) in that story's `Design.md`.

## 6. API Conventions
N/A (no HTTP API) — "API" here means the VS Code **command contribution surface**:
- Every command exposed to users is declared in `package.json`'s `contributes.commands` with a
  matching entry in `DevUtilityCommand[]`, and listed in `contributes.menus["devUtilities.submenu"]`
  so it appears in the editor context submenu.
- A command handler's signature is always `(editor: vscode.TextEditor, context:
  vscode.ExtensionContext) => void | Promise<void>` (`commandTypes.ts`) — never widen this
  signature per-command; if a command needs something extra, add it to the shared signature so
  every handler stays interchangeable with the registration loop in `extension.ts`.
- Handlers never call `vscode.commands.registerCommand` themselves — only `extension.ts` does,
  once, in the activation loop.

### Outbound (MCP — Jira and GitHub)
`src/mcp/connectionService.ts` is the only module permitted to import `@modelcontextprotocol/sdk`
or construct an MCP transport; it is the single outbound call boundary for both providers.
`src/github/githubMcpAdapter.ts` and `src/jira/atlassianMcpAdapter.ts` are the only modules
permitted to call `McpConnectionService.callTool(...)`, and each maps raw MCP tool results into
this codebase's existing typed domain shapes (`PullRequestSummary[]`/`JiraTask[]`) before
anything else sees them — no other module receives a raw MCP response. Direct Jira REST calls
(`fetch` against `/rest/api/3/*`) and direct `octokit`/GraphQL calls are no longer used by this
extension; see `stories/jira-configuration-sync/03-Design/TechnicalDesign.md` §2/§18 for the
migration from the original REST/octokit clients.

## 7. Validation Conventions
Input validation is inline in the handler, immediately before using the value, not pulled into a
separate validation layer (commands are small and single-purpose enough that this stays
readable). Pattern already in use (`idAndTime.ts`, `json.ts`): guard the risky operation in a
`try/catch` or an explicit check, and on failure call `vscode.window.showErrorMessage(...)` and
return the original, untouched text rather than throwing — a failed transform must never corrupt
or clear the user's selection. Exception: truly unexpected errors (not a validation failure)
propagate up to `extension.ts`'s top-level `catch`, which is the only place allowed to report a
generic/unanticipated failure.

## 8. Error Handling & Exceptions
No custom error/exception hierarchy — commands are small enough that native `Error` plus
`try/catch` at the point of risk is sufficient. Two tiers:
1. **Expected, recoverable failures** (invalid Base64, invalid JSON, invalid timestamp): caught
   inside the command's own `transform` callback, reported via `showErrorMessage` with a
   specific message, and the original text is returned unchanged — the user keeps their
   selection.
2. **Unexpected failures**: anything a handler doesn't explicitly catch bubbles up to
   `extension.ts`'s registration loop, which catches `Error` and reports
   `` `Dev Assistant: ${(err as Error).message}` ``. Don't add a duplicate top-level `try/catch`
   inside a new command — rely on this existing boundary for the truly-unexpected case.

## 9. Logging Conventions
`src/github/viewController.ts` creates and owns a single
`vscode.window.createOutputChannel('Dev Assistant')` instance (see §15 of that story's
`TechnicalDesign.md` for policy); no other module creates an output channel. Outside
`src/github/`, user-facing feedback is still the error/warning message mechanism in §8, not a
log. If a future story needs diagnostic logging (not user-facing), use a dedicated
`vscode.window.createOutputChannel(...)` rather than `console.log` (which is invisible to users
and only visible in the Extension Host dev console) — that's a Design Decision for whichever
story first needs it.

## 10. Async Conventions
All command handlers are declared `async` and `await` their editor mutation (`editor.edit(...)`
via `transformSelections`/`insertAtCursor`), even when the handler body has no other await, so
every handler in `allCommands` has a uniform `Promise<void>` return and the registration loop in
`extension.ts` can `await command.handler(...)` uniformly. No unhandled promise rejections are
allowed to escape a handler — the registration loop's `try/catch` around the `await` is the
single catch-all (see §8); don't rely on an unguarded `.catch()` elsewhere.

`src/github/*` modules follow the same `async`/`await`, no-unhandled-rejection rule as
`src/commands/*`; `viewController.ts`'s message handler is the equivalent catch boundary for
this domain (mirrors `extension.ts`'s role for commands).

## 11. Module System / Language Conventions
- TypeScript, `"strict": true`, plus `noUnusedLocals`/`noUnusedParameters` (`tsconfig.json`) —
  keep all three on; don't add `// eslint-disable` or `@ts-ignore` to work around them without a
  one-line comment stating why.
- Module system: `Node16`/`Node16` (ES module syntax in source, resolved Node16-style), compiled
  to `ES2022`. `esbuild` then bundles to a single CommonJS (`format: 'cjs'`) file for the
  extension host (`external: ['vscode']` — never bundle the `vscode` module itself).
  `import * as vscode from 'vscode'` is the required import form (not a named import) — matches
  every existing file.
- `@typescript-eslint/no-explicit-any` is deliberately **off** — `any` is permitted where VS
  Code's own API or a narrow cast makes it genuinely simpler (e.g. `(err as Error).message`), but
  don't reach for it as a default escape hatch.

## 12. Testing Conventions
- Runner: `@vscode/test-cli` + `@vscode/test-electron` (`npm test`), which runs compiled tests
  from `out/` inside a real Extension Host instance — not a unit-test runner like Jest/Mocha
  standalone, because command handlers need the real `vscode` API.
- No test files exist yet in this repo. When adding the first one: mirror the source file path
  (`src/commands/caseTransform.ts` → a test exercising `caseTransformCommands`), compiled through
  the same `tsc` pass as `src`, and drive it through the public `DevUtilityCommand.handler`
  contract (open a real/untitled document, set a selection, invoke the handler, assert on the
  document's text) rather than reaching into private helpers like `splitWords`/`toCamelCase`
  directly — those are implementation details of the command group, not part of its contract.
- Traceability rule: every Acceptance Criterion in a story's `Requirement.md` must have a
  corresponding test by stage `06-UnitTest`, covering both the success transform and its
  documented failure path (invalid input → original text preserved + specific error message).

## 13. Configuration & Secrets
`src/mcp/` is the sole owner of provider credentials. Both the GitHub Attention Inbox
(`src/github/`) and Jira Configuration & Task Sync (`src/jira/`) features make outbound calls
only through MCP tools invoked via `src/mcp/connectionService.ts`, which authorizes against the
remote Atlassian/GitHub MCP servers using browser-based OAuth (DCR + PKCE, no client secret).
`src/mcp/secretTokenStore.ts` is the only module that calls `context.secrets` for provider
credentials — `context.secrets.store('devAssistant.mcp.<serverId>.*', ...)`, read back with
`context.secrets.get(...)`, cleared with `context.secrets.delete(...)`. GitHub additionally
tries the existing `vscode.authentication` (`github`) session as a Bearer credential before
falling back to its own MCP OAuth (`src/github/auth.ts`). `secrets` is backed by the OS keychain
and is the only acceptable place in this codebase to persist a credential; never write a token
to `vscode.workspace` settings (that writes plaintext to `settings.json`). Non-secret
configuration (`devAssistant.github.monitoredRepos`/`monitoredAuthors`,
`devAssistant.jira.siteUrl`/`siteId`/`savedQueries`) remains in ordinary settings, read via
`vscode.workspace.getConfiguration(...)`.

Outside those two features, this extension makes no other network calls and reads no other
credentials. The only other "configuration" is `package.json`'s
`contributes`/`engines`/`activationEvents` block, which is static and checked into source
control. If a future command introduces a user setting, declare it under
`contributes.configuration` in `package.json` and read it once per invocation via
`vscode.workspace.getConfiguration('devUtilities')` inside the handler — don't cache it at
activation time, since the user can change settings mid-session. If a future command needs to
store a credential, use `context.secrets`, following the MCP pattern above, not a setting.

## 14. Multi-Tenancy Implementation Pattern
N/A — single-user, local VS Code extension; there is no tenancy concept.

## 15. Folder/File Conventions
- One feature group per file under `src/commands/`; a file may export multiple related commands
  (see `encoding.ts` exporting four), but don't mix unrelated feature groups in one file.
- One export per concern, not strictly one per file: a command file exports exactly one
  `const <group>Commands: DevUtilityCommand[]` array (its public surface) plus any number of
  file-local, non-exported helper functions it alone uses (e.g. `splitWords` in
  `caseTransform.ts`). A helper used by more than one command file must move to `src/utils/`
  instead of being duplicated or exported cross-file.
- `src/commands/index.ts` is the single place that aggregates all groups into `allCommands` —
  adding a new command group means adding one import + one spread line there, not editing
  `extension.ts`.
- No barrel files beyond `commands/index.ts`; `src/utils/` files are imported directly by path.

---

## Applicability
- `ai-factory-technical-design` reads this document alongside `tds-standard.md` and must not
  contradict it — TechnicalDesign.md's class/layer/naming choices for this project are this
  document applied to one story, not reinvented per story.
- `prompts/implementation.md` (Developer role) treats every rule here as part of "project coding
  standards" (`cis-standard.md`'s Fundamental Rules) — a Task Package's Developer Freedom section
  never overrides this document.
- `prompts/code-review.md` / `review-checklist.md`'s "Matches existing code conventions and
  folder structure" check means this document until the real codebase supersedes a specific rule.
- `prompts/unit-test.md` follows §12 above for this project's tests.
- `ai-factory/gates/code-spec-standard.md`'s two stack profiles — Profile B (ASP.NET Core/EF
  Core) and Profile F (React/Next.js) — do **not** apply to this project: it has no database (no
  EF Core, no SQL) and no React/Next.js frontend (its UI is inline-HTML/CSS/JS webview template
  strings owned by `src/panels/*.ts`/`src/views/SidebarProvider.ts`, not components or hooks). A
  Task Package's §9.2 Data Access Spec for this project is therefore routinely `N/A — no
  database` for most tasks; for a task whose only remote call is a single MCP tool invocation
  (`src/mcp/`, `src/github/*McpAdapter.ts`, `src/jira/*McpAdapter.ts`), write a short ad-hoc
  "remote MCP call" spec instead of forcing it into either profile's field list (purpose/caller,
  tool name, round trips, writes, skeleton — see any `stories/jira-configuration-sync/
  04-ExecutionPlan/tasks/TASK-0*.md` for the pattern already used). §9.1 Code Design, §9.3 Reuse
  Map, §9.4 Forbidden shapes, and §9.5 Test cases still apply in full regardless of profile.
- `ai-factory/checklists/registry.md`'s `dotnet` and `react-nextjs` plugins are marked `off` for
  the same reason — see that file's own note. A task/review here selects "none match" rather than
  running either plugin's Rules.

## Amendments
If a story's Technical Design needs to deviate from this document (e.g. a module that
legitimately needs a different pattern), that deviation is a Design Decision in that story's
`Design.md`/`TechnicalDesign.md` with a stated reason — then this document is updated in the same
story to reflect the new baseline. Never diverge silently. If an unrelated future project in this
repo needs a genuinely different stack, that is itself a Design Decision to make explicitly,
replacing or forking this document with a stated reason.
