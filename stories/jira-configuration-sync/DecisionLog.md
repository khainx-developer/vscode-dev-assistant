# Decision Log — Jira Configuration & Task Sync

Append-only. Never edit or delete past entries — add a new entry that supersedes an old one if
a decision changes.

<!-- Example:
## 2026-08-03 — Chose per-tenant schema over shared-schema with tenant_id
- **Stage**: 03-Design
- **Decision**: ...
- **Why**: ...
- **Alternatives rejected**: ...
- **Made by**: Architect/Analyst
-->

## 2026-10-31 — Tier assessment: Full
- **Stage**: 01-Requirement
- **Decision**: Tier set to `full`.
- **Why**: Force-Full checklist (ai-factory/gates/complexity-tiers.md) — two signals triggered:
  (1) "Introduces a new external integration or third-party dependency" — Jira Cloud/Server REST
  API is a new third-party integration, no existing client in the codebase; (2) "Touches
  authentication, authorization, or RBAC" — requires a new credential flow (Jira API
  token/OAuth) stored and used to call Jira on the user's behalf. Either signal alone forces
  Full; both apply here.
- **Alternatives rejected**: Quick tier — rejected per the "any single yes forces Full, no
  exceptions" rule.
- **Made by**: Architect/Analyst

## 2026-10-31 — Requirement.md Approval Gate confirmed
- **Stage**: 01-Requirement
- **Decision**: User confirmed the Requirement.md (BRS) Approval Gate ("auto approve, please
  continue").
- **Why**: All critical questions were answered during Brainstorm (see Analysis.md Q&A), no
  blocking Open Questions remained, and the user explicitly approved proceeding.
- **Alternatives rejected**: N/A
- **Made by**: User (via Architect/Analyst agent)

## 2026-10-31 — Design.md: shared PullRequestCache for GitHub↔Jira PR linkage
- **Stage**: 03-Design
- **Decision**: Introduce `src/github/pullRequestCache.ts`, a new shared in-memory component
  written by every `GitHubViewController.refresh()` call, read read-only by Jira's
  `prLinkMatcher`. `GitHubViewController`'s constructor gains one new parameter for this cache;
  its public interface and behavior are otherwise unchanged.
- **Why**: Requirement.md BR-004 requires PR linkage to use GitHub PR data already fetched by
  the existing integration, never a new GitHub API call — but today each `GitHubViewController`
  instance (one per sidebar/dashboard webview) holds its own private fetch result, so there is
  no existing single source of truth for "all currently known PRs."
- **Alternatives rejected**: (a) Jira re-fetching PRs itself — violates BR-004, duplicates API
  calls; (b) reaching into whichever `GitHubViewController` instance happens to exist — fragile,
  order-dependent on which webview was opened.
- **Made by**: Architect/Analyst

## 2026-10-31 — Design.md: Jira module structure and remaining architectural decisions
- **Stage**: 03-Design
- **Decision**: New `src/jira/*` module (types/connectionStore/configStore/client/
  errorClassifier/prLinkMatcher/viewController) mirroring `src/github/*`'s split; Jira API token
  in `vscode.ExtensionContext.secrets`, base URL/email as plain `devAssistant.jira.*` settings;
  saved queries persisted as `devAssistant.jira.savedQueries` (array of `{label, jql}` objects);
  `JiraClient` uses the runtime's global `fetch` (no new HTTP dependency); PR-linkage matching
  extracted as a pure function in `prLinkMatcher.ts`; new `JiraDashboardPanel` sibling to
  `DashboardPanel` plus a Jira section added to `SidebarProvider`'s Configuration tab;
  `RefreshScheduler` reused as-is from `src/github/refreshScheduler.ts`; Jira defines its own
  `JiraFailureCategory` type rather than importing GitHub's, despite identical category names.
- **Why**: See Design.md §24 for the full reasoning/alternatives table — each decision traces to
  either an explicit user answer in Requirement.md/Analysis.md, an existing proven pattern in
  `src/github/*`, or avoiding an unnecessary new dependency.
- **Alternatives rejected**: See Design.md §24 (per-decision alternatives column).
- **Made by**: Architect/Analyst

## 2026-10-31 — HumanAutoApprove enabled by user
- **Stage**: 03-Design
- **Decision**: User said "auto approve, please continue" immediately after the Requirement.md
  gate was presented. Treated as enabling `HumanAutoApprove` per `architect/SKILL.md` for the
  remainder of this story: gates whose stage self-check comes back clean (no "No" answers, no
  unresolved blockers) are auto-confirmed without a separate round-trip; a failed self-check
  still always stops and asks.
- **Why**: Explicit user instruction to not pause at each gate.
- **Alternatives rejected**: Pausing at every gate regardless — rejected per the user's explicit
  instruction.
- **Made by**: User (via Architect/Analyst agent)

## 2026-10-31 — Design.md Approval Gate auto-confirmed
- **Stage**: 03-Design
- **Decision**: Design.md's Approval Gate auto-confirmed under `HumanAutoApprove` (see entry
  above) — self-check (`sds-standard.md#ai-quality-gate`, 9 questions) and the Design Validation
  Checklist both came back clean; the two items in §26 Open Questions are non-blocking
  (organizational preference / scale confirmation with a stated default already in place), not
  architectural blockers.
- **Why**: HumanAutoApprove conditions met — no "No" answers on the self-check.
- **Alternatives rejected**: N/A
- **Made by**: Architect/Analyst (auto-confirmed per HumanAutoApprove)

## 2026-10-31 — ExecutionPlan.md: 13-task breakdown, Approval Gate auto-confirmed
- **Stage**: 04-ExecutionPlan
- **Decision**: Decomposed TechnicalDesign.md into 13 tasks (TASK-001–013) across 6 phases, per
  ExecutionPlan.md §3-§4. Risk Analysis (§13) flags TASK-004 (Jira API schema) and TASK-008
  (regression risk to the existing GitHub test suite) as the highest-risk tasks, each with a
  stated mitigation; no High/High cell. AI Quality Gate self-check (9 questions,
  `eps-standard.md#ai-quality-gate`) came back clean, #9 answered NO. Approval Gate
  auto-confirmed under `HumanAutoApprove`.
- **Why**: HumanAutoApprove conditions met (clean self-check, no unmitigated High/High risk).
- **Alternatives rejected**: A coarser task breakdown (e.g. one task per phase) — rejected per
  EPS's Task Decomposition Rules (small, independent, deterministic, verifiable); the current
  13-task split lets each new file and each existing-file modification be independently
  reviewed and rolled back.
- **Made by**: Architect/Analyst (auto-confirmed per HumanAutoApprove)

## 2026-10-31 — Task Packages generated for all 13 tasks
- **Stage**: 04-ExecutionPlan
- **Decision**: Generated `04-ExecutionPlan/tasks/TASK-001.md` through `TASK-013.md`, one per
  ExecutionPlan.md §5 block, each passing the ITPS AI Quality Gate self-check (9 questions) and,
  where `code-spec-standard.md` applies (every task that adds a class/function or touches the
  outbound Jira API/shared cache — i.e. all except the pure-wiring TASK-013 and the pure-type
  TASK-001, which state N/A with reasons), the Planner readiness gate (10 questions).
- **Why**: Per `ai-factory-exec-plan`'s step 12-13 — the Developer reads only one Task Package
  at a time, never ExecutionPlan.md.
- **Alternatives rejected**: N/A
- **Made by**: Architect/Analyst

## 2026-10-31 — Checklist plugins registry.md globs do not apply to this story
- **Stage**: 04-ExecutionPlan
- **Decision**: Treated both active rows in `ai-factory/checklists/registry.md` (`dotnet`,
  `react-nextjs`) as not applicable to any Task Package in this story, despite `react-nextjs`'s
  glob (`**/*.ts`) literally matching every new/modified TypeScript file. Every Task Package's
  §1 Checklists field is set to "none match."
- **Why**: Both plugins' actual Rules content is stack-specific (EF Core/ASP.NET for `dotnet`,
  React/Next.js rendering/hooks for `react-nextjs`) and this project (per
  `ai-factory/gates/coding-standard.md`) is a plain TypeScript VS Code extension with neither
  React nor .NET anywhere in it — the `react-nextjs` glob is a leftover from the AI Factory
  template's default registry, not a glob this project's maintainer tailored. Per
  `ai-factory/checklists/README.md`'s own precedence rule ("real codebase conventions (logged
  divergence) > plugin > generic review-checklist.md"), the real codebase wins.
- **Alternatives rejected**: Mechanically applying `react-nextjs`'s Rules to every `.ts` file in
  this story — would mean checking plain Node/VS-Code-extension code against React-specific
  anti-patterns (fetch-in-effect, component render budgets) that cannot occur here, producing
  false-positive "checklist: pass" noise rather than a meaningful review signal.
- **Made by**: Architect/Analyst

## 2026-10-31 — TechnicalDesign.md: verified Jira search endpoint, grounded implementation facts
- **Stage**: 03-Design (TDS)
- **Decision**: All issue-fetching and query-validation calls target
  `POST /rest/api/3/search/jql` (GET/POST, returns `issues[]`/`nextPageToken`/`isLast`, no
  `total`), never the removed `GET /rest/api/3/search`. Connection validation targets
  `GET /rest/api/3/myself`. No pagination is implemented in this story — a single bounded page
  per saved query.
