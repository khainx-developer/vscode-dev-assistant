# AI Action Center (design)

Status: **Phases 1–3 built** (see [backlog.md](backlog.md)); live validation pending. Date: 2026-11-28.
Related: [roadmap.md](roadmap.md), [backlog.md](backlog.md).

## Goal

The Attention Inbox already tells you **what is flagged**. This feature tells you
**what to do about it**, so you stop opening GitHub and Jira, reading threads and
checking logs just to work out the next step.

> Open the dashboard. Each important card already says what is going on and lists
> the actions, each with a link to the exact place or a prompt to paste into your
> editor AI.

### User value

| Today | With analysis |
|---|---|
| "CI failed" badge, then open GitHub, find the job, scroll the log | "Lint error in `upload.ts` line 12", with **Open check** and **Copy prompt** |
| "2 new comments", then open the PR and read both threads | "Alice asks why the retry was dropped. Bob suggests a rename (optional)", with **Open comment** |
| "Review requested", then open the PR and work out what it is | "Adds retry to the uploader for WEB-123. CI green, 1 open question. Check error handling", with **Open PR** |
| Changes requested, then re-read every comment | Checklist of unresolved points by file and line, with a ready editor-AI prompt |

Success looks like this: for most urgent items you can tell your next step
**without opening GitHub or Jira**, and starting the work is one paste.

How we will know (local only, no telemetry): the Output channel logs, per session,
the JSON first-try pass rate, analyses run, cache hits, **Copy prompt** clicks and
**Open** clicks. The first review of these numbers is after two weeks of daily use.

## Principles

1. **The AI reads and plans. It does not do deep work.** Coding, debugging and
   diff review go to the editor AI, with the human driving.
2. **The engine is deterministic.** TypeScript rules detect situations, choose what
   to analyze, collect the evidence and track state. The AI never decides what is
   flagged and never fetches data.
3. **The AI is advisory.** There are no writes to GitHub or Jira. Output is read,
   copy or open.
4. **The engine owns counts and priority.** Status bar, badge, Home tab and inbox
   order stay rule-based. The AI only adds analysis and actions to a card.
5. **Pay only for change.** Analysis is cached by state and re-runs only when the
   state changes.
6. **No stored vendor keys.** Same providers as today (editor Language Model API,
   Cursor CLI).
7. **Untrusted input.** Comments and logs are data, never instructions (see
   Safety).

## Who does what

| Layer | Job |
|---|---|
| **Engine (TypeScript)** | Collect Jira, PR, CI and comments. Link ticket to PR. Pick important items. Collect evidence. Compute the state hash. Validate AI output. Track which actions are done. |
| **In-dashboard AI** | From the supplied evidence: summarize, spot questions, list actions, draft replies, write the checklist for the handoff. |
| **Editor AI** | Heavy work with workspace access: code changes, fixing CI, the actual PR review. Started by the human from a handoff prompt. |
| **Human** | Decides, replies, and drives the editor AI. |

## Scope

