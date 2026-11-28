# Backlog

Single ordered list of work to do. Product rules and scope live in
[roadmap.md](roadmap.md). Last reviewed 2026-11-28 against **v0.4.0** (PR #20).

Shipped in v0.4.0: Flagged/Impediment blockers, branch ticket key in the status bar,
working-hours auto-pause, Run Tool…, @mention inbox wiring, acceptance criteria on
cards, PR approvals.

Open work, in order: **1. AI Action Center**, **2. Webview UI migration (decision)**,
**3. Later**, **4. Housekeeping**. Findings from past spikes are at the bottom.

## 1. AI Action Center

Design: [ai-action-center.md](ai-action-center.md). Read-only AI analysis per ticket
or PR: what is going on, a list of actions with links, drafts and copy-ready
editor-AI prompts. The engine picks items, collects evidence and tracks progress.
The AI only reads and plans.

Rules: no writes to GitHub or Jira, no PR diff sent to the model, the engine owns
counts and priority, analysis text in English, no new runtime dependency.

| Phase | Work | Exit test |
|---|---|---|
| **0. Spike** | **Done 2026-11-28.** Findings in "AI Action Center spike" below. | Done |
| **1. Analyze on demand** | **Done (implementation).** Types, state hash, evidence, prompt, validator, cache, wiring, **Analyze** card UI (replaces Explain; keep card chat), settings and docs. | On your real inbox, Analyze gives valid actions for CI, comment and review-request cases, in VS Code (Language Model API) and Cursor IDE (Cursor CLI), with a first-try JSON pass rate of 90% or better on each |
| **2. Automatic runs and tracking** | Planner (max 3 per refresh, skip snoozed), hybrid trigger, done detection from engine state, manual done marks | Urgent cards are analyzed on open, nothing re-runs without a state change, actions complete by themselves |
| **3. Action Center view** | Prioritized actions across all items in the dashboard | — |

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
