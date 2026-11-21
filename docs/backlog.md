# Backlog

Single ordered list of work to do. Product rules and scope live in
[roadmap.md](roadmap.md). Last reviewed 2026-11-21 against **v0.4.0** (PR #20).

Status: Flagged/Impediment, branch ticket key status bar, working-hours auto-pause,
Run Tool…, @mention inbox wiring, acceptance criteria on cards, and PR approvals
shipped in v0.4.0. Remaining open work: Preact migration decision, Later filters/rules,
Housekeeping.

## Jira Field Spike findings

- **description**: MCP string (markdown/plain or HTML when forced); also accept ADF and flatten via `flattenAdf`; do not assume always ADF
- **issuelinks**: array of `{id, type:{id,name,inward,outward}, inwardIssue?|outwardIssue?}` with linked `status.statusCategory`
- **statusCategory**: `{id,key,colorName,name}` on status and sometimes top-level; keys `new`|`indeterminate`|`done`; JQL works
- **Flagged**: `customfield_10021`; value `[{value:"Impediment",id:"10019"}]`; JQL `flagged is not EMPTY` works
- **Acceptance criteria**: NOT a custom field on WD Story create-meta; heading in description (`## Acceptance Criteria` / `## Acceptance criteria`); else full description

## Findings: @mention detection

- Helper: `src/services/attention/mentions.ts`
- Reason ids: `jira-mentioned` / `pr-mentioned` (co-flagged with `*-awaiting-reply` when the latest comment mentions you)
- Identity: GitHub login from signed-in session (`githubState.me`); Jira display name from `devMateKit.jira.currentUser`; account id from comment text / config when present

## Decision needed

1. **Webview UI migration to Preact + JSX + TypeScript** (about 6-8 days, pilot
   about 1 day). Status: proposed, 2026-11-15. Full proposal in
   [Webview UI migration](#webview-ui-migration) below. Recommendation: do the
   1-day pilot (tool panel) before UI-heavy work if it touches the dashboard or
   sidebar heavily; otherwise defer.

## Later, only if needed

- **Inbox filters**: by repo, priority, PR vs ticket.
- **Custom attention rules**: ignore drafts, ignore or boost by label,
  configurable stale threshold (fixed at 3 days today), per-label opt-out for
  `jira-no-pr` (needs the `labels` field).

## Housekeeping

- Remove the unused `@types/jest` devDependency (tests use mocha; `tsconfig`
  has `types: ["node", "mocha"]`).
- Bundle budget for toolkit dependencies: about 56 KB of the ~100 KB left
  (`js-yaml` took about 44 KB).

---

# Webview UI migration

Status: **proposed**. Date: 2026-11-15. Scope: `src/ui/webview/**`, `esbuild.js`, a new webview `tsconfig`.

## Context

The extension host is already thin. `src/ui/webview/html.ts` emits only a shell (strict CSP with nonce, bundle CSS and JS, boot data as inert JSON). `ToolPanel`, `DashboardPanel` and `SidebarProvider` contain no markup.

All rendering happens client-side, in plain JS template literals that assign `innerHTML`:

| File | Lines |
|---|---|
| `sidebar/main.js` | 703 |
| `dashboard/main.js` | 520 |
| `shared/items.js` | 358 |
| `shared/dom.js` | 117 |
| `shared/markdown.js` | 63 |
| `tool/main.js` | 60 |
| `shared/bridge.js`, `shared/icons.js` | ~90 |
| **Total** | **~1,900** |

More features are planned, so this UI will grow, and the extension needs to stay flexible to extend. The question is whether to add a view layer to replace the string rendering, and which one.

## Problems with the current approach

1. **Escaping is manual.** Every interpolation must call `esc()` or `attrs()`. A missed call is an XSS bug. The nonce-only CSP limits the damage but does not remove the bug.
2. **Whole-tree re-render on every state message and every 60-second tick.** `renderPreserving()` restores input values, focus and caret, but not scroll position inside lists, text selection, `<select>` open state, or focus on elements without an id.
3. **Workarounds that exist only because of full re-render:**
   - the `fresh` set and `data-keep-value` attribute
   - `data-focus-key`
   - the progress-bar width set through CSSOM after render (`sidebar/main.js:472-474`)
4. **Event plumbing through `data-*` attributes.** `delegate()` plus `getAttribute()` in every handler adds about 150 lines and loses type and shape information.
5. **Files grow linearly with features.** State, markup and handlers are mixed in 500–700 line modules. The AI setup step already has 6 branches.
6. **Plain JS, untyped.** The message shapes in `src/shared/messages.ts` are not enforced in the webviews.
7. **No webview tests exist.** Tests cover services and view controllers only.

## Requirements driven by "flexible to extend"

1. Access to a large component and library ecosystem.
2. Typed code, with message types shared between host and webview.
3. A framework choice that is cheap to change later.

## Options considered

| Option | Verdict |
|---|---|
| Server-side template engine (Handlebars, EJS) in the host | Rejected. Moves the render path back into the host, adds a runtime dependency and CSP friction, and does not fix re-render state loss. |
| Auto-escaping tagged-template `html` helper only | Fallback only (about half a day). Fixes problem 1 only. |
| Preact + htm (no JSX) | Rejected as the end state. Cheapest toolchain, but no type-checked props and weaker editor support for a growing codebase. |
| **Preact + JSX + TypeScript, with a `preact/compat` alias** | **Recommended.** About 4 KB gzipped, auto-escaping, DOM diffing, hooks, type-checked props. JSX code is nearly identical under React. |
| React + JSX + TypeScript | Equivalent code, about 45 KB gzipped (`react` + `react-dom`). Choose this if a React-only library that fails under `preact/compat` is required. |
| Lit / lit-html | Viable, but the smaller ecosystem and class-based component model are a weaker fit for growing stateful forms. |

### Why Preact over React

- Each webview (sidebar, dashboard, every tool panel) loads its own bundle, so size matters more than in a normal web app.
- The hooks API (`useState`, `useReducer`, `useEffect`) matches React's.
- `preact/compat` (an esbuild alias) lets most React libraries run on Preact, including testing libraries. Libraries that rely on React internals may not work, so check each before adopting it.
- Switching to React later is mostly an import and alias change, because the JSX and hooks code is the same.

Choose React instead if a needed library is React-only and does not run under `preact/compat`, or if the team is React-only and wants the widest ecosystem.

## Decision

Adopt **Preact with JSX and TypeScript**, migrating one bundle at a time:

- esbuild: `jsx: 'automatic'`, `jsxImportSource: 'preact'`. Add an alias for `react` and `react-dom` to `preact/compat` only when a React library is actually needed.
- A `tsconfig` for `src/ui/webview/**` (DOM lib, `jsxImportSource: "preact"`), separate from the host config, with `tsc --noEmit` in the lint or compile step.
- Webview code imports message types from `src/shared/messages.ts`, so a host message change fails the webview type-check.
- Keep `bridge` (`post`, `onMessage`, `loadUiState`, `saveUiState`, `readBootData`) and the host message contract. The host side needs no changes.

## Architecture rules (to keep the view layer swappable)

1. **Logic outside components.** State, message handling and derived data (`signedIn`, `jiraConnected`, `isMine`, `jiraGroups`, pill kinds) live in plain TS modules or hooks, with no JSX and no DOM access. Components only render and call handlers.
2. **One state store per bundle.** A small store (reducer plus `useSyncExternalStore`-style subscription) fed by `onMessage`, replacing module-level `let github/jira/inbox/status/ai`.
3. **Shared component folder.** `Icon`, `Chip`, `Button`, `Banner`, `Empty`, `Field`, item cards. New features compose these instead of building strings.
4. **Typed bridge.** `post()` takes a union of outgoing messages. `onMessage` handlers are typed by incoming command.
5. **`innerHTML`-style rendering only for markdown.** The existing `renderMarkdown` escapes first, so it can render through `dangerouslySetInnerHTML` with an explicit comment. Converting it to emit vnodes costs about 1 hour more.
6. **Optional UI primitives as web components.** If native VS Code look and feel is wanted beyond the existing CSS tokens, use `@vscode-elements/elements`, which works in any framework. Do not use the archived Webview UI Toolkit.

## What goes away

`renderPreserving`, the `fresh` set, `data-keep-value`, `data-focus-key`, `attrs()`, `delegate()`, the `data-*` event plumbing, the progress-bar CSSOM hack, and `esc()` (except where the markdown renderer needs it).

**Kept:** `post`, `onMessage`, `loadUiState`, `saveUiState`, `readBootData`, `relativeTime`, `timeUntil`, `clockTime`, `plural`, `renderMarkdown`, the CSS files and tokens, and the `REASON_LABELS` import from `src/services/attention/reasonLabels`.

**CSP:** no change. `script-src 'nonce-…'` and no inline styles still hold, because Preact sets `style` props through CSSOM and JSX needs no runtime `eval`.

## Effort estimate

| Item | Estimate |
|---|---|
| Toolchain: esbuild JSX config, webview `tsconfig`, typed bridge, `preact` devDependency | 0.5 day |
| Tool panel (pilot) | 2–3 h |
| Shared components (`Icon`, `Chip`, `Button`, `Banner`, `Empty`, …), time helpers, `markdown` | 0.5 day |
| `items.js` to components (attention, PR and Jira items, details) | 1–1.5 days |
| Dashboard (about 14 components, state store, snooze menu hook) | 1.5–2 days |
| Sidebar (forms: `ghRepo`, `ghAuthor`, `jiraSite`, `jiraUser`, `jiraTeam`, `jqlLabel`, `jqlText`; AI step; setup accordion) | 2–2.5 days |
| Tests (`@testing-library/preact`, jsdom) for the sidebar form flows | 1 day |
| **Total** | **about 6–8 days** (pilot alone: about 1 day) |

## Risks and mitigations

1. **No webview tests, and the existing runner cannot run them.** `npm test` runs mocha inside the VS Code extension host (Node, no DOM). See "Repo verification" for the separate runner this needs. Add it before or during the sidebar migration, not after. If a React-only library is adopted later, the same tests carry over.
2. **Preact differs from React in small ways.** `onChange` on inputs fires on blur in the DOM, so use `onInput` for live updates. This matters for the sidebar forms and the tool filter.
3. **Typed-but-unsent input must survive host state pushes.** Stable component trees keep input state, but the edit-query reset (`jqlLabel`, `jqlText` after edit, cancel or successful save) must be verified.
4. **Behaviour that is easy to forget:** `retainContextWhenHidden`, `vscode.getState()` persistence, the Ctrl/Cmd+Enter shortcut in the tool panel, Enter-to-submit in single-line fields, arrow-key tab navigation (WAI-ARIA tabs), Escape and outside-click closing the snooze menu.
5. **`preact/compat` is not a guarantee.** Test any React library before committing to it. If one fails, switching the whole view layer to React is a contained change because of the architecture rules above.
6. **Converting to TypeScript surfaces latent type errors.** Budget some time in `items.js` and the sidebar, where the host state shapes are used loosely today.

## Plan

1. **Pilot (about 1 day).** Toolchain, typed bridge, shared components, and the tool panel. Check bundle size, CSP behaviour and the type-check step.
2. **Dashboard (about 2–3 days).** Convert `items.js` and the dashboard. It has no free-text forms, so it carries the lowest risk.
3. **Sidebar (2.5–3.5 days including tests).** Add form tests first. Convert last, since it has the forms.
4. **Cleanup (about 0.5 day).** Delete `renderPreserving`, `attrs`, `delegate` and the `data-*` conventions. Document component and state-store conventions for new features.

Each step is independently shippable because the bundles are separate entry points in `esbuild.js`.

## Repo verification (checked 2026-11-15)

| Assumption | Result |
|---|---|
| `src/shared/messages.ts` covers all webview traffic | **Yes.** `WebviewCommand` (session plus `nav.*`) and `HostEvent` include every message the sidebar and dashboard send or handle today, including `github.addResult`, `jira.connectionResult`, `jira.currentUserResult`, `jira.teamMemberResult`, `jira.queryResult` and `jira.updateQueryResult`. No gap to close before typing the bridge. |
| Type imports are safe for a DOM-targeted tsconfig | **Yes.** `messages.ts` and `reasonLabels.ts` only use `import type` from other service files, and none of the files in that chain import `vscode` (only a test file does). A webview tsconfig can include them without `@types/vscode`. Re-check this if a new type import pulls in `vscode`. |
| Test runner | **Mocha via `@vscode/test-cli`.** `npm test` runs compiled `out/**/*.test.js` inside the VS Code host (Node, no DOM). The `@types/jest` devDependency is unused (`tsconfig` has `types: ["node", "mocha"]`). jsdom component tests cannot run there. |
| Host `tsconfig` | `include: src/**/*.ts`, `lib: ["ES2022"]`, no DOM, no JSX. Webview `.ts` and `.tsx` files would be type-checked without DOM types, so the webview folder must be excluded from it. |
| Lint | `eslint src --ext ts` does not lint `.tsx`. |
| Packaging | `.vscodeignore` excludes `src/**`, and the webview bundles ship from `dist/`. No change needed. A webview `tsconfig` under `src/` is excluded automatically. |
| esbuild | `esbuild.js` already bundles each webview entry with its CSS. Entry points change from `.js` to `.tsx`, and JSX options are set in the build call, because the root `tsconfig` has no JSX settings. |

## Implementation spec

### File layout

```
src/ui/webview/
  tsconfig.json              DOM lib, jsx "react-jsx", jsxImportSource "preact", strict,
                             include: ["**/*.ts", "**/*.tsx", "../../shared/**/*.ts"]
  shared/
    bridge.ts                typed post(), onMessage(), loadUiState(), saveUiState(), readBootData()
    store.ts                 createStore(reducer, initial) -> { get, dispatch, subscribe }; useStore(store, selector)
    time.ts                  relativeTime, timeUntil, clockTime, plural (moved from dom.js)
    markdown.tsx             renderMarkdown (kept) + <Markdown text/>
    components/              Icon, Button, Chip, Banner, Empty, Field, Skeleton
    items/                   AttentionItem, CompactItem, PrItem, JiraItem, PrDetail, JiraDetail
  tool/      main.tsx  ToolApp.tsx  tool.css
  dashboard/ main.tsx  DashboardApp.tsx  state.ts  selectors.ts  components/  dashboard.css
  sidebar/   main.tsx  SidebarApp.tsx    state.ts  selectors.ts  tabs/{Home,Tools,Setup}.tsx
             setup/{GithubStep,MonitoringStep,JiraStep,AiStep}.tsx  sidebar.css
```

`state.ts` and `selectors.ts` contain no JSX and no DOM access. The host `tsconfig` adds `"exclude": ["src/ui/webview/**"]`, and the webview folder is checked by `tsc -p src/ui/webview/tsconfig.json --noEmit`.

### Typed bridge

```ts
import type { WebviewCommand, HostEvent } from '../../../shared/messages';
export function post(message: WebviewCommand): void;
export function onMessage(handler: (message: HostEvent) => void): () => void; // returns unsubscribe
```

Handlers narrow with `switch (message.command)`. Add `exhaustive` checks so a new host event fails the type-check until handled (or explicitly ignored).

### State store

Per bundle, one reducer-backed store fed by `onMessage`:

```ts
// sidebar/state.ts (shape, not final code)
interface HostState {                  // pushed by the host; replaced wholesale
  github: GitHubViewState | null;
  jira: JiraViewState | null;
  inbox: InboxState | null;
  status: SessionStatus | null;
  ai: AiViewState | null;
}
interface TransientState {             // never persisted, owned by the webview
  errors: { repo: string; author: string; jiraSite: string; jiraUser: string; jiraTeam: string; jql: string };
  editingQuery: string | null;
}
interface PersistedUi {                // saved with vscode.setState(), survives reload
  tab: SidebarTab; openStep: SetupStepId | null; toolQuery: string;
}
```

- `HostEvent` maps to actions in one reducer (`github.state` replaces `github`, `github.addResult` sets `errors.repo` or `errors.author`, and so on). This replaces the `switch` in `onMessage` today.
- Persisted UI state is saved from a store subscriber, not from every handler.
- Form field values live in the component (`useState`), not in the store. Success results (`ok: true`) clear a field by changing a `key` or by a `resetToken` counter in transient state, which replaces the `fresh` set.
- Selectors (`signedIn`, `jiraConnected`, `githubPillKind`, `jiraPillKind`, `isMine`, `jiraGroups`, `aiOn`) are pure functions of state and are unit-tested.
- Re-render batching (`scheduleRender` with `requestAnimationFrame`) is dropped. Preact already batches. The 60-second tick becomes a `useNow(60_000)` hook used only by components that show relative times.

### Test setup

- **Pure logic** (`state.ts`, `selectors.ts`, `time.ts`, markdown): plain TS, no DOM, unit tests.
- **Components** (sidebar forms first): `@testing-library/preact` with a DOM implementation (jsdom or happy-dom), run by a separate script, e.g. `npm run test:webview` using `node --test` on esbuild-bundled test files. It does not go through `@vscode/test-cli`, which has no DOM.
- Add `test:webview` and the webview `tsc` check to the checks run before a build. Remove or leave the unused `@types/jest` as a separate cleanup.
- Lint: change to `eslint src --ext ts,tsx` and fix any newly reported issues in migrated files only.

### Build changes

- `esbuild.js`: entry points `main.tsx`; add `jsx: 'automatic'`, `jsxImportSource: 'preact'`; keep `format: 'iife'`, `target: chrome114`. Add `alias: { react: 'preact/compat', 'react-dom': 'preact/compat' }` only when a React library is adopted.
- `package.json`: add `preact` (dependency bundled by esbuild, so it can also be a devDependency) and the test devDependencies. Add scripts `compile:webview` and `test:webview`, and extend `compile` to run both type-checks.

### Acceptance criteria per phase

**Phase 1 (pilot)**
- `npm run compile`, `npm run lint`, `npm run build` pass, and `tool.js` loads under the CSP with no console errors.
- The tool panel behaves as before: run, copy, error display, Ctrl/Cmd+Enter, input focus on open.
- Webview type-check passes, and a deliberate change to a `WebviewCommand` shape breaks it.
- Bundle sizes recorded (before and after) in the PR description.

**Phase 2 (dashboard)**
- Parity with the current dashboard for: tile filters, Mine only, snooze and unsnooze (including menu Escape and outside click and focus return), expandable details, Jira and team filters, AI card states (running, done, error, cancelled), paused and failure banners, and welcome state.
- Scroll position and a focused control are not lost when a host message arrives while an item is expanded.
- Reducer and selector unit tests for every `HostEvent` the dashboard handles.

**Phase 3 (sidebar)**
- Parity for all three tabs, including: arrow-key tab navigation, setup accordion default-open logic, every form (`ghRepo`, `ghAuthor`, `jiraSite`, `jiraUser`, `jiraTeam`, query add, edit, cancel, preset), Enter-to-submit, error and success feedback, and AI step branches (none, vscodeLm with each model state, cursorCli with each CLI state).
- Typed text survives unrelated host state pushes, and is cleared on a successful add and on query edit or cancel.
- Component tests for the form flows pass in `test:webview`.
- `vscode.getState()` restore works (tab, open step, tool filter).

**Phase 4 (cleanup)**
- `renderPreserving`, `attrs`, `delegate`, `esc` (outside markdown), and all `data-action` and `data-keep-value` usages are deleted.
- This document is updated with the final conventions, and `CONTRIBUTING.md` gets a short "adding webview UI" section.

## Fallback

If planned feature growth stalls, stop after step 1 and add only an auto-escaping `html` helper for the remaining string rendering. The current design is coherent, and the main risk it leaves is re-render state loss.