Analysis applies to Jira tickets, PRs linked to tickets, and standalone PRs (for
example a teammate's PR waiting for your review). For a review request the AI
summarizes context only (PR description, existing comments, linked ticket, CI
state) and says what to check. It does not read the diff.

Analysis text is always English. JSON keys and handoff prompts are English too.
Snoozed items are not analyzed automatically.

## Pipeline

```
refresh → inbox built (rules) → pick important items whose state hash changed
  → collect evidence → AI returns JSON → engine validates → cache + show on card
  → human acts → engine sees the change → action marked done
```

## What the AI sees

Sent to the model, after the existing secret scan:

| Input | Why |
|---|---|
| Full text of **unresolved** PR review threads, with file and line (outdated threads marked; resolved threads left out) | To say what to fix and where, without listing what is already fixed |
| Failed CI check name, summary and, when available, the tail of its log | To explain why CI failed |
| Jira acceptance criteria, status, linked issues, comments | To check comments and work against the requirement |
| PR title, description, review state, requested reviewers | Context, and the base of `review-context` |
| Item status, reasons, dates, assignee, labels | Context |

**Not sent:** the PR diff, tokens, OAuth secrets and raw API payloads.

Every piece of evidence gets a short **evidence id** (`c1`, `t2`, `check:lint`).
The AI refers to these ids. The engine owns all URLs.

## What the AI returns

The prompt instructs the model to return **only a single JSON object** that
matches the schema: no prose, no code fences.

```ts
interface Analysis {
  itemKey: string;              // Jira key, or owner/repo#number for a standalone PR
  stateHash: string;            // state the analysis was made for
  situation: string;            // one line
  confidence: 'high' | 'medium' | 'low';
  actions: ProposedAction[];    // empty means "nothing to do"
}

interface ProposedAction {
  kind: 'answer-question' | 'reply' | 'code-change' | 'fix-ci'
      | 'decide' | 'follow-up' | 'review-context' | 'none';
  title: string;                // "Alice asks why the retry was dropped"
  detail?: string;              // the specific points
  evidence: string[];           // evidence ids the AI relied on
  findings?: Finding[];         // what exactly to check (fix-ci, code-change)
  draft?: string;               // reply text, copy-ready (reply only)
  checklist?: string[];         // points to fix (code-change, fix-ci, review-context)
}

interface Finding {
  label: string;                // "InvoicePaymentTests.InitTransaction_ReturnTransaction"
  where?: string;               // "Wisory.Test/…/InvoiceTests.cs:42" or "upload.ts line 12"
  why?: string;                 // one line: "Expected 3 but was 2"
}
```

For `fix-ci` and `code-change`, **findings are the core of the card**: the list of
failed tests, build errors or review points to look at, each with where and why. The
engine pre-extracts the candidates (failed test names, compiler errors, thread file
and line) and passes them as evidence. The AI explains and groups them. The
validator drops any finding whose `label` does not appear in the supplied evidence,
so the AI cannot invent a test name.

The engine adds what the AI does not control: `id`, `actionKey`, `link` (resolved
from the evidence ids) and the final **handoff prompt** (see below).

### Validation

1. Extract the first JSON object from the reply.
2. Check it against the schema with a small **hand-written validator**. Do not add
   `zod` or similar: the dependency budget has about 56 KB left.
3. Drop any action that has an unknown `kind`, an empty `title`, or **evidence ids
   that were not supplied** (this blocks invented references).
4. If the JSON is unparseable or invalid, retry **once** with the validation error
   appended. If it still fails, show "Analysis unavailable" and leave the card as
   it is.
5. If every action is dropped, treat it as unavailable, not as "nothing to do".

## Action types

| Kind | When | What the card shows | Buttons |
|---|---|---|---|
| `answer-question` | A comment asks you something | One-line summary of the question | **Open comment** |
| `reply` | A reply is expected | Draft reply | **Copy draft**, **Open comment** |
| `code-change` | Review comments need code changes | Findings: each unresolved point with file and line | **Copy prompt** |
| `fix-ci` | A check failed | Findings: **which tests failed (or which build error)**, where, and why, then the likely cause | **Copy prompt**, **Open check** |
| `decide` | A human decision is needed | The question and options | **Open in Jira / PR** |
| `follow-up` | Ticket in progress with no PR, stale item | The nudge | **Open in Jira** |
| `review-context` | A PR is waiting for your review | What the PR is for, open discussion, CI state, what to check | **Open PR**, **Copy prompt** |
| `none` | Nothing to do | Reason | none |

### Handoff prompt (copy only)

The **engine** builds the prompt from a template, not the AI. The template inserts
the PR and ticket links, the AI's checklist, the findings (for CI: failed test
names with file and line), the failing check, the error excerpt and the relevant
comments. It always tells the editor AI to **fetch the live diff and data
itself**. It is copy-only: the human pastes it into Copilot, Cursor or any editor
chat. There is no chat-open integration.

## When analysis runs (hybrid)

- **On demand:** an **Analyze** button on every card. Never capped.
- **Automatic:** after a refresh, the engine picks important items (CI failed,
  changes requested, new question on a ticket you own, review requested from you,
  and so on) whose state hash changed, up to **3 per refresh** (a setting), highest
  priority first.
- **State hash:** PR head sha, latest comment ids, unresolved thread count, review
  state, CI conclusion per check, Jira status. No timestamps or other noise.
- **Cache:** last `Analysis` per item, keyed by `stateHash`. Same hash means show
  the cache and skip the AI. Entries expire after 14 days and the store holds at most
  200 items, oldest first out. It is cleared on sign-out.
