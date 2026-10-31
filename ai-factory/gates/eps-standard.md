# AI Engineering Standard — Execution Plan Specification (EPS)

**Version**: 1.0

This is the quality bar for stage 04-ExecutionPlan. It is a standard, not a template — the
fill-in template that follows this structure is `ai-factory/templates/ExecutionPlan.md`. Every
ExecutionPlan.md produced by `ai-factory-exec-plan` must satisfy everything in this document
before its Approval Gate can be marked confirmed.

## Purpose
Transforms an approved Technical Design (TDS) into a deterministic implementation roadmap. This
is **not** a project management task list — it is an implementation contract between the
Architect/Analyst role (the Planner, who decides implementation order) and the Developer role
(who executes tasks and MUST NOT redesign the solution). The primary objective is to eliminate
implementation drift: every task specified precisely enough that the Developer never needs to
guess.

## Core Principles
The Execution Plan must be: Deterministic, Sequential, Actionable, Verifiable, Traceable,
Atomic. Every task has one clear objective and one measurable completion condition.

## AI Quality Gate
Self-check before the plan is considered done. The Architect/Analyst (Planner) agent must be
able to answer **YES** to every one of these:

1. Can every task be completed independently?
2. Is the implementation order correct?
3. Are task dependencies explicit?
4. Can every task be verified?
5. Are rollback steps defined?
6. Are all affected files identified?
7. Is every architectural decision already made?
8. Does every task map to one business requirement (FR ID)?
9. Will the Developer ever need to guess? *(must be NO)*

If any answer is NO (or #9 is YES), the plan is incomplete — stop and either resolve it or
record it as a blocking Open Question and escalate to the user rather than shipping a task the
Developer will have to interpret.

## Anti-Patterns
A verb with no target, file list, or verification step is not a task — it's a placeholder.
Never acceptable as a task Objective:

- "Implement feature."
- "Update repository."
- "Fix bug."
- "Add endpoint."
- "Improve performance."

Every task must specify exactly: What, Why, Where (files), and How to verify.

## Task Decomposition Rules
Tasks should be: Small, Independent, Deterministic, Verifiable.
Avoid: Large tasks, mixed responsibilities, hidden dependencies, unclear objectives.

## Developer Constraints (apply to every task in this plan)
The Developer MUST NOT: redesign architecture, invent missing requirements, modify unrelated
files, introduce new frameworks, refactor outside task scope, skip validation, skip tests, or
mark a task complete without verification. These operationalize TDS §27 (Developer
Restrictions) at the task level — see `ai-factory/gates/tds-standard.md`. The canonical,
always-on version of this list is `ai-factory/gates/cis-standard.md#forbidden-activities` —
this section is the plan-specific reminder, not a separate source of truth.

## Allowed Developer Decisions
The Developer MAY decide: private helper methods, local variable names, formatting, small
private refactoring, code organization inside the approved file list. Everything else must
already be defined by the plan.

## Blocking Conditions
Implementation must stop — never continue by guessing — if: the requirement is unclear, the
Technical Design conflicts with what's found in the actual code, an unexpected dependency is
discovered, a security concern is identified, an architecture change would be required, or a
business rule is missing. A blocked task is reported, not worked around.

## Definition of Ready (for Development)
An Execution Plan is Ready for stage 05-Implementation — i.e. its Approval Gate may be
confirmed — only when:

- [ ] Every task is atomic
- [ ] Every dependency is defined
- [ ] Every affected file is identified
- [ ] Every validation step is documented
- [ ] Every acceptance criterion is measurable
- [ ] Every rollback strategy is defined
- [ ] No implementation decisions remain
- [ ] The Developer can implement every task without asking architectural questions
- [ ] The Developer never needs to invent behavior or guess missing information

If any of these fail, the workflow MUST stay in stage 04-ExecutionPlan rather than handing off
to the Developer role — this is the content of
`ai-factory/gates/approval-gates.md#04-executionplan`.

## Definition of Done (for the whole plan)
The Execution Plan is complete — i.e. ready to hand from Developer to Architect/Analyst for
08-ArchitectureReview — only when:

- [ ] Every task has been implemented
- [ ] Every validation step passed
- [ ] Every acceptance criterion satisfied
- [ ] Every test executed successfully
- [ ] Every task's Definition of Complete is met
- [ ] No unresolved blocker remains
- [ ] No architectural deviation exists between the implementation and the Technical Design

This is the content of
`ai-factory/gates/approval-gates.md#07-codereview--08-architecturereview` — the Developer role
self-assesses against this before declaring `07-CodeReview/CodeReview.md`'s verdict Pass.
