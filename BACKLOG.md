# Agent Prompt — Professional DevMate Kit Redesign

> Copy everything below the line into a new Agent chat (or run against this repo).  
> The prompt is self-contained: **do not ask the user clarifying questions** unless a hard blocker makes progress impossible. Prefer sensible defaults documented here.

---

## Mission

Transform **DevMate Kit** (`devmate-kit`, publisher `khainx-developer`) from a working but rough internal toolkit into a **professional, marketable VS Code extension** you would confidently introduce to teammates, managers, and the Marketplace audience.

Deliverables must feel polished: clear UX, maintainable architecture, real AI value, and production-ready docs/packaging. Preserve existing working behavior (GitHub PR tracking, Jira tasks, Attention Inbox, text utilities, MCP OAuth) unless this prompt explicitly replaces it.

**Success bar:** a new user can install the extension, understand what it does in under 30 seconds, complete GitHub + Jira setup without reading external docs, and immediately see actionable work in an Attention-first dashboard.

### HARD CONSTRAINT — Do not break GitHub / Jira MCP authentication

GitHub and Jira auth **already work** via MCP OAuth. This redesign must treat that stack as sacred production code.

**Protected modules (refactor only with behavior-preserving moves; no protocol rewrites):**
- `src/infrastructure/mcp/connectionService.ts`
- `src/infrastructure/mcp/oauthClientProvider.ts`
- `src/infrastructure/mcp/secretTokenStore.ts`
- `src/infrastructure/mcp/loopbackRedirect.ts`
- `src/infrastructure/mcp/errorMapper.ts`
- `src/infrastructure/github/auth.ts` + `githubMcpAdapter.ts`
- `src/infrastructure/jira/connectionStore.ts` + `atlassianMcpAdapter.ts`
- `.mcp.json` server URLs / ids

**Rules:**
1. Do **not** replace MCP with raw REST, change OAuth callback/loopback flow, token storage keys, server ids, or auth headers “for cleanliness.”
2. UI/architecture refactors may *call* these services through a new `DashboardSession` / state machine **wrapper**, but the underlying connect → authorize → `callTool` path must stay equivalent.
3. Existing MCP unit tests must keep passing; add regression coverage if you touch wrappers around auth.
4. Manual smoke still required after UI work: GitHub sign-in, Jira connect/disconnect, token persistence across reload, refresh after reconnect.
5. If a refactor risks auth, **stop and keep the old path** — polish UI around it instead of “improving” OAuth.

---

## Product positioning (keep this sharp)

**One-liner:** Daily work radar for developers — GitHub PRs + Jira issues that need *your* attention, inside VS Code, with optional AI summaries (via the host Language Model API).

**Primary job:** Answer “What should I do next?” without leaving the editor.

**Secondary job:** Quick text utilities (Base64, URL, JSON, UUID, timestamps, case) — keep them, but they must not dominate the product story.

**Non-goals for this redesign:**
- Do not build a full GitHub/Jira client (no create-issue forms, no full PR editor, no project boards).
- Do not add new SaaS backends or custom AI servers — use VS Code APIs + existing MCP adapters only.
- Do not rewrite in another language or migrate off TypeScript/esbuild.
- Do not introduce React/Vue/Svelte unless you can justify a *small* webview UI kit; prefer lightweight modular HTML/CSS/TS that matches VS Code theming.
- Do not implement full CQRS, Event Sourcing, Redux, or a generic plugin framework — see Architecture below.

---

## Current codebase (facts — use these, don’t rediscover)

### What it already does well
- Layered layout documented in `CONTRIBUTING.md`: `ui/` → `services/` → `infrastructure/` → `shared/`.
- GitHub + Jira via MCP (`McpConnectionService`, GitHub/Atlassian adapters, OAuth).
- Attention Inbox (`attentionInboxBuilder`, `attentionEngine`, comment read state, staleness, merge conflicts, checks failing, due dates).
- Daily Tasks dashboard panel + sidebar webview + “Other Tools” + Configuration.
- Text utilities as commands + `ToolPanel` + `toolRegistry`.
- Settings for GitHub monitored repos/authors, Jira site/user/team/JQL, AI provider/model (`devMateKit.ai.*`).
- Tests colocated as `*.test.ts`; esbuild bundling; Marketplace packaging via `@vscode/vsce`.

