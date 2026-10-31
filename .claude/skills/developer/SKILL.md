---
name: developer
description: >-
  Orchestrates the Developer role (AI Factory stages 05-07 and 09) for a story.
  Since this role runs in a separate coding agent (default: Cursor), this skill
  reads the story's tier, determines the current stage from its artifacts, and
  hands back the correct ready-to-paste prompt, in sequence, gated on each prior
  stage's verdict. Use when the user says "run developer on <story>", "what's next
  for <story>" once Architect has finished planning, or "give me the Cursor prompt
  for <story>".
---

# Developer Orchestrator

Router for the Developer half of the AI Factory pipeline (stages 05, 06, 07, 09),
implemented today by Cursor Agent but swappable for any coding agent. This skill cannot drive
that agent directly — Claude Code has no way to call into Cursor — so instead of executing the
stage itself, it inspects the story's tier and folder, decides which stage is next, and returns
the matching prompt from `ai-factory/prompts/` for the user to paste into their Developer-role
agent.

## Inputs
- A story slug or path under `stories/<slug>/`.

## Precondition
Read `stories/<slug>/.tier` first — it decides which plan artifact this story uses.

- **Full**: `04-ExecutionPlan/ExecutionPlan.md` must exist and contain the
  `**Gate confirmed by user — ...**` line (see
  `ai-factory/gates/approval-gates.md#recording-confirmation`), **and** at least one file must
  exist under `04-ExecutionPlan/tasks/` (the Task Packages per `ai-factory/gates/itps-standard.md`).
- **Quick**: `04-ExecutionPlan/QuickPlan.md` must exist and contain the confirmation line. There
  are no Task Packages at Quick tier — the Developer works from QuickPlan.md directly.

If the required artifact is missing or unconfirmed, stop and tell the user to run `architect`
first — do not hand out an implementation prompt against an unconfirmed or missing plan.

## Routing logic — Full tier
Check the story folder in this order and return the first matching prompt. Substitute
`{{story_path}}` in the returned prompt with the actual story path before presenting it.

1. **Any Task Package under `04-ExecutionPlan/tasks/` has no matching entry in
   `05-Implementation/notes.md`** → per ITPS, the Developer works one Task Package at a time —
   never hand over the whole plan. Pick the *first* such Task Package, in Task ID order, whose
   §4 Dependencies are all already marked Completed/Verified in notes.md (if none qualify yet,
   report that the story is blocked on a dependency and stop). Return
   `ai-factory/prompts/implementation.md` with `{{TASK-ID}}` substituted for that one
   package — not the others.
2. **Every Task Package has a Completed entry in notes.md, no `06-UnitTest/results.md`** →
   return `ai-factory/prompts/unit-test.md`.
3. **`06-UnitTest/results.md` exists, no `07-CodeReview/CodeReview.md`, or its verdict is Needs
   Revision** → return `ai-factory/prompts/code-review.md`.
4. **`07-CodeReview/CodeReview.md` verdict is Pass, no `08-ArchitectureReview/
   ArchitectureReview.md`** → default: stop; tell the user the story is waiting on the Architect
   role for stage 08 — nothing for Developer to do yet. If the user explicitly asks to stop here
   and commit/PR directly, follow `ai-factory/prompts/close-pipeline.md` instead (never skip on
   your own initiative).
5. **`08-ArchitectureReview/ArchitectureReview.md` verdict is Needs Revision** → identify which
   Task Package(s) the findings map to (ArchitectureReview.md should cite Task IDs; if it
   doesn't, treat that as a gap and ask the Architect role to amend it rather than guessing which
   task is at fault). Return `ai-factory/prompts/implementation.md` scoped to just those
   Task IDs, and tell the user to address the findings before re-running unit tests and code
   review.
6. **`08-ArchitectureReview/ArchitectureReview.md` verdict is Pass, no `09-Release/Release.md`**
   → return `ai-factory/prompts/release.md`. When presenting that prompt, remind the user/agent:
   push the story branch, **do not** use `gh` to open the PR — give the GitHub
   `…/pull/new/<branch>` create link plus drafted title/body for the human to create the PR.
7. **Everything above already done** → report the story has completed the full pipeline through
   Release; nothing further to do.

## Routing logic — Quick tier
No Task Packages, so this is a flat sequence, not a per-task loop:

1. **No `05-Implementation/notes.md`** → return `ai-factory/prompts/implementation.md` with
   `{{TASK-ID}}` omitted — note in the hand-off that the Developer reads
   `04-ExecutionPlan/QuickPlan.md` directly, one pass, not a Task Package.
2. **`05-Implementation/notes.md` exists, no `06-UnitTest/results.md`** → return
   `ai-factory/prompts/unit-test.md`.
3. **`06-UnitTest/results.md` exists, no `07-CodeReview/CodeReview.md`, or its verdict is Needs
   Revision** → return `ai-factory/prompts/code-review.md`.
4. **`07-CodeReview/CodeReview.md` verdict is Pass, no `08-ArchitectureReview/
   ArchitectureReview.md`** → default: stop; waiting on Architect for stage 08. If the user
   explicitly asks to stop here and commit/PR directly, follow
   `ai-factory/prompts/close-pipeline.md` instead (never skip on your own initiative).
5. **`08-ArchitectureReview/ArchitectureReview.md` verdict is Needs Revision** → return
   `ai-factory/prompts/implementation.md` again (whole QuickPlan.md re-pass, since there's only
   one task unit at this tier) with the findings to address.
6. **`08-ArchitectureReview/ArchitectureReview.md` verdict is Pass, no `09-Release/Release.md`**
   → return `ai-factory/prompts/release.md` (same no-`gh` / manual create-PR link reminder as
   Full tier step 6).
7. **Everything above already done** → report the pipeline complete for this story.

## Routing logic — Human context presentation (on-demand, overrides normal routing)
If the user explicitly asks for a human-readable write-up of a finished (or finishing) story
before its folder is removed, return `ai-factory/prompts/context-presentation.md` with
`{{story_path}}` and `{{output_name}}` substituted, instead of whatever the sequence above would
otherwise return. This is optional documentation, not an SDLC stage — it never blocks or
substitutes for the routing logic above, and running it doesn't advance or change any stage state.

## Constraints
- This skill never edits code or artifacts itself for stages 05-07/09 — those are the
  Developer agent's job when the returned prompt is actually run in that agent. This skill only
  figures out *which* prompt applies right now.
- Do not skip stage 07 (Code Review) or invent a Pass verdict — if `CodeReview.md` is missing or
  says Needs Revision, route back there, never straight to Architecture Review.
- If `.tier` says `quick` but `04-ExecutionPlan/tasks/` has files in it (or vice versa — `full`
  with no `tasks/` and only a `QuickPlan.md`), stop and flag the inconsistency rather than
  guessing which routing logic applies.
- If artifacts are in an inconsistent state (e.g. `Release.md` exists but `ArchitectureReview.md`
  doesn't), stop and flag it rather than guessing intent.
- The returned `implementation.md`/`code-review.md` prompts already cover reading
  `docs/ai-learning/recurring.md` and appending findings to `docs/ai-learning/findings.md`
  (`ai-factory/gates/learning-loop.md`) — this skill doesn't duplicate that, it just hands off
  the prompt that does.
