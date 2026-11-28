# Backlog

Single ordered list of work to do. Product rules and scope live in
[roadmap.md](roadmap.md). Last reviewed 2026-11-28 against **v0.5.0**.

Shipped in v0.4.0: Flagged/Impediment blockers, branch ticket key in the status bar,
working-hours auto-pause, Run Tool…, @mention inbox wiring, acceptance criteria on
cards, PR approvals.

Shipped in v0.5.0: AI Action Center Phases 1 to 3 (Analyze, automatic analysis,
progress tracking, Next actions, CI log analysis). AI needs a backend turned on and a
model chosen; there is no default model.

Open work, in order: **1. AI Action Center (live validation)**, **2. Webview UI migration (decision)**,
**3. Later**, **4. Housekeeping**. Findings from past spikes are at the bottom.

## 1. AI Action Center

**Open after v0.5.0 (live validation, no code planned):**

- [ ] Measure the first-try JSON pass rate (`firstTryPass=` in the "DevMate Kit" Output
  channel) on VS Code and on Cursor CLI; target 90% or better on each.
- [x] `devMateKit.ai.analysis.auto` defaults to `false` (opt-in, decided 2026-11-28). Revisit
  only if the pass rates justify a first-run prompt.
- [ ] Confirm `is_resolved` / `is_outdated` on a real PR with review threads.
- [ ] Try a second and a third model.

Design: [ai-action-center.md](ai-action-center.md). Read-only AI analysis per ticket
or PR: what is going on, a list of actions with links, drafts and copy-ready
editor-AI prompts. The engine picks items, collects evidence and tracks progress.
The AI only reads and plans.

Rules: no writes to GitHub or Jira, no PR diff sent to the model, the engine owns
counts and priority, analysis text in English, no new runtime dependency.

| Phase | Work | Exit test |
|---|---|---|
| **0. Spike** | **Done 2026-11-28.** Findings in "AI Action Center spike" below. | Done |
| **1. Analyze on demand** | **Done 2026-11-28 (Phase 1b).** Types, validator, prompt, cache, wiring, **Analyze** card UI, CI logs at Analyze time (`getFailedJobLogs` + `extractCiFailure`), real state hash (`headSha`, per-check conclusions, unresolved threads), **Re-analyze** force bypass, review comment path/line, toolset fallback + log error reporting. | On your real inbox, Analyze gives valid actions for CI, comment and review-request cases, in VS Code (Language Model API) and Cursor IDE (Cursor CLI), with a first-try JSON pass rate of 90% or better on each — **live pass-rate still to measure** |
| **2. Automatic runs and tracking** | **Done 2026-11-28.** Planner (max 3 per refresh, skip snoozed, failure backoff), hybrid trigger, stored analyses shown on open (ready and stale), done detection from engine state, manual done marks | Urgent cards are analyzed on open, nothing re-runs without a state change, actions complete by themselves |
| **3. Action Center view** | **Done 2026-11-28.** Next actions list on the Inbox tab (ready analyses only, priority/kind/recency sort, cap 8 + Show all, jump-to-card, same Open / Copy prompt / done controls) | With two ready analyses and one stale/unanalysed card, Inbox top lists the open actions; done on the list updates the card; jump scrolls to the card; counts unchanged |

**Phase 1b (finish Phase 1), from the 2026-11-28 review.**

1. ~~Wire CI logs into Analyze~~ — done.
2. ~~Real state hash (`headSha`, per-check conclusions, unresolved threads)~~ — done.
3. ~~**Re-analyze** sends `force` and skips the cache~~ — done.
4. ~~Review comments carry `path` / line into evidence~~ — done.
5. ~~Toolset fallback only after successful retry; log `getFailedJobLogs` errors~~ — done.
6. Measure the first-try JSON pass rate on Cursor CLI and on VS Code, and record it
   (still open; unit tests cannot cover live model JSON).

**Phase 1c (small fixes from the second review, 2026-11-28):**

1. [x] Check the cache **before** building evidence in `runAnalysis` (unless `force`).
   Today a click with an unchanged state still fetches check runs and up to 2000 log
   lines (about 500 KB) from GitHub, then discards them on a cache hit.
