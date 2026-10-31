---
name: ai-factory-exec-plan
description: AI Factory stage 04 (Execution Plan). Reads only a story's TechnicalDesign.md (TDS) and produces a full Execution Plan Specification (ExecutionPlan.md) per ai-factory/gates/eps-standard.md, then decomposes it into one-file-per-task Implementation Task Packages per ai-factory/gates/itps-standard.md. Use when a story's Technical Design has been approved and needs to be broken into a deterministic, drift-proof task list.
---

# AI Factory — Execution Plan

Stage owner: Architect/Analyst role (default: Claude), acting as **the Planner**. Produces
`04-ExecutionPlan/ExecutionPlan.md` (an EPS) plus one `04-ExecutionPlan/tasks/TASK-00N.md` Task
Package per task (an ITPS) for one story. This is the last Architect/Analyst-authored content
before the Developer role (default: Cursor) takes over — treat ExecutionPlan.md as an
implementation *contract*, not a task list: the Planner decides implementation order here; the
Developer executes tasks and must not redesign anything.

The Developer never reads ExecutionPlan.md, Requirement.md, Design.md, or TechnicalDesign.md
directly — it works from **one Task Package at a time** (see `ai-factory/gates/itps-standard.md`).
Its job is translation, not thinking: turning one Task Package into code exactly as specified,
never weighing alternatives or inferring scope. That's why this skill's real deliverable is the
set of Task Packages, not just the master plan.

## Allowed inputs
- `stories/<slug>/03-Design/TechnicalDesign.md` — **only this file** (not Design.md,
  Requirement.md, or Analysis.md directly — anything the Developer needs from them must already
  be reflected in TechnicalDesign.md; if it isn't, that's a gap to flag, not to silently
  backfill from memory).
- `ai-factory/gates/eps-standard.md` and `ai-factory/gates/itps-standard.md` — the quality
  standards this stage must satisfy
- `ai-factory/templates/ExecutionPlan.md`, `ai-factory/templates/TaskPackage.md`,
  `ai-factory/gates/definition-of-done.md`, `ai-factory/gates/risk-analysis.md`

## Hard rules (from eps-standard.md)
- This is a drift-prevention contract, not a checklist: every task's Objective, files, and
  acceptance criteria must be precise enough that the Developer never needs to guess.
- Anti-pattern objectives ("implement feature", "update repository", "fix bug", "add endpoint",
  "improve performance") are not acceptable — every task states exactly What, Why, Where
  (files), and How to verify.
- Tasks must be small, independent, deterministic, verifiable — never large, mixed-responsibility,
  or carrying a hidden dependency.
- The Developer decides nothing about implementation order, architecture, or requirements —
  only the things listed in `eps-standard.md#allowed-developer-decisions`.

## Steps
1. Confirm TechnicalDesign.md's Approval Gate has the `**Gate confirmed by user — ...**` line.
   If not, stop and tell the user this stage requires an approved Technical Design (TDS) first.
2. Build the Dependency Graph and Implementation Phases (ExecutionPlan.md §3-4) from
   TechnicalDesign.md's Module/Class design and Request Flow — the Developer must never
   determine execution order itself.
2a. **Ground the plan in real code.** Before finalizing task specs, verify assumptions against
   the actual codebase (existing symbols to reuse, real schema/data shape, real file paths) using
   whatever code-search capability is available (Explore/Grep/Glob) rather than trusting
   TechnicalDesign.md's description alone. Ask the user to confirm anything you can't verify —
   never let an unconfirmed fact ship silently in a Task Package.
2b. Read `docs/ai-learning/recurring.md` (`ai-factory/gates/learning-loop.md`) once; copy every
   applicable recurring category into the affected tasks' Common Mistakes (§18).
3. Write one Task Specification block (§5) per task, filling every field: Task ID, Purpose,
   Business Requirement Mapping (FR ID, traced through TechnicalDesign.md back to Design.md §2),
   Technical Design Reference, Objective (exactly one), Files To Create/Modify/Forbidden,
   Implementation Notes, Dependencies, Expected Output, Acceptance Criteria, Validation Steps,
   Rollback Strategy, Definition of Complete.
4. Fill File Impact Analysis (§7) by aggregating every task's file list — no file should be
   touched that isn't accounted for here.
5. Cover Database/API/Event/Configuration Changes (§8-11) as they apply; mark N/A with a reason
   otherwise.
6. Build the Risk Analysis (§13) using the categories in `ai-factory/gates/risk-analysis.md`,
   folding in TechnicalDesign.md's Technical Risks (§24), per task where relevant. Any High/High
   risk needs a stated mitigation, or must be raised to the user as a blocking Open Question — do
   not let the plan pass with an unmitigated High/High risk.
7. Fill the base Definition of Done from `ai-factory/gates/definition-of-done.md`, adding
   story-specific items including TechnicalDesign.md's Implementation Constraints (§25) as hard
   DoD items.
8. State a plan-level rollback plan (in addition to each task's own Rollback Strategy).
9. Run the AI Quality Gate self-check (9 questions) in
   `ai-factory/gates/eps-standard.md#ai-quality-gate` before considering the draft done. Any
   "No" answer (or #9 "Will the Developer ever need to guess?" answered "Yes") means stop and
   resolve it or escalate.
10. Log any material planning decision to the story's `DecisionLog.md`.
11. Present the Approval Gate checklist from
    `ai-factory/gates/approval-gates.md#04-executionplan` with your self-assessment, and ask the
    user to confirm. Once confirmed, append the `**Gate confirmed by user — {{date}}**` line to
    ExecutionPlan.md's Approval Gate section per
    `ai-factory/gates/approval-gates.md#recording-confirmation`.
12. **Generate Task Packages.** For every Task Specification block in §5, write a standalone
    `04-ExecutionPlan/tasks/TASK-00N.md` from `ai-factory/templates/TaskPackage.md`, expanding
    it with the extra context a Developer working in isolation needs: cite (don't duplicate)
    the relevant Requirement.md FR ID, Design.md/TechnicalDesign.md sections; pull in only the
    Business Rules (§10) relevant to that one task; carry over the applicable Technical/Security/
    Performance Constraints; add task-specific Common Mistakes (§18) where a likely drift trap
    exists (e.g. "don't publish the event before commit" for a handler task).
12a. **Checklists and code spec.** Select the checklists for each package
    (`ai-factory/checklists/README.md#procedure`, steps 1-2) and write its Code & Data Access Spec
    (`ai-factory/gates/code-spec-standard.md` — required where it applies; ask the user once, batched,
    to confirm any `UNCONFIRMED` fact).
13. Before finalizing each package, run the ITPS AI Quality Gate self-check (9 questions) in
    `ai-factory/gates/itps-standard.md#ai-quality-gate`. Any "No" answer (or #8 "Will the
    Developer need to guess?" answered "Yes") means regenerate that package — don't ship an
    ambiguous one. This is a silent per-package check, not a separate user confirmation. For any
    package that triggers the code spec, also pass `code-spec-standard.md#planner-readiness-gate`.
14. Tell the user the plan and all Task Packages are ready, and that stage 05 hands the
    Developer one Task Package at a time via `ai-factory/prompts/implementation.md` — never
    the whole ExecutionPlan.md.

## Output
- `stories/<slug>/04-ExecutionPlan/ExecutionPlan.md`
- `stories/<slug>/04-ExecutionPlan/tasks/TASK-00N.md` — one per task
- Updated `DecisionLog.md` (if applicable)