- **Concurrency:** one analysis at a time per provider. In-flight analyses are
  cancelled when the AI is turned off or the window closes. The Cursor CLI is
  slower, so cards show an "analyzing" state and never block the dashboard.
- **AI off:** no automatic runs, no Analyze button. The card is unchanged.

## Engine tracking (progress and code changes)

The engine, not the AI, decides when an action is done, by comparing fresh state
with the analysed state:

| Action | Done when |
|---|---|
| `answer-question`, `reply` | A comment from you appears in that thread after the analysed comment |
| `code-change` | A new commit lands on the PR branch (marked "progress detected"), and the thread count drops or the review state changes |
| `fix-ci` | The named check turns green |
| `review-context` | You submit a review on the PR |
| `decide`, `follow-up` | Never automatic. Mark done by hand, or the item closes. |

A ticket or PR that closes drops all its actions. Done actions collapse out of
the card.

You can also **mark an action done by hand** and undo it. Each action has a stable
`actionKey` (kind plus its sorted evidence ids). A manual mark stays while a later
analysis still produces the same `actionKey`, so it survives refreshes and
re-analysis, and it disappears with the action.

## CI logs

`get_job_logs` is in the GitHub MCP **actions** toolset. The hosted server at
`api.githubcopilot.com/mcp/` does not enable it by default, and the adapter today
only calls `get_check_runs` (names and conclusions). Decision: **try the log tool,
fall back quietly.**

1. If the connection exposes `get_job_logs`, call it with `failed_only`,
   `return_content` and a `tail_lines` cap, and pass the tail to the AI.
2. Otherwise use the check name, summary and output text if present, plus a link to
   the failing check. `fix-ci` still appears, with lower confidence.

Read the live tool schema instead of hard-coding it: `failed_only` behavior is
changing upstream.

**Spike result (2026-11-28):** the default connection has 49 tools and no
`get_job_logs`. The actions toolset **can be requested** with the header
`X-MCP-Toolsets: default,actions` (53 tools, including `get_job_logs`). Rules:

- Only an allowlist of read tools may be called: `get_job_logs`, `actions_get`,
  `actions_list`. `actions_run_trigger` is a write tool and is never called.
- Without logs, a failed check often has no summary text, so `fix-ci` would be
  almost empty. Treat the log as the real input and the fallback as degraded.
- `get_job_logs` returns usable log text as JSON (`failed_jobs`, `logs[]` with
  `job_name` and `logs_content`). Call it with `failed_only: true`, the run id from
  the check's `details_url`, and `return_content: true`.
- **Do not rely on a tail, and do not match loosely.** On a .NET test job the last 80
  lines were all passing tests, and a loose match on `Exception` picked up exceptions
  that passing tests deliberately log. The engine fetches up to 2000 lines (about
  500 KB, so it never goes to the AI raw) and extracts the failure excerpt in tiers:
  1. **Strong markers** (`##[error]`, a `Failed <test>` line, `Failed!`, `Test Run
     Failed`, `Error Message:`, `Stack Trace:`, `Process completed with exit code`,
     `FAIL`, jest `●`, `npm ERR!`, compiler errors) with a little context.
  2. Only if there are none, a loose match (`Failed`, `error`, `Exception`).
  Passing-test lines are always dropped and long lines are clipped to 300
  characters. The excerpt is capped at about 120 lines and about 8,000 characters.
  The summary is found by marker (for example `Failed!  - Failed: 2, Passed: 98`),
  not by taking the last lines: GitHub Actions logs end with post-job cleanup
  noise (git config, orphan processes), which the spike confirmed.
- **Failed test names are extracted by the engine** from the `Failed <name>` line, up
  to the timing suffix (`[4 ms]`). The name can contain spaces and quotes
  (`Get_Role_CanRead(role: "Advisor")`). Parameterized variants are grouped under one
  finding with their variant list. This is deterministic engine code and is
  unit-tested with real log samples. It is what the AI actually reads. If the
  excerpt is empty or has only loose matches, the action says so and confidence
  is `low`.
- Open: whether to add the toolset header on the main connection or use a second
  connection.

## Card UX

