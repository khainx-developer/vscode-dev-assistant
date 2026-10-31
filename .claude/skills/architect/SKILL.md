---
name: architect
description: Orchestrates the Architect/Analyst role (AI Factory stages 01-04 and 08) for a story. Inspects the story's tier and which artifacts already exist, runs the correct next stage skill, and never advances past an unconfirmed Approval Gate. Use when the user says "run architect on <story>", "what's next for <story>", or gives a raw story to turn into Requirement/Design/ExecutionPlan, or asks for an Architecture Review after the Developer role finishes a story.
---

# Architect / Analyst Orchestrator

Router for the Architect/Analyst half of the AI Factory pipeline, implemented today by Claude.
Does not duplicate the per-stage logic — it decides which stage skill applies right now, based
on the story's tier (`ai-factory/gates/complexity-tiers.md`) and what artifacts exist, and
delegates to it.

Full tier dispatches to five skills: `ai-factory-requirement`, `ai-factory-design`,
`ai-factory-technical-design`, `ai-factory-exec-plan`, `ai-factory-arch-review`. Quick tier
dispatches to three: `ai-factory-requirement`, `ai-factory-quick-plan`, `ai-factory-arch-review`.
Read each skill's SKILL.md for the actual stage logic — this skill only decides *which one* to
run.

## Inputs
- A story slug or path under `stories/<slug>/`. If the user gives a raw story
  description with no existing folder, treat this as "start a new story": run
  `ai-factory-new-story` first, then continue below from stage 01.

## Routing logic
A gate counts as confirmed **only** if its artifact contains the
`**Gate confirmed by user — ...**` line described in
`ai-factory/gates/approval-gates.md#recording-confirmation` — a checked-off checklist alone is
not enough. Never skip ahead of an unconfirmed gate.

1. **No `01-Requirement/Requirement.md`** → run `ai-factory-requirement`. It decides the tier
   (writes `.tier`) as its first act, then produces Requirement.md in the shape that tier calls
   for, and stops at its gate.
2. **Requirement.md exists, no confirmation line** → stop, present the gate checklist again,
   wait for confirmation.
3. **Requirement.md gate confirmed** → read `.tier` and branch:

   **If `full`:**
   4. No `03-Design/Design.md` → run `ai-factory-design` (produces the SDS).
   5. Design.md exists, no confirmation line → stop, present the gate checklist, wait.
   6. Design.md gate confirmed, no `03-Design/TechnicalDesign.md` → run
      `ai-factory-technical-design` (produces the TDS — still stage 03, the code-level half).
   7. TechnicalDesign.md exists, no confirmation line → stop, present the gate checklist, wait.
   8. TechnicalDesign.md gate confirmed, no `04-ExecutionPlan/ExecutionPlan.md` → run
      `ai-factory-exec-plan`.
   9. ExecutionPlan.md exists, no confirmation line → stop, present the gate checklist, wait.
   10. ExecutionPlan.md gate confirmed → hand-off point to the Developer role. Tell the user the
       story is ready for `developer` and stop.

   **If `quick`:**
   4. No `04-ExecutionPlan/QuickPlan.md` → run `ai-factory-quick-plan` (replaces SDS+TDS+EPS in
      one step).
   5. QuickPlan.md exists, no confirmation line → stop, present the gate checklist, wait.
   6. QuickPlan.md gate confirmed → hand-off point to the Developer role. Tell the user the story
      is ready for `developer` and stop.

4. **(Either tier) `07-CodeReview/CodeReview.md` verdict is Pass, no
   `08-ArchitectureReview/ArchitectureReview.md`, and `DecisionLog.md` has no "Pipeline stopped
   after CodeReview (07)" entry** → run `ai-factory-arch-review` (it branches on `.tier` itself —
   full four-check review or the single Quick conformance check). If `DecisionLog.md` *does* have
   that entry (see `ai-factory/prompts/close-pipeline.md`), the story was intentionally closed at
   07 — report it as such, not as waiting on stage 08.
5. **ArchitectureReview.md verdict is Needs Revision** → tell the user the story is back with
   the Developer role to address the findings; nothing further for Architect right now.
6. **ArchitectureReview.md verdict is Pass** → tell the user the story has cleared Architect's
   part of the pipeline; it's with Developer for stage 09-Release onward.
7. **Everything above already done and passed, or the story is intentionally closed at 07** →
   report that Architect's stages are complete (or deliberately skipped, per `DecisionLog.md`)
   for this story; nothing to do.

## HumanAutoApprove (optional fast path)
If the user says `HumanAutoApprove: true` (anywhere in a message, any stage), log it once to
`DecisionLog.md` (e.g. `HumanAutoApprove enabled by user — {{date}}`) so it survives session
restarts — check `DecisionLog.md` for that line before asking the user to confirm any gate. While
enabled: at each Approval Gate, if the stage's own AI Quality Gate self-check came back clean (no
"No" answers), auto-confirm it — append the `**Gate confirmed by user — {{date}}
(HumanAutoApprove)**` line yourself and continue — and list every auto-confirmed gate in a
"Review queue" when you next hand off to the user. **Never** auto-confirm a gate whose self-check
failed — a failed check always stops and asks, regardless of this flag.

## Constraints
- Each delegated stage skill still enforces its own "read only the immediately-prior artifact"
  rule — this router doesn't change that, it just decides which stage applies.
- Never run two stages in the same turn without an explicit gate confirmation between them
  (HumanAutoApprove above is the one exception, and only when its own conditions hold).
- If `.tier` says `quick` but a Full-tier artifact exists (e.g. `Design.md`), or vice versa,
  stop and flag the inconsistency — likely an unlogged mid-story escalation — rather than
  guessing which set of rules applies.
- If artifacts are in an inconsistent state otherwise (e.g. QuickPlan.md exists but
  Requirement.md doesn't), stop and flag it rather than guessing intent.
- Read `docs/ai-learning/recurring.md` before stages 03/04 (each delegated skill's own steps
  cover this — see `ai-factory/gates/learning-loop.md`); at stage 08, findings are appended and
  `ai-factory/tools/findings-report.mjs` is run as part of `ai-factory-arch-review` itself.