### Pain points to fix (observed)
1. **UI is dense and self-explanatory poorly:** sidebar tabs (“Daily Tasks / Other Tools / Configuration”) bury the value; Daily tab is mostly a card that opens another panel; first-run empty states don’t guide setup.
2. **Giant inline webviews:** `DashboardPanel.ts` (~1100+ lines) and `SidebarProvider.ts` (~860+ lines) embed HTML/CSS/JS as template strings — hard to maintain, review, and theme consistently.
3. **Duplicated composition:** Dashboard and Sidebar each construct `GitHubViewController` + `JiraViewController` + refresh wiring independently; inbox merge logic lives in the panel.
4. **AI settings exist but AI features do not:** `devMateKit.ai.provider` / `model` + `vscode.lm.selectChatModels` are wired in the sidebar Config tab only — no user-facing AI action.
5. **Onboarding friction:** GitHub sign-in + Jira connect + monitored repos/authors + `jira.currentUser` display-name matching is easy to misconfigure; errors are technical.
6. **Product polish gaps:** emoji-heavy tool cards, weak empty states, no status-bar attention badge, README/Marketplace story underplays Attention Inbox, version still `0.0.x`.
7. **Existing backlog ideas not shipped:** native notifications for new attention items; snooze; inline quick actions; standup generator.

### Key files (touch carefully)
- `src/extension.ts` — composition root
- `src/ui/panels/DashboardPanel.ts`, `src/ui/views/SidebarProvider.ts`, `src/ui/panels/ToolPanel.ts`
- `src/services/github/viewController.ts`, `src/services/jira/viewController.ts`
- `src/services/attention/*`
- `src/infrastructure/mcp/*`, `src/infrastructure/github/*`, `src/infrastructure/jira/*`
- `package.json` contributes (commands, views, settings)
- `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`

---

## Architecture decisions (prescribed — implement these)

Apply **pragmatic** patterns that fit a VS Code extension. Prefer clarity over ceremony.

### 1. Keep the 4-layer model; add a thin application/composition layer
```
src/
  extension.ts                 # activate/deactivate only — wire container
  app/                         # NEW: composition + session orchestration
    container.ts               # builds shared services once
    dashboardSession.ts        # shared GitHub+Jira+inbox refresh for sidebar & panel
  ui/                          # VS Code surfaces only
    webview/                   # NEW: extracted assets + message bridge
      shared/                  # css tokens, components, postMessage helpers
      dashboard/
      sidebar/
      tools/
    panels/ views/ commands/
  domain/ or keep services/    # pure business logic (rename only if low-churn)
    attention/
    github/
    jira/
    ai/                        # NEW: prompts + use-cases (no vscode.lm here)
    textTools/
  infrastructure/              # MCP, auth, stores, schedulers, vscode.lm adapter
  shared/                      # types + message contracts
```

**Rules:**
- `services/` (or `domain/`) must stay free of `vscode` imports except type-only if unavoidable. Move `vscode.lm` behind `infrastructure/ai/copilotLanguageModel.ts`.
- UI must not call MCP adapters directly — go through controllers/session.
- Build **one** shared `DashboardSession` (or similarly named facade) used by both Sidebar and DashboardPanel so refresh, inbox, and controllers are not duplicated.

### 2. Use a **connection / session state machine** (yes — this is warranted)
Auth and MCP connect/disconnect are the right place for an explicit state machine. Keep it small and typed:

**GitHub session states:** `signedOut → signingIn → signedIn → refreshing → ready | degraded | rateLimited | error`  
**Jira session states:** `disconnected → connecting → connected → ready | error`  
**Dashboard aggregate:** derive `needsSetup | loading | ready | partialFailure` from the two providers.