```
WEB-123  Add retry to uploader                    ● Urgent
  PR #42 · CI failed · 2 review comments
  ── What to do ─────────────────────────────
  ☐ CI "test" failed: 2 tests to fix       [Copy prompt] [Open check]
       · CancelBooking_NotOwner_Throws   BookingTests.cs:100  expected 403, got 404
       · CancelBooking_Postponed_Throws  BookingTests.cs:118  expected 403, got 404
  ☐ Alice asks why the retry was dropped   [Open comment]
  ☐ Reply to Bob's naming suggestion       [Copy draft] [Open comment]
  Analyzed 2 min ago · confidence high     [Re-analyze]
```

States: not analyzed (**Analyze**), analyzing, analyzed, stale (state changed,
**Re-analyze**), unavailable (AI off or error, existing card shown).

A low-confidence result is labelled as such. **Analyze** is the only per-card AI
entry point: auto-analysis may fill **Next actions**, but the card’s analysis
panel stays closed until the user clicks **Analyze** (then Show/Hide). Card
**Ask AI** chat and inbox-wide **What should I do next?** were removed.

## Safety and privacy

- Same redaction and secret scan as today, applied to the new inputs. Log tails
  are length-capped **before** the scan.
- **Prompt injection.** Comments, descriptions and logs are untrusted. The prompt
  wraps them in delimited blocks and says to treat them as data. The AI's output
  is only displayed or copied: it triggers no tool calls. The engine builds the
  handoff prompt, wraps quoted comment text in delimiters, and tells the editor AI
  to treat quotes as data. The human is the gate before anything runs.
- The AI cannot invent links: it only refers to evidence ids, and the engine
  resolves them.
- No writes in this feature.
- The cache holds analysis text and hashes only, no tokens.

## Code layout (proposed)

Follows the existing layers in `src/`.

| Path | Contents |
|---|---|
| `src/services/analysis/types.ts` | `Analysis`, `ProposedAction`, evidence types |
| `src/services/analysis/stateHash.ts` | Pure hash from item state |
| `src/services/analysis/planner.ts` | Picks items to analyze (priority, cap, snooze, changed hash) |
| `src/services/analysis/prompt.ts` | Builds the analysis prompt from evidence |
| `src/services/analysis/validator.ts` | JSON extraction and schema validation |
| `src/services/analysis/handoff.ts` | Handoff prompt template |
| `src/services/analysis/actionTracker.ts` | Done detection and manual marks |
| `src/infrastructure/analysis/analysisStore.ts` | Cache in extension storage (expiry, size cap) |
| `src/infrastructure/github/githubMcpAdapter.ts` | Add evidence reads: unresolved threads, job logs |
| `src/app/aiCoordinator.ts`, `dashboardSession.ts` | Orchestrate, expose to the webview |
| `src/ui/webview/shared/items.js` | Card actions UI |

Everything under `services/` stays pure and unit-tested, as elsewhere.

## Settings

| Setting | Default |
|---|---|
| `devMateKit.ai.analysis.auto` | `true` when AI is on |
| `devMateKit.ai.analysis.maxAutoPerRefresh` | `3` |
| `devMateKit.ai.analysis.includeCiLogs` | `true` (falls back if unavailable) |

## Phases

Each phase has an exit test.

0. **Spike: done (2026-11-28).** Findings are in [backlog.md](backlog.md) and
   folded into this doc. Summary: the actions toolset is available by header,
   `get_job_logs` works, engine-side failure extraction finds the real failing
   tests, and the model returned valid JSON in 4 of 4 runs.
1. **Analyze on demand.** Types, state hash, evidence collection, prompt,
   validator, cache, **Analyze** on the card, actions with links, drafts, handoff
   prompts. *Exit: on your real inbox, Analyze produces valid actions for CI,
   comment and review-request cases, on both VS Code (Language Model API) and
   Cursor IDE (Cursor CLI), with a first-try JSON pass rate of 90% or better on
   each.* See **Phase 1 implementation plan** below.
2. **Automatic runs and tracking.** Planner and cap, hybrid trigger, done
   detection, manual marks. *Exit: urgent cards are analyzed on open, nothing is
   re-analyzed without a state change, and actions complete on their own.*
3. **Action Center view.** A prioritized list of actions across all items in the
   dashboard. See **Phase 3 implementation plan** below.

## Decisions from the spike

