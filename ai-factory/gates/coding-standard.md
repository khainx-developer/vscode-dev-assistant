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
Single deployable: one VS Code extension package (`dev-utilities`), no monorepo, no sub-packages.

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
- **Command titles** (in `package.json`): `"Dev Utilities: <Verb Noun>"` — fixed prefix, title
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
  `'Dev Utilities: '` so the source is identifiable in VS Code's notification area.

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
N/A — this extension holds no persistent state. All commands are pure text transforms on the
active editor's selection(s); nothing is read from or written to disk, settings, or
`ExtensionContext.globalState`/`workspaceState`. If a future command needs persisted state
(e.g. a remembered preference), that is a Design Decision — document the storage choice
(`globalState` vs. `workspaceState` vs. a VS Code setting) in that story's `Design.md`.

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
   `` `Dev Utilities: ${(err as Error).message}` ``. Don't add a duplicate top-level `try/catch`
   inside a new command — rely on this existing boundary for the truly-unexpected case.

## 9. Logging Conventions
No logging library or output channel is wired up yet. User-facing feedback is the error/warning
message mechanism in §8, not a log. If a future story needs diagnostic logging (not user-facing),
use a dedicated `vscode.window.createOutputChannel('Dev Utilities')` rather than `console.log`
(which is invisible to users and only visible in the Extension Host dev console) — that's a
Design Decision for whichever story first needs it.

## 10. Async Conventions
All command handlers are declared `async` and `await` their editor mutation (`editor.edit(...)`
via `transformSelections`/`insertAtCursor`), even when the handler body has no other await, so
every handler in `allCommands` has a uniform `Promise<void>` return and the registration loop in
`extension.ts` can `await command.handler(...)` uniformly. No unhandled promise rejections are
allowed to escape a handler — the registration loop's `try/catch` around the `await` is the
single catch-all (see §8); don't rely on an unguarded `.catch()` elsewhere.

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
No secrets, no `.env`, no external services — this extension makes no network calls and reads no
credentials. The only "configuration" is `package.json`'s `contributes`/`engines`/`activationEvents`
block, which is static and checked into source control. If a future command introduces a user
setting, declare it under `contributes.configuration` in `package.json` and read it once per
invocation via `vscode.workspace.getConfiguration('devUtilities')` inside the handler — don't
cache it at activation time, since the user can change settings mid-session.

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

## Amendments
If a story's Technical Design needs to deviate from this document (e.g. a module that
legitimately needs a different pattern), that deviation is a Design Decision in that story's
`Design.md`/`TechnicalDesign.md` with a stated reason — then this document is updated in the same
story to reflect the new baseline. Never diverge silently. If an unrelated future project in this
repo needs a genuinely different stack, that is itself a Design Decision to make explicitly,
replacing or forking this document with a stated reason.