Implement as:
- Discriminated unions + pure transition helpers (testable)
- Controllers emit state; UI only renders state
- No XState / no external FSM library unless already in deps (it is not — don’t add one)

### 3. Message contracts = lightweight Command/Query (not full CQRS)
Formalize webview ↔ host messages in `shared/*Types.ts`:
- **Commands** (write/intent): `github.signIn`, `jira.connect`, `attention.snooze`, `ai.summarizeInbox`, …
- **Queries / events** (read/push): `*.state`, `dashboard.inboxState`, `ai.result`, `ai.error`

Host side: one router per surface that dispatches to handlers.  
Do **not** introduce separate read-DB, event bus, or saga framework.

### 4. Extract webview assets out of TypeScript string blobs
- Move CSS/JS (and HTML shells) under `src/ui/webview/**`
- Bundle or load via `webview.asWebviewUri`
- Shared design tokens using VS Code CSS variables only (`--vscode-*`)
- Keep CSP strict (`nonce` already exists — preserve)

### 5. Feature modules with clear boundaries
| Module | Owns |
|---|---|
| Attention | inbox build, priority, unread, snooze (new), notifications (new) |
| GitHub | PR fetch, attention reasons, mark read |
| Jira | issues, JQL, PR link match |
| AI | use-cases + prompts; `vscode.lm` adapter (any host-registered model) |
| Tools | text transforms + tool registry |
| Setup | onboarding checklist / first-run |

### 6. Dependency injection style
Constructor injection as today is fine. Centralize construction in `app/container.ts`. Avoid service locators and global singletons beyond VS Code’s natural extension lifecycle.

### 7. Testing bar
- Keep pure domain tests for attention, AI prompt builders, state transitions, snooze expiry.
- Don’t require brittle full-webview E2E for this pass; add focused unit tests for new logic.
- `npm run compile`, `npm run lint`, and existing tests must pass.

---

## UI / UX redesign (must ship)

### Design principles
1. **Attention-first:** the default surface answers “what needs me now?”
2. **Progressive disclosure:** setup and advanced config behind clear paths, not the home screen.
3. **VS Code-native:** use theme tokens; look like a first-party view, not a random web app.
4. **Obvious next action:** every empty/error state has one primary CTA.
5. **Calm density:** tighten cards; reduce emoji decoration; use codicons / simple glyphs where helpful.
6. **Scanability:** priority accent, short reason chips, relative time, clear Open PR / Open Jira actions.

### Information architecture
**Activity bar → DevMate Kit sidebar**
1. **Home (default):** compact Attention summary (counts + top N items) + “Open full dashboard” + setup status chip (GitHub ✓ / Jira ✗).
2. **Tools:** text utilities grid (cleaner cards, no emoji spam; optional small icons).
3. **Setup:** guided checklist replacing the current sprawling Configuration tab:
   - Step 1: Sign in to GitHub
   - Step 2: Add repos / teammates to monitor
   - Step 3: Connect Jira + set display name + team + JQL
   - Step 4: AI (optional) — enable Language Model runtime + pick any host-available model (Copilot / Claude-via-host / etc.)
   Each step shows Connected / Needs attention with plain-language errors.

**Full Dashboard panel (editor area)**
- Header: title “Daily Tasks”, last refreshed, Refresh, optional “Ask AI: What should I do?”
- Stat tiles (keep, refine): Needs attention / My PRs / Team PRs / My Jira — clickable filters
- **Attention Inbox** as the hero section (sorted by priority)
- Collapsible “Everything else” sections for full My PRs / Team PRs / Jira lists
- Expandable item detail (keep PR comments / subtasks / linked PR behavior from current dashboard)
- Partial failure banner when one provider fails (don’t blank the whole UI)

### Empty & first-run states (required copy direction)
- No GitHub: “Sign in to see pull requests that need your review.” [Sign in to GitHub]
- GitHub ok, nothing monitored: “Add repositories or teammates so DevMate can watch the right PRs.” [Open Setup]
- No Jira: “Connect Jira to include tickets and due dates in your inbox.” [Connect Jira]
- All connected, inbox empty: “You’re clear — nothing needs your attention right now.” Show last refresh time.