- **Actions toolset:** request it on the main GitHub MCP connection with the header
  `X-MCP-Toolsets: default,actions`, added where the adapter already passes
  `extraHeaders` on connect. The server then lists 53 tools (49 plus `actions_get`,
  `actions_list`, `actions_run_trigger`, `get_job_logs`). The first connect decides
  the tool list, so the header must be on that first connect, and a connection
  made without it must be re-made once. If the server rejects the header, retry
  without it and run with logs unavailable (the degraded `fix-ci` path).
- **Read-only allowlist:** the adapter may call only `get_job_logs`, `actions_get` and
  `actions_list` from the actions toolset. `actions_run_trigger` starts workflow
  runs and is never called. Enforce this in code (a guard that throws on any other
  `actions_*` name) and test it.
- **Backends:** the user works in **VS Code** (Language Model API, Copilot models)
  and **Cursor IDE** (usually no `vscode.lm` models, so the Cursor CLI backend).
  The spike only tested the Language Model API (`gpt-5.6-luna-low`). Phase 1 must
  measure the Cursor CLI JSON pass rate before the feature is called done.
- **One shared prompt**, with the evidence rule: confidence reflects how much real
  evidence there is, and "low" when a failed check has no log or there are no
  comments.
- **Jira description or label changes do not re-trigger analysis.**
- **Excerpt extraction is engine code**, tiered, with a reference sketch in the
  appendix.

## Phase 1 implementation plan

Build in this order. Each step is small, pure where possible, and has tests before
the next one starts. Run `npm run compile`, `npm run lint` and `npm test` after each.

1. **Types and validator** (`services/analysis/types.ts`, `validator.ts`). Hand-written
   JSON extraction and schema check. Drops actions with an unknown kind, an empty
   title, evidence ids that were not supplied, or findings whose label is not in the
   evidence. If all actions are dropped, the result is "unavailable", not "nothing
   to do". Tests: valid, fenced, prose-wrapped, wrong kind, invented evidence id,
   invented finding.
2. **State hash** (`stateHash.ts`). Pure. Tests: same state gives the same hash,
   each listed field changes it, a timestamp-only change does not.
3. **Failure excerpt and failed-test extraction** (`ciLog.ts`). Tiered strong and
   loose markers, passing-test lines dropped, summary found by marker, 300-character
   line clip, about 120 lines and 8,000 characters cap, parameterized test grouping.
   Use a redacted copy of the real .NET log from the spike as a fixture, plus small
   jest and pytest samples.
4. **Evidence builder** (`evidence.ts`). From an inbox item and its PR and Jira
   details, build the evidence list with short ids (`pr`, `t1`, `c1`, `check:<name>`,
   `ac`) and the link table the engine resolves. Unresolved, non-outdated threads
   only. Tests with a review-thread fixture carrying `is_resolved` and `is_outdated`.
5. **Prompt and handoff** (`prompt.ts`, `handoff.ts`). The analysis prompt with the
   schema, the evidence rule and delimited untrusted blocks. The handoff template
   with findings, excerpt and quoted comments in delimiters.
6. **Adapter** (`githubMcpAdapter.ts`). Add the toolset header on connect with the
   fallback, the read-only allowlist guard, and `getFailedJobLogs(owner, repo, runId)`
   (run id parsed from the check's `details_url`, `failed_only: true`,
   `return_content: true`, `tail_lines: 2000`). Tests for the allowlist, the run-id
   parse and the fallback.
7. **Analysis service** (`analysisService.ts`). Evidence, then AI, then validate,
   retry once with the error, then cache. Cancellation, one analysis at a time.
   Log the first-try pass rate to the Output channel. Tests with a fake AI port.
8. **Store** (`infrastructure/analysis/analysisStore.ts`). Cache keyed by item and
   `stateHash`, 14-day expiry, 200 items, cleared on sign-out. Tests with a fake
   memento.
9. **Wiring** (`aiCoordinator.ts`, `dashboardSession.ts`, `shared/messages.ts`).
   New command `analysis.run` and host events for analyzing, result and
   unavailable. Remove the Explain use-case here.
10. **Card UI** (`items.js`, CSS). **Analyze** button replacing **Explain**, the states,
    the action list with findings, **Copy prompt**, **Copy draft**, **Open** links.
    Keep card chat. Update the walkthrough text.
11. **Settings, docs, changelog.** The three settings, README and CHANGELOG entries,
    and mark Phase 1 done in [backlog.md](backlog.md).

**Out of scope for Phase 1:** automatic runs, the planner, done tracking, manual
done marks and the Action Center view (Phase 2 and 3).

