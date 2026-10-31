---
name: ai-factory-arch-review
description: AI Factory stage 08 (Architecture Review). Branches on the story's tier — full ExecutionPlan.md/Task Package conformance checks per ai-factory/gates/ars-standard.md for Full-tier stories, or a single QuickReview.md conformance check for Quick-tier stories. Use after the Developer role has implemented, tested, and code-reviewed a story and it needs the Architect/Analyst's independent sign-off before Release.
---

# AI Factory — Architecture Review

Stage owner: Architect/Analyst role (default: Claude). This is the Architect/Analyst's re-entry
point after the Developer role's implementation stages — read the plan and the diff, not the
earlier conversation about how the design was chosen.

This is a **verification** activity, not a design activity: check conformance against decisions
already made upstream, don't make new ones. This stage exists specifically to *independently
re-check* what `07-CodeReview/CodeReview.md` already self-assessed — rubber-stamping it is an
anti-pattern, not a shortcut. That principle applies at both tiers; only the depth differs.

## Step 0 — read the tier
Read `stories/<slug>/.tier`. `quick` → Quick branch below. `full` (or missing, which
shouldn't happen this late — flag it) → Full branch below.

## Full branch
Produces `08-ArchitectureReview/ArchitectureReview.md` per `ai-factory/gates/ars-standard.md`.

### Allowed inputs
- `stories/<slug>/04-ExecutionPlan/ExecutionPlan.md` — for the FR ID ↔ Task ID
  mapping and Task-level intent.
- `stories/<slug>/04-ExecutionPlan/tasks/TASK-00N.md` for any task whose diff needs
  closer inspection than the plan-level summary gives you.
- The actual code diff / branch (read the real files, run `git diff`).
- `stories/<slug>/07-CodeReview/CodeReview.md` for context only, not a substitute.
- `stories/<slug>/05-Implementation/notes.md` for per-task status.
- `ai-factory/gates/ars-standard.md` — the quality standard this stage must satisfy.
- If something is unclear from ExecutionPlan.md alone, it's acceptable to also open
  `03-Design/Design.md` and/or `03-Design/TechnicalDesign.md` for the relevant conformance
  check specifically.

### Steps
1. Record `07-CodeReview/CodeReview.md`'s verdict as context; if it's missing or not Pass, record
   that as a limitation and continue — this stage can be invoked independently of stage 07 (see
   `agent.md`'s Guardrails).
2. Build the Traceability Matrix (§2): every FR ID mapped to its Task ID(s), verified only after
   actually checking the diff.
3. Walk all four conformance checks independently: Architectural (§3, vs Design.md), Technical
   (§4, vs TechnicalDesign.md §25/§27), Plan (§5, re-verify EPS Definition of Done yourself), and
   Behavioral (§6, independently re-run the CIS Scope Check).
4. Write findings (§7) with severity per `ai-factory/gates/ars-standard.md#severity-rubric`,
   each with a Task ID and file:line, plus a learning-loop Category and Root cause
   (`ai-factory/gates/learning-loop.md`). Append every Medium/High finding as a row to
   `docs/ai-learning/findings.md`, then run `node ai-factory/tools/findings-report.mjs --check`
   and `--write`.
5. Check Regression / Risk Re-check (§8).
6. Run the ARS AI Quality Gate self-check (8 questions) in
   `ai-factory/gates/ars-standard.md#ai-quality-gate` before recording a verdict.
7. Record Verdict & Rationale (§9): Pass requires zero unresolved High findings.
8. Needs Revision → cited Task ID(s) go back to the Developer role. Pass → tell the user the
   story is ready for stage 09-Release using `ai-factory/prompts/release.md`.

## Quick branch
Produces `08-ArchitectureReview/ArchitectureReview.md` from
`ai-factory/templates/QuickReview.md` — one conformance check against QuickPlan.md, not four
separate checks against four documents.

### Allowed inputs
- `stories/<slug>/04-ExecutionPlan/QuickPlan.md` — the single plan artifact.
- The actual code diff.
- `stories/<slug>/07-CodeReview/CodeReview.md` for context only.
- `stories/<slug>/05-Implementation/notes.md`.

### Steps
1. Record `07-CodeReview/CodeReview.md`'s verdict as context; if it's missing or not Pass, record
   that as a limitation and continue — this stage can be invoked independently of stage 07 (see
   `agent.md`'s Guardrails).
2. Walk the Conformance Check in `ai-factory/templates/QuickReview.md`: implementation matches
   QuickPlan.md's Approach and Tasks; only the listed files were touched; independently re-run
   the CIS Scope Check (don't inherit CodeReview.md's self-check); every task Completed per
   notes.md; acceptance criteria satisfied.
3. If anything found suggests this story actually needed Full-tier rigor (a force-Full signal
   slipped through), say so explicitly in the findings — per
   `ai-factory/gates/complexity-tiers.md#escalation-quick--full` — rather than passing it.
4. Write findings with severity, file:line, Category, and Root cause
   (`ai-factory/gates/learning-loop.md`). Append every Medium/High finding to
   `docs/ai-learning/findings.md`, then run `node ai-factory/tools/findings-report.mjs --check`
   and `--write`.
5. Record Verdict: Pass requires zero unresolved High findings.
6. Needs Revision → back to the Developer role via `ai-factory/prompts/implementation.md`. Pass
   → tell the user the story is ready for stage 09-Release using `ai-factory/prompts/release.md`.

## Output
- `stories/<slug>/08-ArchitectureReview/ArchitectureReview.md`