### Micro-interactions / polish
- Loading skeletons or subtle spinners per section (not a full-page block)
- Disable double-submit on connect/refresh (use pending operation flags already patterned in GitHub controller)
- Keyboard: Enter/Space on cards; focus rings via `--vscode-focusBorder`
- Optional status bar item: `DevMate: N need attention` → opens dashboard (click)
- Activity bar badge count for attention items when possible

### Visual don’ts
- No purple-glow “AI startup” aesthetic
- No heavy card shadows / glassmorphism
- Don’t fight VS Code light/dark themes — verify both

---

## AI features (must ship — via VS Code Language Model API)

### Correct provider model (read carefully — do not invent fake hosts)

**Wrong mental model:** three equal buttons “Copilot / Claude / Cursor.”  
**Right mental model:** DevMate calls the host’s **`vscode.lm`** API. Whatever chat models the editor has registered become selectable.

| What users say | What it actually means for this extension |
|---|---|
| GitHub Copilot | Primary path today. `vscode.lm.selectChatModels({ vendor: 'copilot' })`. Already partially wired in settings/UI. Copilot may also expose Claude-family models *through* Copilot — those appear as Copilot vendor models, not a separate “Claude” login in DevMate. |
| Claude | Not a separate DevMate OAuth integration. Claude appears if (a) Copilot offers a Claude model, or (b) the user installed a Language Model Chat Provider / BYOK that registers Claude with `vscode.lm`. DevMate only lists models the host returns — **do not** embed Anthropic API keys in DevMate. |
| Cursor | Cursor is the **IDE host**, not an AI vendor setting. Do **not** add a `provider: cursor` option. If the extension runs inside Cursor and Cursor exposes models through `vscode.lm`, they show up automatically in the model picker. If Cursor does not expose `vscode.lm` models, show a clear “No language models available in this editor” empty state — do not fake a Cursor provider. |

### Settings shape (upgrade existing keys; stay backward compatible)
- `devMateKit.ai.provider`: `none` | `vscodeLm`  
  - Migrate legacy value `githubCopilot` → treat as `vscodeLm` (read both; write `vscodeLm` going forward).
- `devMateKit.ai.model`: selected model **id** from the host list (keep setting key).
- Optional filter preference (nice-to-have, not required): prefer vendor `copilot` when multiple vendors exist; still allow picking any returned model (Claude-via-Copilot, third-party LM providers, etc.).

**Setup UI copy:** “AI runtime: use models from this editor (GitHub Copilot and any other installed language-model providers).”  
Model dropdown = live result of `vscode.lm.selectChatModels()` (no hard-coded model name list). Default selection: previously saved id if still present, else first Copilot model, else first available.

When provider is `none` or no models: Setup nudge; AI commands show a friendly message (never crash). Invoke `selectChatModels` only from user-initiated actions (VS Code requires consent).

### Ship these AI use-cases
1. **What should I do next?** (primary)  
   - Input: current Attention Inbox snapshot (titles, reasons, priorities, due dates, check status — **no secrets/tokens**).  
   - Output: short prioritized plan (3–7 bullets) + one “start here” recommendation.  
   - Entry points: Dashboard toolbar button + command `DevMate Kit: Ask AI — What should I do next?`

2. **Daily standup summary**  
   - Input: monitored PRs + Jira tasks + recent attention reasons.  
   - Output: Yesterday / Today / Blockers markdown the user can copy.  
   - Command: `DevMate Kit: Generate Standup Summary`  
   - Align with the idea of feeding an `engineering:standup` skill if present locally; otherwise generate standalone markdown in a webview or new untitled editor.

3. **Explain this attention item**  
   - From an inbox item’s action menu: summarize why it’s flagged and suggest the next human action (review PR, reply to comment, fix checks, update Jira).