## Phase 2 implementation plan

Goal: urgent cards arrive already analyzed, nothing is re-analyzed without a state
change, and actions complete by themselves. Build in this order, with tests after
each step. Phase 1 gives you: `AnalysisService` (serializes runs), `AnalysisStore`
(entry per item with `analysis` and card-ready `view`, keyed by `stateHash`),
`computeInboxItemStateHash`, `buildEvidenceForAnalysis`, and `toAnalysisView`.

1. **Stable action keys.** Give every action an `actionKey` (kind plus its sorted
   evidence ids). Add it to `AnalysisActionView` and the stored view. Pure, tested.
2. **Planner** (`services/analysis/planner.ts`, pure). Input: inbox items, a cache
   lookup (has a view for the current hash), the snoozed set, a backoff lookup, the
   cap. Output: at most `maxAutoPerRefresh` items, highest priority first. An item
   qualifies when it is not snoozed, has no cached view for its current hash, and is
   **important**: priority `urgent`, or a reason for a new comment, an @mention, a
   review requested from you, changes requested or failing checks (map to the real
   reason ids in `reasonLabels.ts`). Skip items whose last automatic attempt failed
   less than 30 minutes ago (backoff), so a bad item cannot retry on every refresh.
3. **Automatic runs** (`AiCoordinator`). After each inbox recompute (a hook from
   `DashboardSession`), plan and run sequentially through the same code path as
   Analyze (evidence, `AnalysisService`, `setView`), without the user-click
   `analysis.analyzing` flicker for items not on screen. Do nothing when AI is off,
   `devMateKit.ai.analysis.auto` is false, monitoring is paused, working hours
   pause, or a user-started analysis is running. Cancel on AI off, sign-out and
   dispose. Log "[analysis] auto: planned N, ran M" to the Output channel.
   Automatic runs never change counts, badges or priority.
4. **Show stored analyses.** New host event `analysis.snapshot` carrying, for the
   current inbox items: `ready` (view for the current hash), `stale` (a view exists
   for an older hash; show it dimmed with **Re-analyze**) or nothing. Send it when
   the dashboard opens, after each recompute and after each automatic run. The
   webview merges it into `analysisByKey`.
5. **Done tracking** (`services/analysis/actionTracker.ts`, pure). Store the
   `AnalysisStateSnapshot` the analysis was made for next to the view. Given that
   snapshot, the current item and your identity, return per-action status:
   - `answer-question`, `reply`: done when a comment by you is newer than the
     analysed latest comment in that thread.
   - `code-change`: "progress detected" when the head sha changed since the
     analysis (not done by itself); done when the unresolved thread count dropped
     to 0 or the review state is no longer changes requested.
   - `fix-ci`: done when every check named in its findings or evidence is now
     `success`; "progress detected" when the head sha changed.
   - `review-context`: done when you have a review on the PR.
   - `decide`, `follow-up`: never automatic.
   - Item closed or merged: drop all actions.
6. **Manual done marks.** A checkbox on each action row marks it done and can be
   undone. Marks are stored in `globalState` keyed by item key plus `actionKey`,
   survive refreshes and re-analysis while the same `actionKey` still appears, and
   are pruned with the 14-day expiry. Done actions collapse under a "Done" line.
7. **Webview.** Checkbox, "progress detected" label, stale state, done collapse.
   Keep it accessible (labels, keyboard).
8. **Docs.** README, CHANGELOG, walkthrough text, and tick Phase 2 in
   [backlog.md](backlog.md).

**Exit test:** open the dashboard after a refresh with two urgent items and one
non-urgent item: the urgent ones show analyses, the other shows only **Analyze**;
nothing re-runs on the next refresh; after you push a commit, `fix-ci` shows
"progress detected" and goes stale; after CI turns green it shows done.

**Out of scope:** the Action Center cross-item view (Phase 3), writes to GitHub or
Jira.

## Phase 3 implementation plan

Goal: a single "Next actions" list at the top of the Inbox tab so you see the
open work across analysed cards without scrolling every item. Built only from
data the webview already has (`analysis.snapshot` / `analysisByKey`); no new
host calls. Never changes counts, badges or priority.