2. [x] The engine caps confidence, not only the prompt: if any failed check has no log
   excerpt, the stored result's confidence is forced to `low`. Remove the
   "Confidence must be low" sentence from the evidence text (instructions inside an
   untrusted block contradict the prompt's own rule); state the fact instead
   ("job logs: not loaded").
3. [x] Log a failed `getCheckRuns` in `buildEvidenceForAnalysis` instead of silently
   falling back to the snapshot.
4. [x] (Optional) Move `parseActionsRunId` and the `FailedJobLog*` / `PullRequestCheckRun`
   types out of `githubMcpAdapter.ts` into `src/shared` or `services/analysis`, so the
   pure service stops importing from `infrastructure`.

**Phase 1d (bug from the Phase 1c review, 2026-11-28).** [x] The cache-first change made a
cache hit rebuild evidence from the inbox snapshot only (`buildEvidenceFromInboxItem`)
and call `toAnalysisView(cached, snapshotEvidence, …)`. Effects on every cache hit
(second click, or any later click with an unchanged state):

- The handoff prompt loses the log excerpt, and uses the check name `checks` instead of
  the real one, because the cached analysis cites `check:<real name>` and the snapshot
  only has `check:checks`.
- **Open check** falls back to the PR URL (the snapshot check has no `detailsUrl`).
- The card says "Analyzed just now" for an analysis that may be days old, because
  `toAnalysisView` defaults `analyzedAt` to the current time.

Fix: store the card-ready `AnalysisView` (resolved links, handoff prompts, `analyzedAt`)
in the cache entry next to the `Analysis`, return it unchanged on a cache hit, and bump
the cache key to `v3`. Add a test that a cache hit returns the same handoff prompt, link
and `analyzedAt` as the first result.

Build Phase 0 and 1 on the existing plain-JS webview. The card UI change is small
(`items.js`), so it does not wait for the migration below.

## 2. Decision needed: Webview UI migration

Preact + JSX + TypeScript, about 6-8 days, pilot about 1 day. Status: proposed,
2026-11-15. Proposal: [webview-migration.md](webview-migration.md).

Recommendation: do the 1-day pilot (tool panel) before any UI-heavy work. The AI
Action Center adds one new card section, which is not UI-heavy, so defer the
migration until Action Center Phase 3 (the Action Center view) unless the card UI
gets painful to extend.

## 3. Later, only if needed

- **Inbox filters**: by repo, priority, PR vs ticket.
- **Custom attention rules**: ignore drafts, ignore or boost by label,
  configurable stale threshold (fixed at 3 days today), per-label opt-out for
  `jira-no-pr` (needs the `labels` field).

## 4. Housekeeping

- Remove the unused `@types/jest` devDependency (tests use mocha; `tsconfig` has
  `types: ["node", "mocha"]`).

---

# Findings (reference)

## Jira field spike

- **description**: MCP string (markdown/plain or HTML when forced); also accept ADF and flatten via `flattenAdf`; do not assume always ADF
- **issuelinks**: array of `{id, type:{id,name,inward,outward}, inwardIssue?|outwardIssue?}` with linked `status.statusCategory`
- **statusCategory**: `{id,key,colorName,name}` on status and sometimes top-level; keys `new`|`indeterminate`|`done`; JQL works
- **Flagged**: `customfield_10021`; value `[{value:"Impediment",id:"10019"}]`; JQL `flagged is not EMPTY` works
- **Acceptance criteria**: NOT a custom field on WD Story create-meta; heading in description (`## Acceptance Criteria` / `## Acceptance criteria`); else full description

## @mention detection

- Helper: `src/services/attention/mentions.ts`
- Reason ids: `jira-mentioned` / `pr-mentioned` (co-flagged with `*-awaiting-reply` when the latest comment mentions you)
- Identity: GitHub login from signed-in session (`githubState.me`); Jira display name from `devMateKit.jira.currentUser`; account id from comment text / config when present

## AI Action Center spike

Run 2026-11-28 on the live connection (hosted `api.githubcopilot.com/mcp/`, VS Code session token):

- **Q2, tools:** 49 tools, none from the actions toolset. `get_job_logs` is **not
  available** by default. `pull_request_read` (methods `get`, `get_check_runs`,
  `get_review_comments`, `get_comments`, `get_reviews`) is the only CI source today.
- **Decision:** request the toolset on the main GitHub connection with the header on
  the first connect (fall back without it), and enforce the read-only allowlist in
  code. Details in the design doc, "Decisions from the spike".
- **Actions toolset can be requested.** Header `X-MCP-Toolsets: default,actions` gives
  53 tools including `get_job_logs`, `actions_get`, `actions_list`. The path
  `/mcp/x/actions` gives 4 tools only. **`actions_run_trigger` is a write tool**: when
  the toolset is on, the engine must call only an allowlist of read tools
  (`get_job_logs`, `actions_get`, `actions_list`).
- **Q3, thread flags:** `is_resolved` and `is_outdated` are read by the shipped adapter
  (`githubMcpAdapter.ts`). The one PR tested had 0 threads, so live confirmation is
  still pending.
- **Q1, log content:** `get_job_logs` works with `{owner, repo, run_id, failed_only:
  true, return_content: true, tail_lines}`. It returns JSON `{failed_jobs, logs:
  [{job_id, job_name, logs_content}]}`. The run id comes from the check's
  `details_url` (`/actions/runs/{run}/job/{job}`). A plain 80-line tail of a .NET test
  job held only `Passed` lines (13 KB), so **a tail alone misses the failure**. The
  engine must fetch more lines and extract the failure excerpt itself. 2000 lines was
  499 KB raw. A loose match on `Exception` was noise (passing tests log expected
  exceptions), so extraction is tiered: strong failure markers first, loose
  matching only as a fallback. **Verified:** on the real failing .NET run the strong
  tier found 18 hits and 2 failed tests, with 0 loose hits needed. Findings from that
  run: (a) parameterized test names contain spaces, so capture up to the `[N ms]`
  suffix and group variants; (b) the log ends with post-job cleanup noise, so find the
  summary by marker, not by taking the last lines; (c) cap the excerpt at about
  8,000 characters (it was 11,956). Use a redacted copy of this excerpt as a unit-test
  fixture in Phase 1.
- **Check output:** the failed `test` check had no `output.summary`, so without logs
  there is almost nothing to analyze for `fix-ci`.
- **Q4, JSON:** `gpt-5.6-luna-low` returned valid JSON on the first try in 4 of 4 runs
  (13 to 15 s). Without an evidence rule it claimed `high` confidence from a PR title
  alone. With the rule "no log or comments means low and say what is missing" it
  answered `low`. With the real failure excerpt it gave a concrete diagnosis (medium
  confidence) and a checklist, and said it had no diff. Not yet tested: the Cursor
  CLI backend (covered by the retry path, measure in Phase 1) and review-request or
  comment cases.
- **Carried into Phase 1:** live confirmation of `is_resolved` and `is_outdated` (the
  one PR tested had 0 threads; the shipped adapter already filters on them, so Phase 1
  adds a real payload as a test fixture), the Cursor CLI JSON pass rate, and a
  second and third model. The spike code was throwaway and has been removed.