### AI implementation rules
- Put prompt templates in `services/ai/` (pure strings + context builders).
- Put `vscode.lm` calls in `infrastructure/ai/languageModelClient.ts` (adapter only).
- Discover models dynamically; never assume a fixed Copilot/Claude id forever — handle empty lists and `onDidChangeChatModels`.
- Stream or show a progress notification; allow cancel via `CancellationToken` if available.
- Never send access tokens, OAuth secrets, or raw MCP payloads to the model — only curated summaries.
- Cap context size (e.g. top 20 inbox items, truncated comment bodies).
- Surface errors plainly (“No language model available — install/enable GitHub Copilot Chat, or another LM provider, then pick a model in Setup.”).

### Explicitly defer (do not build now)
- Autonomously approving/merging PRs
- Auto-posting comments to GitHub/Jira without user confirmation
- Shipping DevMate’s own Anthropic/OpenAI API-key vault (use host LM providers instead)
- A branded “Cursor” or “Claude” provider enum that bypasses `vscode.lm`

---

## Feature work beyond UI/AI (include in this pass)

Prioritize these; they make the product feel “done”:

### P0 — required
1. Architecture extraction + shared `DashboardSession` + webview asset split  
2. Attention-first UI + Setup checklist + empty states  
3. AI: “What should I do next?” + standup generator  
4. Status bar attention count  
5. README + Marketplace description rewrite (positioning above)  
6. CHANGELOG entry; bump version to `0.1.0` (first professional milestone)

### P1 — strongly preferred in same effort if time allows
7. **Native notifications** when a *new* attention item appears (not only when dashboard opens). Deduplicate by item key; respect VS Code notification settings; don’t spam — batch (“3 items need attention”) when many arrive at once.  
8. **Snooze attention item** (“1h / Later today / Tomorrow”) stored in extension globalState; snoozed items leave the top inbox until expiry.  
9. **Explain this item** AI action on inbox rows.

### P2 — nice; stub or skip if time-boxed
10. Inline quick actions (approve/comment/merge/Jira transition) — **only if** MCP adapters already expose safe primitives; otherwise document as future work in README, don’t fake it.  
11. Walkthrough / `walkthroughs` contribution in `package.json` for first install.

---

## Implementation plan (execute in this order)

Work in focused commits/PR-sized steps. Do not stop between steps to ask permission.

1. **Inventory & guardrails** — run tests/lint; note baseline.  
2. **Introduce `app/container.ts` + `DashboardSession`** — move duplicated controller wiring out of Sidebar/Dashboard without changing UX yet.  
3. **Extract webview CSS/JS** for dashboard + sidebar; keep behavior identical.  
4. **Add connection state machines** + map existing auth/MCP flows onto them **without changing OAuth/MCP internals**; update UI bindings only.  
5. **Redesign sidebar IA** (Home / Tools / Setup) + empty states.  
6. **Redesign dashboard** Attention-first layout; preserve expand/detail behavior.  
7. **Status bar badge**.  
8. **AI module** + two primary commands; wire Config step for provider/model.  
9. **Notifications + snooze** (P1).  
10. **Docs & version** — README, CONTRIBUTING (new folders), CHANGELOG, `package.json` version `0.1.0`, keywords/categories polish (`Other` → also consider `Visualization` or keep Other but improve description).  
11. **Final QA** — compile, lint, tests; manual checklist below.

If something conflicts with existing behavior, **prefer the new IA/UX in this prompt** while preserving data/settings keys (`devMateKit.*`) so upgrades don’t wipe user config.

---

## Settings & compatibility

- **Keep** setting keys: `devMateKit.github.*`, `devMateKit.jira.*`, `devMateKit.ai.*`.
- **Keep** command id prefixes `devMateKit.*` (add new commands; don’t rename old ones without aliases).
- Jira `currentUser` remains display-name based for now; improve Setup UX copy so users paste the exact assignee string. Optional: if MCP can resolve “me”, auto-fill — do it when easy.
- Engines stay `vscode: ^1.90.0` unless AI APIs require a higher minimum — if so, bump thoughtfully and document.

---

## Acceptance criteria (definition of done)