1. **Pure list builder** (`services/analysis/nextActions.ts`). Input: inbox items
   plus the per-key analysis snapshot entries (ready/stale + actionStatus).
   Output: open actions only from **ready** entries (skip stale, done, dropped,
   `none`), sorted by item priority, then by kind order (`fix-ci`,
   `code-change`, `answer-question`, `reply`, `review-context`, `decide`,
   `follow-up`), then by item recency (`latestRelevantAt`, newest first). Cap
   helpers: default show 8, with a full list for "Show all". Mocha tests for
   filter, sort and cap.
2. **Webview section** (`dashboard/main.js`, CSS, shared render helpers as
   needed). Collapsible "Next actions" above the Attention Inbox list; remember
   collapsed state in webview UI state. Each row: item title and key, action
   title, kind badge, the same Open / Copy prompt / done checkbox as on the
   card. Clicking the item title scrolls to and highlights that card. Empty
   state: "No analysed actions yet. Analyze a card or turn on automatic
   analysis." Escape all text; keyboard accessible.
3. **Docs.** README, CHANGELOG, walkthrough, and tick Phase 3 in
   [backlog.md](backlog.md) when the exit test passes.

**Exit test:** with two ready analyses that have open actions and one stale /
unanalysed card, the Inbox top shows those open actions (≤8, or "Show all"),
sorted as above; marking one done on the list collapses it on the card too;
clicking a row title scrolls to the card; counts and badges are unchanged.

**Out of scope:** new host commands, writes to GitHub or Jira, analysing from
this list (use the card's Analyze).

## Appendix: reference extraction (from the spike, untested sketch)

This is a starting point for `ciLog.ts`, not final code. It includes the fixes the
spike found.

```ts
// Tier 1: markers that really mean a failure (dotnet/xunit, jest, pytest, runners).
const STRONG =
  /##\[error\]|^\s*Failed\s+\S|^\s*Failed!|Test Run Failed|Error Message:|Stack Trace:|Process completed with exit code|^\s*FAIL\b|^\s*●.*›|\bAssertionError\b|^\s*E\s{3}|npm ERR!|\bBUILD FAILED\b|error (CS|TS|MSB)\d+/;
// Tier 2: only when tier 1 finds nothing.
const LOOSE = /\bFailed\b|\bFAIL\b|\berror\b|Error:|Exception|Assert|exit code|\bfatal\b/i;
const NOISE = /^\s*(Passed|Skipped)\b/;
// Test name runs to the timing suffix; it may contain spaces and quotes.
const FAILED_TEST = /^\s*Failed\s+(.+?)(?:\s+\[[\d.]+\s*m?s\])?\s*$/;

// 1. Strip ANSI and the leading ISO timestamp from each line.
// 2. strongHits = lines matching STRONG and not NOISE; if none, use LOOSE.
// 3. Keep each hit with 2 lines before and 8 after; clip lines to 300 characters.
// 4. Add summary lines found by marker (`Failed!  - Failed: N`), never "the last N lines":
//    GitHub Actions logs end with post-job cleanup noise.
// 5. Cap at about 120 lines and about 8,000 characters (keep head and tail of the hits).
// 6. failedTests = unique FAILED_TEST captures; group parameterized variants by the
//    name before "(".
```

Measured on the real run: 2000 lines was 499 KB raw, 18 strong hits, 2 failed tests,
0 loose hits needed, and the first excerpt (11,956 characters) needed the cap above.

## Future (not decided)

Executing writes through the GitHub and Jira MCP (post a reply, transition a
ticket) with approval and an audit log. This touches only remote systems, not local
git, so the roadmap's "no git writes" rule still holds. Revisit after Phase 2, once
analysis quality is known.

## Still open (settled during Phase 1)

1. **Cursor CLI JSON pass rate.** The Language Model API passed 4 of 4. Measure the
   Cursor CLI with the shared prompt. Target 90% or better. If it is lower, tune
   the prompt for that backend or tighten the retry message.
2. **Review-thread flags live.** The shipped adapter already filters on `is_resolved`
   and `is_outdated`. Capture one real thread payload as a test fixture and confirm
   the field names. The one PR tested in the spike had no threads.
3. **Model range.** Only one model (`gpt-5.6-luna-low`) was tested. Try one stronger
   and one cheaper model if the pass rate looks fragile.

## Not in scope

PR diff analysis, code generation, test running, local git, auto-merge, and
anything the editor AI does better with workspace access.