- **Why**: Verified via live web search (see TechnicalDesign.md's opening note and §24) that
  Atlassian removed the old `/search` endpoint; using it would have shipped a broken
  integration. The exact response schema beyond `issues`/`nextPageToken`/`isLast` was not
  confirmed against Atlassian's canonical API reference in this session — flagged as Open
  Technical Question (TechnicalDesign.md §28) with an explicit Developer-role verification step
  before implementation is finalized, rather than guessed past.
- **Alternatives rejected**: Using the documented-in-training-data but now-removed `/search`
  endpoint — would be a grounded-sounding but actually incorrect implementation.
- **Made by**: Architect/Analyst

## 2026-10-31 — coding-standard.md amended for the Jira module
- **Stage**: 03-Design (TDS)
- **Decision**: Amended `ai-factory/gates/coding-standard.md` §1 (new `src/jira/` folder), §6
  (new "Outbound (Jira)" rule — only `client.ts` may call `fetch` against Jira), §5 (Jira's
  persistence surfaces), and §13 (first real `SecretStorage` usage in this codebase, documented
  as the pattern for any future credential).
- **Why**: Per `coding-standard.md`'s own Amendments section — a story that adds a new
  pattern (first stored secret, second network-calling feature) updates that document in the
  same story rather than leaving it stale.
- **Alternatives rejected**: Leaving `coding-standard.md` unchanged and letting the real code
  silently diverge from it — explicitly against that document's own stated policy.
- **Made by**: Architect/Analyst

## 2026-10-31 — TechnicalDesign.md Approval Gate auto-confirmed
- **Stage**: 03-Design (TDS)
- **Decision**: TechnicalDesign.md's Approval Gate auto-confirmed under `HumanAutoApprove`.
  AI Quality Gate self-check (10 questions, `tds-standard.md#ai-quality-gate`) came back clean,
  #10 answered NO; Design Validation Checklist clean. The two items in §28 Open Technical
  Questions are non-blocking (a documented verification step for the Developer role, and a
  carried-over non-blocking organizational preference from Design.md §26) — not unresolved
  architectural or design decisions.
- **Why**: HumanAutoApprove conditions met.
- **Alternatives rejected**: N/A
- **Made by**: Architect/Analyst (auto-confirmed per HumanAutoApprove)

## 2026-10-31 — Requirement re-entry: browser OAuth for Jira
- **Stage**: 01-Requirement
- **Decision**: Replace Jira email/API-token authentication with browser-based Atlassian OAuth
  2.0 (3LO) through an organization-managed OAuth app and trusted broker. The developer enters
  the Jira site URL, grants read-only access in the browser, and confirms one active site.
  OAuth tokens are stored in SecretStorage, API-token fallback is removed, and legacy API tokens
  are deleted after successful OAuth.
- **Why**: The user requested a simple browser authorization flow, no API-token form, and no
  client secret in the extension. Atlassian's current 3LO guide requires a client secret for
  code exchange and advises against collecting API tokens, so the broker retains that secret.
- **Alternatives rejected**: Embedding the OAuth client secret in the extension; retaining an
  API-token fallback; using the Copilot Chat MCP session directly from the Jira panel.
- **Made by**: User / Architect (auto-confirmed under the previously enabled HumanAutoApprove)

## 2026-10-31 — Tier reassessment: Full for OAuth revision
- **Stage**: 01-Requirement
- **Decision**: Retain the `full` tier.
- **Why**: The revision still changes authentication, introduces an external OAuth/broker
  integration, and crosses multiple module boundaries; each signal independently requires Full.
- **Alternatives rejected**: Quick tier — rejected under the force-Full rules.
- **Made by**: Architect/Analyst

## 2026-10-31 — Paused custom Jira panel in favor of MCP chat for this phase
- **Stage**: 01-Requirement / 05-Implementation
- **Decision**: Use the existing GitHub and Atlassian MCP servers through Copilot Chat for the
  current phase; pause the custom Jira panel/auth implementation. A Copilot agent/chatbot that
  reuses MCP may be considered in a future phase.
- **Why**: The user chose the MCP chat workflow instead of adding a separate OAuth/broker
  integration to the extension.
- **Alternatives rejected**: Continuing the custom Jira panel/auth flow in this phase.
- **Made by**: User

## 2026-10-31 — Requirement re-entry: MCP-backed Jira and GitHub data
- **Stage**: 01-Requirement
- **Decision**: Supersede the prior direct REST/API-token and broker-based OAuth plans. Use
  Atlassian MCP v2 for Jira, GitHub MCP read-only tools for the existing Attention Inbox, and
  retain current GitHub UI/configuration behavior. Store MCP credentials in SecretStorage and
  make the authorized connections reusable by a future Copilot SDK chat phase.
- **Why**: The user wants one MCP-backed foundation for current data views and future AI chat,
  without a separate broker, embedded client secret, or API-token setup.
- **Alternatives rejected**: Direct Jira/GitHub REST data clients, an organization OAuth broker,
  a separate client-secret flow, and changing the existing GitHub Attention Inbox behavior.
- **Made by**: User

## 2026-10-31 — Requirement gate re-confirmed for MCP architecture
- **Stage**: 01-Requirement
- **Decision**: The revised Requirement Approval Gate was confirmed under `HumanAutoApprove`.
  The AI Quality Gate is clean; GitHub MCP parity is a measurable pre-cutover acceptance
  criterion, and the cutover remains blocked unless that criterion passes.
- **Why**: The user directed the Architect to revise the requirement and then update the Design;
  the prior HumanAutoApprove instruction remains active.
- **Alternatives rejected**: Starting Design from the superseded broker/API-token requirement.
- **Made by**: Architect/Analyst (auto-confirmed per HumanAutoApprove)

## 2026-10-31 — MCP cutover scope and pre-cutover parity gate
- **Stage**: 01-Requirement
- **Decision**: Use Atlassian MCP v2 for Jira data and GitHub MCP read-only tools for the existing
  GitHub Attention Inbox, preserving all current GitHub UI/configuration behavior. The user-
  authorized MCP service must be reusable by a future Copilot SDK chat phase. GitHub MCP replaces
  the current GitHub data source only after AC-015 proves field/behavior parity; if parity fails,
  the cutover remains blocked.
- **Why**: The user wants one MCP-backed foundation for Jira and GitHub data now and a future
  Copilot SDK chat without a second sign-in. Official Atlassian MCP metadata supports OAuth 2.1
  public clients, and GitHub MCP source exposes read-only PR/review/comment/check operations.
- **Alternatives rejected**: Direct REST clients, a broker/client-secret service, API-token
  fallback, changing current GitHub Attention Inbox behavior, and using write-capable MCP tools.
- **Made by**: User / Architect (auto-confirmed under HumanAutoApprove)

## 2026-10-31 — System Design: shared MCP integration for Jira, GitHub, and future Copilot SDK
- **Stage**: 03-Design (SDS)
- **Decision**: The extension owns the MCP client/auth service for the Atlassian and GitHub remote
  servers. Atlassian uses its advertised public OAuth 2.1/PKCE flow; GitHub reuses the existing
  VS Code session where accepted, with the MCP browser flow as the approved alternative. Store
  credentials in SecretStorage, invoke read-only tools only, and expose the same authorized
  service to future Copilot SDK custom tools. Do not create an OAuth broker or direct REST
  fallback.
- **Why**: Atlassian MCP metadata supports public-client authorization; the user's MCP endpoints
  already provide the provider-owned data boundary; a shared extension-owned service avoids
  duplicate auth between current data views and future AI chat. The existing GitHub UI/config
  contract remains unchanged.
- **Alternatives rejected**: Separate direct REST clients and broker, reuse of Copilot Chat's
  private MCP session, or separate SDK-owned MCP connections that force a second login.
- **Trade-offs**: MCP tool schemas can evolve and may require multiple calls to reproduce
  existing GitHub fields. Therefore, the GitHub data-source cutover is explicitly blocked until
  Requirement.md AC-015 proves full read-only parity.
- **Made by**: Architect/Analyst under user-approved scope

## 2026-10-31 — Design Approval Gate auto-confirmed
- **Stage**: 03-Design (SDS)
- **Decision**: Design.md's Approval Gate was auto-confirmed under the previously enabled
  HumanAutoApprove instruction. All nine SDS AI Quality Gate questions and the Design
  Validation Checklist passed; GitHub parity remains a defined pre-cutover acceptance gate,
  not an unresolved architectural decision.
- **Why**: The MCP boundaries, security model, provider responsibilities, future SDK reuse, and
  fallback/refresh behaviors are specified without an outstanding architecture choice.
- **Alternatives rejected**: Holding the entire design for live PR parity results; this is
  instead a specific cutover acceptance criterion.
- **Made by**: Architect/Analyst (auto-confirmed per HumanAutoApprove)

## 2026-10-31 — Technical Design, Execution Plan, and task packages superseded by MCP design
- **Stage**: 03-Design (TDS) / 04-ExecutionPlan
- **Decision**: `03-Design/TechnicalDesign.md`, `04-ExecutionPlan/ExecutionPlan.md`, and all 13
  task packages (TASK-001..013) were authored against the earlier broker/API-token-based
  Design.md and are now superseded. They will be regenerated from the current MCP-based
  Design.md. The in-progress implementation under `05-Implementation` (including
  `src/jira/`, `src/github/pullRequestCache.ts`) was built from the superseded task packages and
  will need to be reconciled with the regenerated Execution Plan by the Developer role; this is
  flagged for Developer, not altered here.
- **Why**: The user directed the Architect to rerun from the Design stage after the requirement
  and design were revised to the MCP architecture; TechnicalDesign.md and ExecutionPlan.md
  predate that revision (file timestamps show Design.md was last updated after both).
- **Alternatives rejected**: Leaving the stale TDS/EPS/task packages in place and layering the
  new architecture on top of them.
- **Made by**: User / Architect (auto-confirmed per HumanAutoApprove)

## 2026-10-31 — Technical Design regenerated for MCP architecture
- **Stage**: 03-Design (TDS)
- **Decision**: `TechnicalDesign.md` was rewritten against the current MCP-based Design.md. Key
  code-level choices: a new shared `src/mcp/` module (`McpConnectionService`,
  `McpSecretTokenStore`, `oauthClientProvider`, `LoopbackRedirectServer`, `McpErrorMapper`) is the
  sole MCP SDK import point and the sole holder of provider credentials; `src/jira/client.ts`
  (Basic-auth REST) and `src/github/client.ts` (octokit/GraphQL) are deleted and replaced by
  `atlassianMcpAdapter.ts` and `githubMcpAdapter.ts` respectively; OAuth browser callbacks are
  received by a short-lived local loopback HTTP server (`127.0.0.1`), not a `vscode://`
  custom-scheme URI handler, because public evidence suggests Atlassian's MCP OAuth does not
  accept custom-scheme redirect URIs for dynamically registered clients. `ai-factory/gates/coding-standard.md`
  §1/§6/§13 were amended in the same change to describe `src/mcp/` as the new outbound-call/secrets
  boundary, per that document's own Amendments policy.
- **Why**: Design.md §6/§14 call for a shared MCP connection layer and SecretStorage-only
  credentials; the loopback-redirect choice is grounded in public documentation of how VS Code's
  own OAuth plumbing and community reports describe Atlassian's MCP OAuth callback handling
  (cited in TechnicalDesign.md's "Grounded external facts").
- **Alternatives rejected**: A `vscode://` custom-scheme URI handler for the OAuth redirect
  (likely rejected by Atlassian's allowlist); keeping `src/jira/client.ts`/`src/github/client.ts`
  and layering MCP calls alongside them (rejected — Design.md requires MCP as the sole data
  boundary, not an additional path).
- **Open Technical Questions logged in TechnicalDesign.md §28** (OTQ-1..4): whether Atlassian's
  DCR actually accepts this extension's registration (the single largest feasibility risk,
  carried forward from Design.md §23/Requirement.md §21 and Analysis.md's Feasibility Notes, not
  newly invented here), GitHub MCP's exact pagination parameter, whether the MCP SDK provides a
  PKCE helper, and whether the pinned SDK version is ESM-only (same class of problem already
  solved for `octokit` via dynamic import).
- **Made by**: Architect/Analyst (auto-confirmed per HumanAutoApprove; AI Quality Gate and Design
  Validation Checklist both clean — OTQ-1..4 are fact-finding/escalation items, not open design
  decisions)

## 2026-10-31 — Execution Plan and task packages regenerated for MCP architecture
- **Stage**: 04-ExecutionPlan (EPS/ITPS)
- **Decision**: `ExecutionPlan.md` was rewritten from the regenerated `TechnicalDesign.md`,
  decomposed into 19 tasks across 4 phases: MCP connection-layer foundation (TASK-001..007),
  Jira domain migration (TASK-008..014), GitHub domain migration (TASK-015..018), and wiring
  (TASK-019). All 19 Task Packages were generated under `04-ExecutionPlan/tasks/`. Grounded in
  the real current codebase (read `src/jira/*`, `src/github/*` directly during planning, not
  assumed from TechnicalDesign.md's prose) — e.g. confirmed `GitHubViewController` already wires
  `PullRequestCache`, confirmed `src/github/errorClassifier.ts`'s `{status,message}`-shaped input
  requirement (TASK-017's explicit error-boundary-shape constraint on `GithubMcpAdapter`),
  confirmed `GitHubClient.getRateLimitStatus` has no current caller (TASK-015).
- **Why**: Hand-off point to the Developer role, per `ai-factory-exec-plan`.
- **Risk Analysis**: No unmitigated High/High cell (ExecutionPlan.md §13) — TASK-006/007
  (DCR/SDK-shape unknowns) and TASK-015 (GitHub MCP multi-call fan-out / missing lookup tools)
  are the highest-risk tasks, each with a stated mitigation and an explicit escalation path
  rather than a silent guess.
- **Carried-forward Open Technical Questions** (from TechnicalDesign.md §28), each assigned to a
  specific task with a resolution path: OTQ-1 (Atlassian DCR acceptance) → TASK-007; OTQ-2
  (GitHub MCP pagination/detail parameter) → TASK-015; OTQ-3 (SDK PKCE helper) → TASK-006; OTQ-4
  (SDK ESM/CJS shape) → TASK-002/007.
- **Made by**: Architect/Analyst (the Planner) (auto-confirmed per HumanAutoApprove; AI Quality
  Gate clean per `eps-standard.md`; Design Validation/Definition of Ready checklists clean)

## 2026-10-31 — Execution Plan explicitly approved; hand-off to Developer role
- **Stage**: 04-ExecutionPlan → 05-Implementation
- **Decision**: `TechnicalDesign.md` and `ExecutionPlan.md` Status fields updated from Draft to
  Approved. The user explicitly confirmed the Execution Plan gate (in addition to the earlier
  HumanAutoApprove auto-confirmation) and directed hand-off to the Developer role. Stage
  05-Implementation begins at TASK-001, per `04-ExecutionPlan/tasks/TASK-001.md`, one Task
  Package at a time.
- **Why**: User-directed hand-off after reviewing the regenerated MCP-based plan.
- **Made by**: User

## 2026-10-31 — Checklist registry corrected for this project's actual stack
- **Stage**: cross-cutting (framework files, not story-specific)
- **Decision**: `ai-factory/checklists/registry.md`'s `dotnet` and `react-nextjs` plugin rows
  were marked `off` with a stated reason — this project (`dev-assistant`) is a VS Code
  extension/TypeScript package with no .NET backend and no React/Next.js frontend, so neither
  plugin's Rules apply, despite `react-nextjs`'s `**/*.ts`/`**/*.js` globs otherwise matching
  every file here by extension alone. Added a corresponding note to
  `ai-factory/gates/coding-standard.md`'s Applicability section clarifying that
  `code-spec-standard.md`'s Profile B (.NET/EF) and Profile F (React/Next.js) don't apply to this
  project either, and that §9.2 Data Access Spec is routinely N/A (no database) or a short ad-hoc
  "remote MCP call" spec for MCP-calling tasks, per the pattern already used in this story's
  Task Packages (`04-ExecutionPlan/tasks/TASK-0*.md`). Updated all 19 of this story's Task
  Packages' §1 Checklists line to cite the corrected registry instead of the previous
  "glob matches but doesn't apply" phrasing.
- **Why**: User flagged that the coding-standard/AI-factory checklist instructions were
  written for a .NET + React/Next.js stack and don't fit this VS Code extension project.
- **Made by**: Architect/Analyst, per user instruction

## 2026-10-31 — TASK-002 Blocked resolved: DecisionLog.md added to affected tasks' Files To Modify
- **Stage**: 04-ExecutionPlan (ITPS) / 05-Implementation
- **Decision**: The Developer correctly flagged TASK-002 as Blocked: §14/§16 require a
  `DecisionLog.md` entry (the ESM/CJS finding) but §7 Files To Modify only listed `package.json`/
  `package-lock.json`, so writing to `DecisionLog.md` was not explicitly authorized by the
  package even though `ai-factory/prompts/implementation.md` step 10 always permits it. Added
  `DecisionLog.md` to §7 Files To Modify (with a one-line pointer to that standing rule) in
  TASK-002, and pre-emptively in TASK-006, TASK-007, TASK-009, and TASK-015 — the only other
  packages in this story whose acceptance criteria require a `DecisionLog.md` entry.
- **Why**: A Task Package's own §7/§8 file lists are meant to be read literally ("No file
  outside this list... should be touched" — ITPS template), so relying on an implicit standing
  exception was the gap, not the Developer's caution.
- **Made by**: Architect/Analyst, per Developer's Blocked report on TASK-002

## 2026-10-31 — TASK-004 Blocked resolved: `LoopbackRedirectServer.start()` made async
- **Stage**: 04-ExecutionPlan (ITPS) / 05-Implementation
- **Decision**: The Developer correctly flagged TASK-004 as Blocked: §9's Required Interfaces
  specified `start(expectedState: string): { redirectUri: string; result: Promise<{code:
  string}> }` — a synchronous return — built from a port assigned via
  `server.listen(0, '127.0.0.1')`. The Developer verified empirically (both `http.createServer`
  and raw `net.createServer`) that `server.address()` is `null` immediately after `.listen(0,
  host)` and only becomes populated once the `'listening'` event fires on a later tick; reading
  `.port` synchronously throws. No synchronous Node API exists to learn an OS-assigned ephemeral
  port without a new dependency. Amended TASK-004's Required Interfaces/Algorithm (§9, §9.1) to
  `start(expectedState: string, timeoutMs?: number): Promise<{ redirectUri: string; result:
  Promise<{code:string}> }>`, awaiting the `'listening'` event internally before resolving; the
  `result` promise's own callback-settling logic is unchanged. Also amended TASK-006 (the only
  planned caller) to `await start(state)`.
- **Why**: A Task Package's "Required interfaces" is something the Developer must not redesign
  unilaterally (`cis-standard.md`'s "Modify public contracts without approval"), so the correct
  response to a spec that cannot be implemented as literally written was to stop and request a
  plan update, not to silently change the signature. The fix itself was a platform-constrained
  necessity, not a design choice with real alternatives.
- **Alternatives rejected**: Keeping `start()` synchronous and accepting a wrong/placeholder
  `redirectUri` — would silently produce a broken OAuth redirect URI in TASK-006; introducing a
  new dependency (e.g. a worker-thread `Atomics.wait` trick) to force synchronous behavior —
  violates §9's "Node's built-in `http` module only — no new dependency" constraint and is
  needless complexity for a one-shot local server.
- **Made by**: Architect/Analyst, per Developer's Blocked report on TASK-004

## 2026-10-31 — TASK-006 Blocked resolved: async provider factory + lazy per-server construction in TASK-007
- **Stage**: 04-ExecutionPlan (ITPS) / 05-Implementation
- **Decision**: The Developer correctly flagged TASK-006 as Blocked, and correctly stopped
  short of patching TASK-007 unilaterally since the fix crossed a scope boundary. Resolved as a
  chain:
  1. **OTQ-3** (TechnicalDesign.md §24/§28): confirmed from the installed SDK's own types
     (`node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.d.ts`,
     `.../client/streamableHttp.d.ts`) that `OAuthClientProvider.redirectUrl`/`.clientMetadata`
     are synchronous getters; PKCE is SDK-owned (`startAuthorization()` generates both the
     verifier and challenge); and the provider does not drive the token exchange — the caller
     must call `transport.finishAuth(authorizationCode)` once the code arrives. This finding is
     now inlined directly into TASK-006 §9 so it never needs re-deriving.
  2. **TASK-006** amended: `createOAuthClientProvider` is now `async`, returning
     `Promise<OAuthClientProvider & { authorizationResult: Promise<{code:string}> }>` — it
     starts one `LoopbackRedirectServer` and awaits its `start()` *before* building the
     returned object, so `redirectUrl`/`clientMetadata` can be synchronous getters as the SDK
     requires. The extra `authorizationResult` property hands the pending code to the caller,
     since this provider never resolves it itself. Each call to this factory is, by
     construction, exactly one fresh loopback server for exactly one authorization attempt.
  3. **TASK-007** amended: `McpConnectionService`'s constructor no longer constructs
     `McpSecretTokenStore`/`OAuthClientProvider` (it only resolves `.mcp.json` server URLs — a
     constructor cannot `await`). A new private `authSessions` map lazily builds the
     `{store, provider}` pair inside `connect()`, the first time a server is connected, and
     `disconnect()` evicts that server's entry — so the *next* `connect()` after a disconnect
     builds a genuinely fresh provider/loopback server. This is what actually implements
     TASK-004/006's "never reuse one `LoopbackRedirectServer` across two authorization
     attempts" rule (one build-then-evict cycle = one attempt). `connect()`'s algorithm also now
     spells out the `UnauthorizedError` → `await provider.authorizationResult` →
     `transport.finishAuth(code)` → retry sequence, since TASK-006's provider no longer resolves
     the code itself.
- **Why**: `redirectUrl`/`clientMetadata` being synchronous getters (an SDK fact, not a design
  choice) makes "know the loopback port before the provider object exists" a hard requirement,
  which makes the provider factory `async`, which makes building it inside a plain constructor
  impossible. This is one causal chain, not three independent decisions — fixing TASK-006 alone
  without touching TASK-007 would have left TASK-007 unimplementable as written.
- **Alternatives rejected**: An `async initialize()` lifecycle method on `McpConnectionService`
  called once at startup — rejected in favor of fully lazy per-server construction inside
  `connect()`, since `connect()` is already async and already the natural place a "first use of
  this server" check belongs (TASK-007's own `isConnected`/in-flight-guard logic already lives
  there); a separate `initialize()` would add a second lifecycle step callers must remember to
  invoke, for no benefit. Keeping the original eager-in-constructor design and trying to make
  constructors async — not possible in JavaScript/TypeScript.
- **Made by**: Architect/Analyst, per Developer's Blocked report on TASK-006

## 2026-10-31 — TASK-009: Atlassian MCP tool names used best-effort, not live-verified
- **Stage**: 05-Implementation
- **Decision**: Implemented `AtlassianMcpAdapter` using the documented tool names
  `getAccessibleAtlassianResources` (no args) and `searchJiraIssuesUsingJql`
  (`{cloudId, jql, maxResults, fields}`) exactly as given in TASK-009 §9, without live-confirming
  them against a real `tools/list` response from `com.atlassian/atlassian-mcp-server`.
- **Why**: Live confirmation requires an authenticated MCP connection (the full DCR + browser
  OAuth flow built in TASK-003/004/006/007), which needs an interactive browser session this
  non-interactive implementation session cannot drive. No live Atlassian MCP connection was
  established at any point during TASK-002 through TASK-009, so there is no live `tools/list`
  result available to confirm against.
- **Risk carried forward**: if the live tool names or request/response shapes differ from the
  ones used here, `AtlassianMcpAdapter`'s three methods will fail at runtime against the real
  server despite passing their mocked unit tests (which assert the mapping logic, not the real
  schema). This must be verified with a live, authenticated connection before this story is
  considered done — flagging for whichever stage first exercises the extension against a real
  Atlassian MCP endpoint (manual QA, or Architecture Review per `ai-factory-arch-review`) to
  confirm or correct.
- **Alternatives rejected**: Blocking TASK-009 entirely pending live verification — rejected
  because TASK-009's own §9 explicitly allows proceeding best-effort with this finding logged,
  and the adapter's mapping logic (the actual acceptance-tested behavior) is independent of the
  exact tool identifiers.
- **Made by**: Developer role (TASK-009)

## 2026-10-31 — Observed: `.mcp.json` is untracked and can disappear; recreated during TASK-010
- **Stage**: 05-Implementation
- **Decision**: While validating TASK-010, `McpConnectionService`'s existing tests (TASK-007)
  started failing with `ENOENT` on `.mcp.json` — the file had disappeared from the repo root
  between TASK-007's validation and TASK-010's. Recreated it from the content read earlier in
  this story (same `com.atlassian/atlassian-mcp-server`/`io.github.github/github-mcp-server`
  URLs) to restore the passing state. No code change was needed or made.
- **Why**: `git status` at this story's start already showed `.mcp.json` as untracked (`??`), so
  it isn't committed to the repo — it is reasonably believed to be this coding session's own
  Claude Code MCP tooling config, not a build artifact this project's tooling writes, and nothing
  in this session's own commands deleted it deliberately. Whatever removed it was outside this
  session's control (not attributable to any command run here).
- **Risk carried forward**: `McpConnectionService`'s constructor (TASK-007) reads this file from
  `context.extensionPath` at runtime and throws if it's missing — TechnicalDesign.md §16
  explicitly specifies reading `.mcp.json` this way, but relying on an untracked, non-shipped
  file for runtime configuration is fragile: a real packaged extension install would need this
  file bundled into its own install directory (via `.vscodeignore`/`files` packaging config,
  TASK-019/Release's concern), not relying on whatever sits in a developer's repo checkout.
  Flagging for Architecture Review or Release (TASK-019) to confirm `.mcp.json` is actually
  packaged with the shipped extension, or to reconsider embedding these two URLs as a committed
  resource instead.
- **Made by**: Developer role (observed during TASK-010 validation)

## 2026-10-31 — TASK-015: GitHub MCP tool names/parameters confirmed via public README, not live
- **Stage**: 05-Implementation
- **Decision**: Implemented `GithubMcpAdapter` using tool names/parameters researched from the
  official `github/github-mcp-server` repository's public README (fetched via a web-fetch
  subagent — HTTP 200, but only the first ~39K of ~120K characters were returned verbatim; the
  remaining tool sections came from a secondary summary, not verbatim text), not a live
  `tools/list` call (same session constraint as TASK-009 — no interactive browser available for
  the OAuth flow this would require). Findings used:
  - `pull_request_read` takes `{method, owner, repo, pullNumber, page?, perPage?}` where
    `method` is a selector, not a single "give me everything" call — confirmed enum values:
    `get`, `get_diff`, `get_status`, `get_files`, `get_commits`, `get_review_comments`,
    `get_reviews`, `get_comments`, `get_check_runs`. This **differs from TASK-015 §9 step 1's
    assumption of one combined call** — implemented as 4 separate `pull_request_read` calls per
    PR (`get` for `mergeable`, `get_reviews`, `get_comments`, `get_check_runs`), run concurrently
    via `Promise.all`, not a single call.
  - `search_users` (query, sort?, order?, page?, perPage?) exists and is read-only — used for
    `validateAuthor` (the task named this as an acceptable option if found; confirmed it exists).
  - `list_pull_requests`/`get_label` parameter names confirmed as `{owner, repo, state?, ...}` /
    `{owner, repo, name}`.
  - No rate-limit/quota tool is documented — `getRateLimitStatus` uses the task's own specified
    fallback (`{remaining: Infinity, resetAt: new Date(0).toISOString()}`), matching
    `GitHubViewController`'s existing behavior of never calling it.
  - **Response shapes** (not just request parameters) were not confirmed by this research at
    all — the adapter assumes standard GitHub REST API JSON shapes (e.g. `user.login`,
    `html_url`, `merged_at`) for `list_pull_requests`/`pull_request_read`/`search_users`/
    `get_label` results, which is a reasonable but unverified assumption about how this specific
    MCP server formats its tool results.
  - Also discovered while implementing: TASK-015 §9's `callWithSessionFallback` pseudocode calls
    `connectionService.callTool(serverId, name, args, {extraHeaders})` — a 4-argument call — but
    TASK-007's actual `McpConnectionService.callTool` signature (already implemented) only takes
    3 arguments; `extraHeaders` is a `connect()` option, not a `callTool()` option. Adapted to
    the real signature: `connect('github', {extraHeaders})` first (a no-op if already connected),
    then `callTool('github', name, args)` — same "session-first" behavior, correct call shape.
- **Risk carried forward**: identical in kind to TASK-009's — if the real response shapes or
  `method` semantics differ, this adapter will fail at runtime despite passing its mocked unit
  tests. Flagged for AC-015's live parity check (per TASK-015 §14, this task's own acceptance
  criteria already anticipates this adapter needs live verification before cutover).
- **Alternatives rejected**: Blocking TASK-015 entirely pending live verification — TASK-015 §9
  only mandates escalating/blocking for `validateRepo`/`validateAuthor` specifically if *no*
  viable tool exists after checking; it doesn't address the case where checking itself is
  infeasible in this session. Public-documentation research (this entry) is a reasonable
  substitute confirmation path, consistent with how Analysis.md itself was originally grounded
  ("from GitHub's public MCP server source").
- **Made by**: Developer role (TASK-015)

## 2026-10-31 — TASK-017: GithubMcpAdapter amended to throw legacy {status,message} shape
- **Stage**: 05-Implementation
- **Decision**: Per TASK-017 §9 step 2's explicit compatibility check, ran the error-shape
  compatibility logic mentally/by inspection against `src/github/errorClassifier.ts` (untouched,
  byte-for-byte diff confirmed empty): it inspects `{status, message, response.headers}`, but
  `GithubMcpAdapter.fetchOpenPullRequests` was throwing a raw `McpToolError`
  (`{serverId, category, detail, resetAt}`) with no `status` field — every failure would have
  fallen through to `category: 'network'`, silently breaking rate-limit/auth-expired/invalid-entry
  classification. Amended `src/github/githubMcpAdapter.ts` (TASK-015's file, not TASK-017's) to
  catch any error inside `fetchOpenPullRequests` and translate it via a new `toLegacyThrownShape`
  function before it escapes: `auth-expired`→401, `invalid-entry`→400, `network`→0,
  `rate-limited`→**403 with `response.headers['x-ratelimit-remaining']='0'`**
  (+ `x-ratelimit-reset` if `resetAt` was present).
- **Why / deviation from TASK-017's own suggested mapping**: TASK-017 §9 step 2's parenthetical
  suggested `rate-limited→429`, but `ErrorClassifier.classify` only recognizes rate-limiting via
  `status === 403 && response.headers['x-ratelimit-remaining'] === '0'` — it has no 429 branch,
  so a 429 would have fallen through to `'network'`, the exact failure this amendment exists to
  prevent. Used 403+headers instead, since that is what actually makes
  `refresh_rateLimitHandling_setsRateLimitedUntil` (the test the task itself flags as "most
  directly exercises this constraint") pass. Confirmed by actually running it — it failed with
  429, passed with 403+headers.
- **Alternatives rejected**: Following the literal 429 suggestion — would have silently broken
  rate-limit handling, the opposite of this constraint's entire purpose.
- **Made by**: Developer role (TASK-017)

## 2026-10-31 — Circular dependency between TASK-019 and TASK-014/018 resolved
- **Stage**: 04-ExecutionPlan (ITPS) / 05-Implementation
- **Decision**: TASK-019's §4 Dependencies listed TASK-014 and TASK-018, but those two tasks'
  own §9 step 2 reference-check cannot pass until TASK-019 removes the last live
  `JiraClient`/`GitHubClient` imports from `extension.ts`/`JiraDashboardPanel.ts`/
  `SidebarProvider.ts`/`DashboardPanel.ts` — a genuine dependency cycle (confirmed: the Developer
  hit it directly — TASK-014 and TASK-018 both correctly reported Blocked for exactly this
  reason). Resolved by removing TASK-014/TASK-018 from TASK-019's own dependency list (TASK-019
  never actually needed `client.ts` to already be deleted — its own step 1 just removes an
  import statement, which works whether or not the target file still exists) and instead adding
  TASK-019 as a dependency of TASK-014 and of TASK-018.
- **Why**: TASK-019's step 1 comment ("already compile errors at this point, since TASK-014/018
  deleted their targets") reveals the Planner's original mental model had TASK-019 running
  *after* the deletions, consistent with the original dependency list — but that model
  overlooked that TASK-014/018 themselves refuse to delete a file still live-imported elsewhere
  (their own, correct, self-protecting check), so the deletions could never happen first. The
  actual achievable order is: domain migration (009-013, 015-017) → wiring (019, which removes
  the dangling imports) → cleanup deletion (014, 018, now safe).
- **Alternatives rejected**: Having the Developer silently delete `client.ts` while
  `extension.ts` still imports it (temporarily breaking the build mid-task) — rejected, since
  that is precisely the failure mode TASK-014/018's own §9 step 2 exists to prevent, and
  "stop and report" is exactly what the Developer correctly did.
- **Made by**: Architect/Analyst, per Developer's Blocked reports on TASK-014 and TASK-018

## 2026-10-31 — Execution Plan gap found: Jira webview UI/message still asked for email+API token
- **Stage**: 05-Implementation (post-implementation, found by the user after all 19 tasks)
- **Decision**: After all 19 Task Packages were marked Completed, the user noticed the Jira
  configuration UI (both `JiraDashboardPanel.ts` and `SidebarProvider.ts`'s inline config tab)
  still presented Email and API token fields and the `JiraIncomingMessage` `jira.saveConnection`
  variant still carried `{baseUrl, email, apiToken}` — stale from before the MCP/OAuth
  migration. None of the 19 tasks ever updated this: TASK-008 explicitly froze
  `JiraIncomingMessage` ("Excluded: ... Fixing the resulting compile errors in ... unchanged"),
  and TASK-013 explicitly froze "message handling (unchanged)" for `handleMessage`'s dispatch —
  neither task's scope covered the webview HTML content or the message *shape* itself, and no
  other task picked it up. This was a genuine gap in the Execution Plan, not a deliberate
  deferral. Fixed directly (not as a new numbered Task Package, since it's a small, mechanical
  correction with no open design question): `JiraIncomingMessage`'s `jira.saveConnection` variant
  is now `{command: 'jira.saveConnection', siteUrl: string}`; `JiraViewController.handleMessage`
  reads `msg.siteUrl`; both webview forms now show a single "Jira site URL" field and a "Connect
  to Jira" button (mirroring GitHub's existing "Sign in to GitHub" button — no manual credential
  entry for either provider, consistent with Design.md's already-approved browser-OAuth model).
- **Why**: The backend (`JiraConnectionStore.saveConnection(siteUrl)`, TASK-010) already moved
  to OAuth-only — a site URL plus a server-side `connectionService.connect('atlassian')` browser
  flow — but the UI asking for Email/API token was both misleading (those values were silently
  discarded) and inconsistent with the GitHub panel's equivalent, already-OAuth-only UI.
- **Alternatives rejected**: Leaving the stale fields in place since "no task covered it" —
  rejected; the fields were actively wrong (collecting data that's thrown away) and visibly
  inconsistent with the parallel GitHub flow, not just undocumented.
- **Made by**: Developer role, per user-reported UI inconsistency

## 2026-10-31 — Live-testing bug chain: Jira connect failures were showing a blank/generic reason
- **Stage**: 05-Implementation (live testing, user-reported)
- **Decision**: The user tried connecting to Jira live and saw only a generic message ("Could
  not authorize with Atlassian.", then after one fix, "Could not save Jira connection."), never
  the actual underlying reason. Traced through two separate bugs that each discarded the real
  detail:
  1. `src/mcp/errorMapper.ts`'s `McpErrorMapper.mapError` had no branch for an
     already-classified error (`LoopbackRedirectServer`'s `{category, detail}` shape, or an
     `McpToolError` being re-thrown through `McpConnectionService.connect()`'s own catch-all) —
     it only recognizes `{status}`/`{code,message}` shapes, so an already-classified error fell
     through to the generic `'Unknown MCP error'`/`'Unknown error'` fallback, discarding its own
     specific `.detail` (e.g. "OAuth state mismatch", "OAuth callback timed out", a real DCR
     rejection message). Added a pass-through branch for this shape.
  2. Several fallbacks used `??` (nullish coalescing) where the real-world failure value was an
     **empty string**, not `null`/`undefined` — `??` doesn't treat `''` as absent, so an empty
     message/detail was preserved instead of replaced by the fallback text, silently producing a
     blank `reason` that the webview then replaced with its own generic text
     (`'Could not save Jira connection.'` in `SidebarProvider.ts`). Changed every such guard
     (`errorMapper.ts`'s two fallbacks, `JiraConnectionStore.saveConnection`'s catch) from `??`
     to `||` so an empty string is treated the same as missing.
- **Why**: Both bugs compounded to make the live OAuth failure (this story's long-flagged OTQ-1
  risk) undiagnosable from the UI alone. Fixing them doesn't resolve the underlying
  authorization failure itself — it makes the real reason visible so it *can* be diagnosed.
- **Status**: the actual root cause of the Atlassian connection failure is still unknown as of
  this entry — the user needs to retry after rebuilding to see the now-unmasked real reason.
- **Made by**: Developer role, per user-reported live test failure

## 2026-10-31 — OTQ-1 materialized live: Atlassian DCR rejected registration; fixed with `application_type: 'native'`
- **Stage**: 05-Implementation (live testing, user-reported) — **this is OTQ-1's first live
  occurrence**, flagged since TechnicalDesign.md §28/Design.md §23/Requirement.md §21/Analysis.md
  as the single largest feasibility risk in this entire story: "whether Atlassian's DCR actually
  accepts this extension's registration."
- **Decision**: Added a temporary diagnostic `fetch` wrapper to `StreamableHTTPClientTransport`
  (logging only URL/status/response body — never the `Authorization` header or any
  token/`extraHeaders` value) to find exactly which live HTTP call was failing, since
  `McpErrorMapper`'s "Unknown MCP error" gave no actionable detail. The logs showed the full
  discovery chain succeeding (`/.well-known/oauth-protected-resource/v2/mcp` → 200,
  `/.well-known/oauth-authorization-server/<issuer>` → 200), then:
  `POST https://auth.atlassian.com/<issuer>/dcr/register -> 400`, body
  `{"timestamp":...,"status":400,"error":"Bad Request","path":"/.../dcr/register"}` — a generic
  Spring-style error with no OAuth-shaped `error`/`error_description` field, which is why the
  SDK's `parseErrorResponse` produced an unhelpful empty-message `ServerError`.
- **Root cause (high-confidence, not yet Atlassian-confirmed)**: our `clientMetadata()`
  (`src/mcp/oauthClientProvider.ts`) never sent an `application_type` field. Per RFC 7591, the
  default when omitted is `'web'`, which per RFC 8252 typically forbids a loopback
  `http://127.0.0.1:<port>/callback` redirect URI (exactly what `LoopbackRedirectServer`,
  TASK-004, produces) — `'native'` explicitly permits it. Added
  `application_type: 'native'` to `clientMetadata()` (cast, since the SDK's own
  `OAuthClientMetadata` zod type doesn't declare this field — the server reads our raw JSON
  body, not the SDK's local type, so this is safe to send regardless).
- **Not yet confirmed**: whether this fully resolves Atlassian's rejection — the user needs to
  rebuild and retry. If DCR still fails after this, the discovery metadata also advertised
  `"client_id_metadata_document_supported": true`, meaning Atlassian may expect the newer
  Client ID Metadata Document (CIMD) mechanism instead of/alongside classic DCR for some client
  types — that would be a materially bigger follow-up (requires a publicly-hosted, static HTTPS
  metadata document acting as the `client_id`, which a local VS Code extension cannot trivially
  provide) and should come back to the Architect role if it turns out to be necessary.
- **Made by**: Developer role, per user-reported live test failure and follow-up diagnosis

## 2026-10-31 — OTQ-1 resolved live: DCR succeeds with `client_name`+`application_type`; found and fixed a second, self-inflicted `state` bug
- **Stage**: 05-Implementation (live testing, user-reported)
- **Decision**: With both `application_type: 'native'` and `client_name` added,
  `POST .../dcr/register` returned **201** live, with a real `client_id` (and, notably, a
  `client_secret` despite requesting `token_endpoint_auth_method: 'none'` — Atlassian issues one
  anyway; not acted on, since our provider never sends it back, consistent with BR-002). This
  resolves OTQ-1 — Atlassian's DCR does accept this extension's registration, with these two
  additional `clientMetadata` fields.
- The browser authorization itself then completed (user granted consent, browser redirected
  back to the loopback server) — but `LoopbackRedirectServer` rejected the callback with its
  own `'Invalid state. You can close this window and return to VS Code.'` /
  `{category: 'invalid-entry', detail: 'OAuth state mismatch'}`. Root cause, confirmed by reading
  `@modelcontextprotocol/sdk`'s source directly: `client/auth.js`'s `auth()` only reads
  `provider.state()` if the method exists (`const state = provider.state ? await
  provider.state() : undefined`), and `startAuthorization()` only sets the `state` query
  parameter on the real authorization URL `if (state)` is truthy. Our
  `createOAuthClientProvider` generates its own `state` value and gives it to
  `LoopbackRedirectServer.start(state)` (as the loopback server's own CSRF `expectedState`), but
  never implemented the optional `OAuthClientProvider.state()` method — so the SDK never sent
  any `state` parameter to Atlassian at all, Atlassian's callback echoed back none, and our own
  server's `params.get('state') !== expectedState` check failed every single time (`null !==
  <our random hex string>`) regardless of whether the user actually authorized correctly. This
  was a self-inflicted bug in our own TASK-006 code, not an Atlassian-side issue.
- **Fix**: added `state(): string { return state; }` to `createOAuthClientProvider`'s returned
  provider object, returning the exact same value already passed to
  `LoopbackRedirectServer.start()`.
- **Not yet confirmed**: whether the full round trip (DCR → browser consent → callback →
  `transport.finishAuth` → token exchange → actual MCP tool call) now completes end-to-end —
  awaiting the user's next live retry.
- **Made by**: Developer role, per user-reported live test failure and follow-up diagnosis

## 2026-10-31 — Third live bug: retried `client.connect()` reused an already-started transport
- **Stage**: 05-Implementation (live testing, user-reported)
- **Decision**: After the `state()` fix, the next live attempt failed with
  `"StreamableHTTPClientTransport already started! If using Client class, note that connect()
  calls start() automatically."` Root cause: `McpConnectionService.doConnect`'s
  `UnauthorizedError` retry path called `transport.finishAuth(code)` and then
  `client.connect(transport)` **again on the same transport instance** that the first
  `client.connect(transport)` attempt had already started (per the SDK's own in-code note,
  `Client.connect()` calls `transport.start()` internally, and a `StreamableHTTPClientTransport`
  refuses a second `start()`). Confirmed via `node_modules` source
  (`client/streamableHttp.js`'s `finishAuth` only touches `this._authProvider`/cached discovery
  state, not the started-flag, so it was safe to keep calling on the original transport; the
  problem was only the second `client.connect(transport)` call).
- **Fix**: `doConnect` now calls `transport.finishAuth(code)` on the original transport (cheap —
  reuses its cached discovery state), then builds a **fresh** `{client, transport}` pair via
  `this.createClientPair(...)` for the actual retry connect, which authenticates using the
  tokens `finishAuth` just saved via `provider.saveTokens`.
- **Pattern note**: this is the third bug found via live testing where a retry/second-attempt
  path reused a stateful object that only supports being used once (loopback server reuse was
  already guarded against at the design level in TASK-004/006; this was the analogous mistake
  one level up, at the transport/client level, not caught by any mocked unit test because the
  test doubles don't model the SDK's own single-use `start()` guard).
- **Not yet confirmed**: whether the full round trip now completes end-to-end — awaiting the
  user's next live retry.
- **Made by**: Developer role, per user-reported live test failure and follow-up diagnosis

## 2026-10-31 — OTQ-1 follow-up: `application_type` alone didn't fix it; two more findings
- **Stage**: 05-Implementation (live testing, user-reported)
- **Decision**: After adding `application_type: 'native'`, re-tested live — the DCR call still
  returns the identical `400 Bad Request` with the same empty-detail body. Added request-body
  logging to the diagnostic `fetch` wrapper (logs only our own client-metadata payload, which
  carries no secret — never the token/header values) and captured the exact body sent:
  `{"redirect_uris":["http://127.0.0.1:<port>/callback"],"token_endpoint_auth_method":"none",
  "grant_types":["authorization_code","refresh_token"],"response_types":["code"],
  "application_type":"native","scope":"read:me read:account offline_access email
  read:jira:agent-interface write:jira:agent-interface ... manage:jira:agent-interface ...
  write:all:twg ... write:jira-align:agent-interface ..."}` (scope truncated in the log, but
  spans effectively every scope Atlassian's protected-resource metadata advertises, including
  write/delete/manage scopes across Jira, Confluence, JSM, Bitbucket, Loom, Talent, Jira Align,
  Teams).
- **Finding 1 — the oversized `scope` is the SDK's own fallback, not ours**: traced to
  `@modelcontextprotocol/sdk`'s `auth()` function (`client/auth.js`):
  `const resolvedScope = scope || resourceMetadata?.scopes_supported?.join(' ') ||
  provider.clientMetadata.scope;`. Since Atlassian's `WWW-Authenticate` challenge on the initial
  401 didn't itself specify a `scope` directive, the SDK fell through to priority 2 — the
  protected-resource metadata's full `scopes_supported` list — which always wins over our own
  `clientMetadata.scope` (priority 3) whenever it's populated, which it always is here. **We
  cannot override this from `createOAuthClientProvider` through the documented
  `OAuthClientProvider` interface** — it's internal to the installed SDK version (1.32.2).
  Separately from whether this causes the 400: requesting write/delete/manage scopes
  unconditionally also conflicts with this story's own BR-003 (read-only only) — a real
  correctness concern regardless of the registration outcome, and one this story currently has
  no way to fix without either an SDK upgrade/patch or a different OAuth flow approach. Flagged
  for Architecture Review / a future story revision.
- **Finding 2 — tried adding `client_name`**: a very commonly *de facto* required DCR field
  even where RFC 7591 doesn't mandate it. Added `client_name: 'Dev Assistant (VS Code)'` to
  `clientMetadata()`. Not yet confirmed whether this resolves the 400 — awaiting the user's next
  live retry.
- **If this doesn't resolve it either**: the next things to try, in order of likely value: (a)
  temporarily set a much shorter `GITHUB_TOOLSETS`-style reduced scope by intercepting/overriding
  the SDK's resolved scope (would require either an SDK version bump that exposes this as
  configurable, or a local patch — a design-level decision); (b) check whether Atlassian's DCR
  endpoint requires `software_statement`/`jwks`/`contacts` fields we haven't tried; (c) escalate
  to Atlassian's own developer support/community forum with the exact (non-secret) request body
  above, since no public documentation found so far describes their DCR's specific validation
  rules beyond RFC 7591 itself.
- **Made by**: Developer role, per user-reported live test failure and follow-up diagnosis

## 2026-10-31 — TASK-002: @modelcontextprotocol/sdk pinned at 1.32.2, has a usable CJS build
- **Stage**: 05-Implementation
- **Decision**: Added `@modelcontextprotocol/sdk` to `package.json` `dependencies` pinned to the
  exact version `1.32.2` (no `^`/`~`/`latest`, per TechnicalDesign.md §25). Checked the installed
  package's own `node_modules/@modelcontextprotocol/sdk/package.json`: the package root is
  `"type": "module"`, but its `exports` map supplies a `"require"` condition for every entry
  point (e.g. `"."` → `"require": "./dist/cjs/index.js"`), and `dist/cjs/` ships its own
  `{"type": "commonjs"}` package.json. This is a dual ESM/CJS package, unlike `octokit`
  (ESM-only, no `require` condition in its exports, which is why `src/github/client.ts` needs the
  dynamic `import('octokit')` workaround). Resolves OTQ-4
  (TechnicalDesign.md §28/§24) for this package: no dynamic-import workaround is needed for
  `@modelcontextprotocol/sdk` — `src/mcp/connectionService.ts` (TASK-006/007) can use a normal
  static `import` and esbuild's `format: 'cjs'` bundling will resolve it through the package's
  `require` export condition to `dist/cjs/*`.
- **Why**: TASK-002 §14 Acceptance Criteria require this finding to be recorded before TASK-007
  writes its import, so the ESM/CJS question is answered once here rather than re-derived later.
- **Alternatives rejected**: Assuming ESM-only "to be safe" and pre-emptively applying the
  `octokit` dynamic-import pattern — would add an unneeded workaround; the package's own
  `exports` field shows a `require` condition exists.
- **Made by**: Developer role (TASK-002)

## 2026-11-01 — Fourth live bug: `AtlassianMcpAdapter.validateConnection` crashed on the real tool-result shape
- **Stage**: 05-Implementation (live testing, user-reported)
- **Decision**: The full OAuth round trip (DCR, browser consent, callback, token exchange) now
  succeeds, but clicking "Connect to Jira" then threw
  `TypeError: resources.find is not a function` from `atlassianMcpAdapter.ts`'s
  `validateConnection`. This is exactly the risk TASK-009's own DecisionLog entry flagged:
  `AtlassianMcpAdapter`'s three methods were written and unit-tested against an assumed
  already-parsed payload, never confirmed against a live `callTool` result. The live response
  (captured via the existing diagnostic fetch logging) showed the real shape is the MCP SDK's raw
  `CallToolResult` — `{ content: [{ type: 'text', text: '<json>' }] }` — where `text` is a
  JSON-encoded string of `{"data":{"resources":[{"cloudId":...,"url":...,"products":[...]}]}}`.
  `McpConnectionService.callTool` (confirmed by reading its source and its own test file) is an
  intentional thin pass-through of whatever `client.callTool()` resolves — it does no unwrapping
  — so each adapter is responsible for parsing its own tool's text payload. `atlassianMcpAdapter.ts`
  never did this for any of its three methods, and its unit tests mocked `callTool` resolving the
  already-parsed value directly, masking the mismatch (same failure class as TASK-017's/TASK-015's
  mocked-vs-real-shape gaps).
  Fixed: added a `parseToolResultText<T>` helper that unwraps `content[0].text` and `JSON.parse`s
  it; `validateConnection` now reads `raw.data.resources` and uses each resource's real `cloudId`
  field (not the assumed `id`); `fetchIssues` applies the same unwrapping to
  `searchJiraIssuesUsingJql`'s result. `validateQuery` needed no change — it never reads the
  resolved value. Updated `atlassianMcpAdapter.test.ts`'s mocks to resolve the real wrapped
  `CallToolResult` shape instead of a bare parsed object, so a future shape regression here would
  be caught by the unit tests again.
- **Not yet confirmed**: `searchJiraIssuesUsingJql`'s response shape (`{issues:[...]}` inside the
  unwrapped text) is still unverified against a live call — only `getAccessibleAtlassianResources`
  has been exercised live so far. Flagging for the next live retry (adding a saved query) to
  confirm or correct, same as TASK-009's original carried-forward risk.
- **Made by**: Developer role, per user-reported live test failure

## 2026-11-01 — UI gap found: no connection status/disconnect, saved-query list cramped
- **Stage**: 05-Implementation (post-implementation, found by the user after the connect flow
  started working live)
- **Decision**: The user pointed out two gaps in the already-connected Jira configuration UI
  (both `SidebarProvider.ts`'s Configuration tab and `JiraDashboardPanel.ts`): (1) nothing showed
  which Jira site was actually connected once `state.connected` was true, and no way to
  disconnect without touching settings directly; (2) saved queries rendered as single-line
  `gh-entry` pill tags (`label — jql`), which wrapped awkwardly and had no visual separation
  between fields, and the add-query inputs had no labels. Fixed:
  - `JiraViewState` gained `siteUrl: string | null`; `JiraViewController` now tracks it from
    `JiraConnectionStore.getConnection()` and includes it in `getState()`.
  - Added a `jira.disconnect` `JiraIncomingMessage` variant, handled by calling the already-
    existing `JiraConnectionStore.clearConnection()` then refreshing.
  - `SidebarProvider.ts`: connected state now shows a status row ("● Connected to
    <siteUrl>" + Disconnect button) above the saved-query list; saved queries render as bordered
    cards (label + JQL on separate lines) instead of inline pills; the add-query inputs got
    `<label>` elements.
  - `JiraDashboardPanel.ts`: added the matching status bar (site URL + Refresh/Disconnect) for
    consistency, since both views share the same `JiraViewState`/message contract.
  - Added `JiraViewController` unit tests for `siteUrl` population and `jira.disconnect` dispatch.
- **Why**: Both webviews share one `JiraViewState`, so the gap and the fix apply to both, not just
  the sidebar the user showed; fixing only one would leave the other visibly inconsistent again
  (same class of drift as the earlier "stale email/API-token UI" gap entry).
- **Alternatives rejected**: A full query-builder UI (field pickers, JQL autocomplete) — out of
  scope for a user-reported polish request; the existing free-text JQL input (already validated
  server-side via `AtlassianMcpAdapter.validateQuery`) is kept, just presented more clearly.
- **Made by**: Developer role, per user-reported UI feedback

## 2026-11-01 — Fifth live bug: `fetchIssues` crashed too — `searchJiraIssuesUsingJql` is also `data`-wrapped; blank-detail gap found in `JiraErrorClassifier` too
- **Stage**: 05-Implementation (live testing, user-reported) — resolves the "Not yet confirmed"
  risk carried forward from this file's previous entry
- **Decision**: With the connect flow and resources call working live, the first saved query
  ("My tasks") failed with the saved-query row showing "My tasks: undefined". Captured the real
  `searchJiraIssuesUsingJql` response via the existing diagnostic fetch logging:
  `{"result":{"content":[{"type":"text","text":"{\"data\":{\"isLast\":true,
  \"appliedContentFormat\":\"markdown\",\"issues\":[...]}}"}]}}` — the issues array is wrapped in
  a `data` object exactly like `getAccessibleAtlassianResources`'s resources were (this file's
  previous entry), not the bare `{issues:[...]}` TASK-009 assumed and the live-fix entry above
  carried forward unverified. `AtlassianMcpAdapter.fetchIssues` was reading `result.issues`
  (`undefined`), so `.map` threw a plain `TypeError`, not an `McpToolError`.
  Separately, this surfaced a second, independent bug: `JiraErrorClassifier.classify` assumed its
  input always has `.category`/`.detail` (true for a real `McpToolError`, false for a plain
  thrown `TypeError`) and returned `detail: undefined` with no fallback — the exact "blank
  reason" failure class already fixed once in this story for the connect flow, just in a
  different module that was never touched by that fix.
- **Fix**: `SearchJqlResult` changed to `{ data: { issues: SearchJqlIssue[] } }`; `fetchIssues`
  now reads `result.data.issues`. `JiraErrorClassifier.classify` now checks whether `error`
  actually has a recognized `.category` before trusting `.detail`, and otherwise falls back to
  the thrown value's own `.message` (or `'Unknown error'`), mirroring `McpErrorMapper`'s existing
  fallback pattern in `src/mcp/errorMapper.ts`. Updated `atlassianMcpAdapter.test.ts`'s
  `fetchIssues` fixtures to the real wrapped shape and added two `errorClassifier.test.ts` cases
  for the fallback.
- **Pattern note**: this is the second Atlassian MCP tool (of two now exercised live) found to
  wrap its payload in an extra `data` key beyond the SDK's own `content[0].text` envelope — worth
  assuming for any *other* Atlassian MCP tool this story or a future one adds, rather than
  re-discovering it a third time.
- **Made by**: Developer role, per user-reported live test failure

## 2026-11-01 — Sixth bug: `GithubMcpAdapter` had the identical unwrap bug, surfacing as "Unknown error" on the GitHub dashboard; sidebar also updated so the Daily Tasks tab isn't GitHub-only
- **Stage**: 05-Implementation (post-implementation, found by the user — the Daily Tasks dashboard
  showed a bare "Unknown error" banner, unrelated to this story's Jira code but discovered while
  investigating the sidebar)
- **Decision**: `GithubMcpAdapter` (TASK-015, predates this week's Jira-side fixes) has the exact
  same bug class as `AtlassianMcpAdapter` had: every `callWithSessionFallback(...)` result was
  cast directly to the expected parsed type instead of unwrapping the MCP SDK's raw
  `CallToolResult` (`{content:[{type:'text',text:'<json>'}]}`) — confirmed live via the existing
  diagnostic fetch logging showing `list_pull_requests`'s real response as
  `{"result":{"content":[{"type":"text","text":"[{\"number\":1201,...`. Unlike Atlassian's tools,
  GitHub's `text` is the bare JSON payload with no extra `data` wrapper. This threw a plain
  `TypeError` (`listed.filter is not a function` etc.), which `toLegacyThrownShape` then silently
  turned into `message: undefined` (it read the thrown value's `.detail`, which only exists on a
  real `McpToolError`) — producing the generic "Unknown error" banner, the same blank-reason
  failure class fixed for Jira's `errorClassifier.ts` above, now fixed here too with the same
  pattern: check for a recognized `.category` before trusting `.detail`, else fall back to
  `.message`.
  Fix: added `parseToolResultText<T>` to `githubMcpAdapter.ts`, applied to every
  `callWithSessionFallback` result (`list_pull_requests`, all four `pull_request_read` methods,
  `get_label`, `search_users`); `validateRepo` needed no change (never reads its result).
  Hardened `toLegacyThrownShape` with the same unclassified-error fallback used in Jira's
  `errorClassifier.ts`. Updated `githubMcpAdapter.test.ts`'s mocks to the real wrapped shape and
  added a case asserting an unparsable result throws its real message, not "Unknown error".
- **Separately, a user-reported UI gap**: the sidebar's "Daily Tasks" tab only ever showed a
  GitHub pull-requests card, so despite the tab's generic name it was effectively GitHub-only —
  misleading now that Jira tasks are part of this extension. Renamed that card to "GitHub Pull
  Requests" (accurate, since it only ever shows PRs) and added a second "Jira Tasks" card next to
  it (shown only once Jira is connected) that opens the existing `JiraDashboardPanel` via the
  already-registered `devUtilities.openJiraDashboard` command — previously only reachable via the
  Configuration tab, with no direct entry point from Daily Tasks. `SidebarProvider.ts`'s message
  dispatch gained an `openJiraDashboard` case.
- **Why**: Both findings came from the same screenshot/report (the GitHub dashboard's error
  banner, and the sidebar's PR-only Daily Tasks framing) and are independent of each other —
  bundled into one entry since they were investigated and fixed together, not because they share
  a cause.
- **Made by**: Developer role, per user-reported live test failure and UI feedback

## 2026-11-01 — Feature: combined GitHub + Jira "Daily Tasks" dashboard
- **Stage**: 05-Implementation (post-implementation, user-requested — a mockup screenshot showing
  a unified dashboard with a shared Attention Inbox, My PRs/Team PRs, My Jira Tasks and a Sprint
  Progress widget)
- **Decision**: `DashboardPanel.ts` ("Daily Tasks", previously GitHub-only) was rewritten to also
  construct a `JiraViewController` against the same webview panel (both controllers already only
  need `{webview}`, so one panel can host both — no new host abstraction needed) and merge their
  states client-side in the webview script. New layout: 4 stat tiles (Needs Attention / My PRs /
  Team PRs / My Jira Tasks, each linking to its section), an always-visible Attention Inbox
  combining GitHub PR attention items with Jira tasks due today/tomorrow/soon, then My PRs / Team
  PRs side by side, then My Jira Tasks — replacing the old single-filtered-list UX (one stat tile
  selected a list) since the user wants an at-a-glance view of everything, not a toggle.
  `RefreshScheduler` now calls both controllers' `refresh()`; message dispatch routes by
  `github.`/`jira.` command prefix, mirroring `SidebarProvider.ts`'s existing pattern.
  Stat-tile/badge colors use VS Code's `--vscode-charts-*` theme tokens (red/blue/purple/green/
  orange) rather than the mockup's literal hex/dark palette, so the page still adapts to the
  user's actual light/dark theme — consistent with every other panel in this extension, which
  never hardcodes colors (`ai-factory/gates/coding-standard.md`).
  **Not implemented — Sprint Progress**: no Jira sprint/board data is fetched anywhere in this
  codebase, and no MCP tool for it has been verified (same "best-effort, not live-verified"
  caveat as `getAccessibleAtlassianResources`/`searchJiraIssuesUsingJql` — TASK-009's entry
  above). Fabricating a progress percentage would be fake data, so this widget was deliberately
  left out rather than guessed. Flagged for a future story if the user wants it, once a real
  sprint-data tool is confirmed.
- **Supporting data-model changes**, per user's follow-up mid-turn request for richer PR/Jira
  info:
  - `JiraTask` gained `dueDate: string | null`; `AtlassianMcpAdapter.fetchIssues` now requests
    the `duedate` field and maps it. The dashboard classifies Jira "needs attention" as
    overdue/due-today/due-tomorrow (urgency-sorted), the only signal available without a
    per-task last-seen/change-tracking system (unlike GitHub's `AttentionEngine`, which has one).
  - `CommentSummary`/`PullRequestComment` gained `body: string` (previously only
    id/author/createdAt/url were mapped) so the Attention Inbox can show "New comment from
    &lt;author&gt;: '&lt;snippet&gt;'" for `new_activity` PR items, matching the mockup — the
    existing `checkStatus`/`mergeable` fields were already fetched and are now also surfaced as
    badges (checks passing/failing, has conflicts), which the prior single-list dashboard already
    showed but the initial combined rewrite had dropped.
  - **"My Jira Tasks" is user-identity-filtered, not "all saved queries"**: saved queries are
    arbitrary JQL and may return teammates' issues, not just the user's own, so counting every
    saved-query result as "mine" would overcount. Added `devAssistant.jira.currentUser` (a
    free-text Jira display name, surfaced in `SidebarProvider.ts`'s Jira configuration section via
    a new `jira.setCurrentUser` message/`JiraConfigStore.getCurrentUser`/`setCurrentUser`) and
    filter Jira tasks by `task.assignee === currentUser` for the "My Jira Tasks" tile/section and
    for the attention-urgency calculation. Falls back to showing all saved-query tasks with an
    inline hint to configure the name, rather than showing nothing, when unset.
  - **Why free-text instead of auto-detecting "me" from Jira**: no verified MCP tool exposes the
    authenticated user's own display name (the OAuth scopes include `read:me`/`read:account`,
    suggesting one likely exists, but confirming it would need a live, authenticated
    `tools/list` call this non-interactive session can't drive — same class of gap as TASK-009's
    "best-effort tool names" risk). A manual display-name field was chosen over guessing a tool
    name and risking another live-testing-only-discovered bug; auto-detection can replace it later
    once a real "whoami" tool is confirmed.
- **Made by**: Developer role, per user-provided mockup and follow-up requirements

## 2026-11-01 — Sidebar simplified to one "Daily Tasks" entry point; seventh live bug: PR entries missing `labels`/`requested_reviewers` crashed the whole GitHub fetch
- **Stage**: 05-Implementation (user-requested UI simplification + live-testing bug report)
- **Decision (sidebar)**: Now that the combined dashboard exists, the sidebar's separate
  "GitHub Pull Requests" and "Jira Tasks" cards (added in the "Sixth bug" entry above, before the
  combined dashboard existed) were redundant — removed both from `SidebarProvider.ts`'s Daily
  Tasks tab, leaving one "Daily Tasks" card that opens the combined dashboard. Removed the now-
  unreachable `openJiraDashboard` message/routing from the sidebar's own dispatch (the
  `devUtilities.openJiraDashboard` command and `JiraDashboardPanel` themselves are untouched and
  still reachable via the Command Palette).
- **Decision (crash)**: Live testing hit `Cannot read properties of undefined (reading 'map')` as
  the GitHub dashboard's failure-banner text (visible now *because* of the earlier "Unknown
  error" fix — this is the real underlying bug it was masking). Root cause: `mapPullRequest` and
  `fetchOpenPullRequestsImpl` called `.map()` directly on `entry.labels` and
  `entry.requested_reviewers` from the real `list_pull_requests` MCP response — TASK-015's own
  decision log already flagged that this adapter's response shapes were never live-verified. The
  real GitHub MCP server apparently omits these fields entirely for a PR that has neither (no
  `labels: []`/`requested_reviewers: []`), unlike the plain GitHub REST API which always includes
  them — so `entry.labels` was `undefined`, not an empty array.
  Fix: `ListedPullRequest.labels`/`.requested_reviewers` marked optional; every call site now
  falls back to `?? []` (`mapPullRequest`'s labels/reviews/comments/requestedReviewers,
  `deriveCheckStatus`'s checkRuns, and `fetchOpenPullRequestsImpl`'s unique-label-name
  computation). Added a regression test with a PR entry that omits both fields entirely.
- **Risk carried forward**: `get_reviews`/`get_comments`/`get_check_runs` are still assumed to
  return bare arrays (not `{reviews:[...]}`-style wrapper objects, the same wrapping pattern
  already found twice for Atlassian tools and once for `get_label`). If a future live test shows
  a *different* error message (e.g. "`.map` is not a function", not "undefined"), that wrapper
  shape is the next suspect — same diagnostic approach (the existing diagnostic fetch logging in
  `connectionService.ts` already captures the raw response body).
- **Made by**: Developer role, per user-requested UI simplification and reported live crash

## 2026-11-01 — Eighth bug: `get_check_runs` wraps its payload (`checkRuns.some is not a function`) — exactly the risk flagged above, now confirmed
- **Stage**: 05-Implementation (live testing, user-reported)
- **Decision**: As anticipated in this file's immediately preceding entry, a different error
  shape showed up next: `checkRuns.some is not a function`. Root cause: `pull_request_read`'s
  `get_check_runs` method proxies GitHub's real REST "list check runs for a ref" endpoint
  (`GET /repos/{owner}/{repo}/commits/{ref}/check-runs`), whose actual response is
  `{total_count, check_runs: [...]}` — not a bare array like `list_pull_requests`/`get_reviews`/
  `get_comments` turned out to be. So `checkRuns` was that wrapper object, not `undefined` (hence
  `.some is not a function` rather than "reading 'some' of undefined").
  Fix: added a `CheckRunsResponse = CheckRun[] | { check_runs?: CheckRun[] }` type and an
  `extractCheckRuns` helper that accepts either shape (bare array, for safety, or the real
  `{check_runs}` wrapper) and always returns a plain array; `deriveCheckStatus`'s input is now
  always normalized before use. Updated the existing test fixture to the real wrapped shape (it
  was accidentally testing the wrong shape this whole time) and added a dedicated regression test
  asserting a wrapped `check_runs` payload still derives the correct `checkStatus`.
- **Why `get_reviews`/`get_comments` were correctly assumed bare arrays but `get_check_runs`
  wasn't**: GitHub's own REST API is inconsistent here — "list reviews"/"list comments" return a
  bare JSON array, but "list check runs for a ref" is one of several GitHub list endpoints that
  wrap results in an object with a `total_count` sibling (also true of search endpoints) for
  pagination metadata. The MCP server appears to pass each REST response through unchanged, so
  this was a GitHub API shape inconsistency surfacing through the adapter, not an MCP-specific
  wrapping convention like Atlassian's `data` wrapper.
- **Made by**: Developer role, per user-reported live crash

## 2026-11-01 — Pre-release cleanup: removed temporary diagnostic logging from `connectionService.ts`
- **Stage**: 05-Implementation (pre-release cleanup, user-requested ahead of committing and
  building the first release)
- **Decision**: Removed both temporary diagnostics added earlier in this story while chasing the
  OAuth/DCR live-testing bugs (both explicitly comment-marked "Remove once confirmed" at the
  time): (1) the `StreamableHTTPClientTransport`'s diagnostic `fetch` wrapper in
  `defaultCreateClientPair` that logged every outgoing MCP request/response URL+status+body, and
  (2) the `console.error` diagnostic in `doConnect`'s catch block logging the raw error's
  constructor/name/message. Both have served their purpose — the OAuth flow (DCR, browser
  consent, callback, token exchange) and the subsequent adapter bugs they helped diagnose are now
  confirmed working and fixed (see this file's entries above). `McpErrorMapper.mapError` still
  classifies and surfaces real failure reasons through the normal UI failure-banner path, so no
  diagnostic signal is lost for actual end users — only this session's ad-hoc extra console
  logging is gone.
- **Why now**: Shipping debug-only console logging (including request bodies) in the first
  release would be noisy in the Extension Host log for every user, not just during this story's
  live debugging.
- **Verification**: `tsc --noEmit`, `eslint`, and the full test suite (161 tests) all pass
  unchanged after removal — confirms nothing depended on the diagnostic code path.
- **Flagging before release, not fixed here (out of this cleanup's scope)**: `.mcp.json` is still
  untracked (`git status` shows `??`), per this file's "`.mcp.json` is untracked and can
  disappear" entry above. Its content is non-secret (two public MCP server URLs only), so it's
  safe to commit, but if it isn't added to git before the release build, a fresh clone/packaged
  VSIX won't have it and `McpConnectionService`'s constructor will throw `ENOENT` on first
  activation. This needs `git add .mcp.json` as part of the commit, not just a code change.
- **Made by**: Developer role, per user request to clean up before committing/releasing