### Product / UX
- [ ] New user understands purpose from sidebar Home without opening README  
- [ ] Setup checklist covers GitHub + Jira + optional AI with success/failure states  
- [ ] Dashboard opens to Attention Inbox as the primary content  
- [ ] Empty/error states always offer a next action  
- [ ] Looks correct in dark and light themes  
- [ ] Text tools still work from Command Palette, context menu, and Tools tab  

### Architecture
- [ ] No 1000-line TS files that embed full webview apps — assets extracted  
- [ ] Single shared session/composition for GitHub+Jira+inbox  
- [ ] Explicit typed state for GitHub/Jira connection lifecycle  
- [ ] AI domain logic testable without VS Code window  
- [ ] `CONTRIBUTING.md` updated to match new folders  

### AI
- [ ] “What should I do next?” works when any `vscode.lm` model is available (Copilot and/or other host providers)  
- [ ] Model picker lists live host models; legacy `githubCopilot` setting still works  
- [ ] Standup summary command produces copyable markdown  
- [ ] Graceful degradation when AI is off/unavailable / running in a host with no LM models  
- [ ] No tokens/secrets in model prompts  
- [ ] No fake “Cursor” provider setting  

### Auth regression (mandatory)
- [ ] GitHub MCP sign-in / session restore still works after reload  
- [ ] Jira MCP connect / disconnect / reconnect still works  
- [ ] Existing MCP/OAuth unit tests pass unchanged in intent  

### Quality
- [ ] `npm run compile` passes  
- [ ] `npm run lint` passes  
- [ ] Existing + new unit tests pass  
- [ ] README positions the product professionally  
- [ ] Version `0.1.0` + CHANGELOG written  

### Manual smoke checklist (perform or document results)
1. Fresh install → Home empty state → Sign in GitHub → add a repo → see PRs  
2. Connect Jira → set user → see tasks / inbox merge  
3. Toggle AI provider → pick a host model → run “What should I do next?”  
4. Generate standup → copy output  
5. Snooze an item → disappears → returns after expiry (if P1 shipped)  
6. Disconnect network → partial failure banner, no crash  
7. **Auth regression:** GitHub sign-in + Jira connect still succeed; tokens survive window reload  

---

## Coding standards (match the repo)

- TypeScript strictness as configured; no `any` unless unavoidable and localized  
- Colocate tests as `*.test.ts`  
- Prefer small pure functions for attention/AI/snooze  
- User-facing strings: clear, calm, no stack traces in toasts  
- Avoid drive-by refactors unrelated to this mission  
- Do not commit secrets; do not rewrite git history  

---

## How to decide when unsure

Use this priority order:
1. Clarity for a first-time user  
2. Reliability of GitHub/Jira attention data  
3. Maintainability of webview + session code  
4. AI usefulness  
5. Extra backlog features (notifications, snooze, quick actions)

**Default choices (do not ask):**
- Keep package name `devmate-kit` / display name `DevMate Kit`  
- Sidebar Home + Setup + Tools (three sections)  
- AI via `vscode.lm` only (discover host models; prefer Copilot when present; no Cursor/Claude fake providers; no DevMate-owned API keys)  
- Never break GitHub/Jira MCP OAuth — wrap, don’t rewrite  
- Version bump to `0.1.0`  
- Extract webviews without React  
- Implement P0 fully; implement P1 if feasible after P0; leave P2 documented  

---

## Out of scope (explicit)

- Publishing to Marketplace (packaging may be prepared; don’t run `vsce publish` unless asked)  
- Renaming the publisher or repository  
- Mobile / browser extension  
- Replacing MCP with raw REST unless MCP is broken and blocking — prefer fix adapters  

---

## Final instruction to the implementing agent

Execute the mission end-to-end. Make architectural and UX decisions using the defaults above. Only stop for confirmation if you hit a true external blocker (no LM models in the host and you cannot detect why, broken Atlassian/GitHub OAuth that needs user credentials, or a test environment limitation). If auth risks conflict with a cleanup idea, keep the working MCP auth path. Otherwise: implement, test, document, and leave the repo ready to demo professionally.
