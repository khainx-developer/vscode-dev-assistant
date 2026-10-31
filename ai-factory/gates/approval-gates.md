# Approval Gates

An Approval Gate is a hard stop: the agent finishes its artifact, presents the gate checklist,
and **does not start the next stage** until the user (or, where explicitly delegated, the
receiving agent) confirms the checklist. This is what keeps a bad requirement from silently
turning into a bad design, plan, and implementation.

Rule for every agent: never self-approve your own gate. State the checklist, state your
self-assessment against it, and stop — wait for confirmation before moving to the next stage.

## Recording confirmation
State is never kept in conversation memory — a gate is only "confirmed" if the artifact file
says so, since orchestrators (`architect`, `developer`) read only files, not chat history. Once
the user confirms, the agent appends this line at the very end of the artifact's `## Approval
Gate` section, above the checklist:

```
**Gate confirmed by user — {{date}}**
```

An orchestrator must never add this line itself — only after the user has actually confirmed in
the conversation. An artifact with a checked-off checklist but no confirmation line is still
**unconfirmed**.

## Tier applicability
Every story picks Quick or Full at stage 01 (see `ai-factory/gates/complexity-tiers.md`). The
gates below through `08-ArchitectureReview` are **Full tier** — they cite BRS/SDS/TDS/EPS/ITPS/
ARS, which only Full-tier stories produce. Quick-tier stories use three gates instead, defined
in the templates themselves rather than duplicated here:
- `ai-factory/templates/QuickRequirement.md`'s own Approval Gate (replaces
  `01-Requirement → 02-Analysis` below)
- `ai-factory/templates/QuickPlan.md`'s own Approval Gate (replaces `03-Design (SDS)`,
  `03-TechnicalDesign (TDS)`, and `04-ExecutionPlan` below)
- `ai-factory/templates/QuickReview.md`'s own Verdict section (replaces
  `08-ArchitectureReview` below)

`07-CodeReview → 08-ArchitectureReview` and `09-Release` below apply at **both** tiers
unchanged — CIS-governed implementation discipline doesn't shrink just because the plan did.

## 01-Requirement → 02-Analysis
Owner: Architect/Analyst (default: Claude). Gate before 03-Design starts. Requirement.md must
meet the full standard in `ai-factory/gates/brs-standard.md` — this is the Definition of Ready:
- [ ] Business goals are fully understood
- [ ] Scope is finalized
- [ ] All critical questions are answered
- [ ] No blocking unknowns remain
- [ ] Acceptance criteria are complete and testable
- [ ] Design could begin without guessing
- [ ] Completion Checklist in `brs-standard.md#completion-checklist` passes (every actor,
      business rule, validation rule, workflow, failure scenario, and permission documented; no
      anti-pattern wording; no invented assumptions)

## 03-Design (SDS)
Owner: Architect/Analyst (default: Claude). Gate before Technical Design (TDS) starts.
Design.md must meet the full standard in `ai-factory/gates/sds-standard.md` — this is the
Definition of Ready:
- [ ] Every business requirement has a corresponding design
- [ ] All architectural decisions are documented
- [ ] No unresolved architectural blockers remain
- [ ] External dependencies are fully identified
- [ ] Security, scalability, reliability, and observability have been addressed
- [ ] Technical Design (TDS, next) can turn this into a code-level blueprint without making
      additional architectural decisions
- [ ] Design Validation Checklist in `sds-standard.md#design-validation-checklist` passes (every
      FR ID mapped, every module has a responsibility, no anti-pattern wording, no implementation
      tasks included)

## 03-TechnicalDesign (TDS)
Owner: Architect/Analyst (default: Claude). Gate before 04-ExecutionPlan starts.
TechnicalDesign.md must meet the full standard in `ai-factory/gates/tds-standard.md` — this is
the Definition of Ready:
- [ ] Every implementation decision has already been made
- [ ] Every major class has a defined responsibility
- [ ] Every transaction boundary is documented
- [ ] Every validation point is documented
- [ ] Every repository responsibility is defined
- [ ] Every implementation constraint is documented
- [ ] The Developer can begin coding without making architectural or design decisions
- [ ] Design Validation Checklist in `tds-standard.md#design-validation-checklist` passes (every
      class/layer/transaction/repository responsibility defined, no anti-pattern wording, no
      architectural decisions or business-rule redefinitions present)

## 04-ExecutionPlan
Owner: Architect/Analyst (default: Claude), the Planner. Gate before hand-off to the Developer
role (05-Implementation). ExecutionPlan.md must meet the full standard in
`ai-factory/gates/eps-standard.md` — this is the Definition of Ready:
- [ ] Every task is atomic, with dependencies, files, acceptance criteria, validation steps, and
      rollback strategy defined
- [ ] No implementation decisions remain
- [ ] Risk Analysis has no unmitigated High/High risks
- [ ] The Developer can implement every task without asking architectural questions
- This is the last Architect/Analyst-authored *plan* — but not the last thing the Developer
  reads. After this gate is confirmed, every Task Specification (§5) is expanded into a
  standalone Task Package at `04-ExecutionPlan/tasks/TASK-00N.md` per
  `ai-factory/gates/itps-standard.md`, each passing its own ITPS AI Quality Gate self-check —
  including a fully detailed Code & Data Access Spec (§9.1-§9.5, `code-spec-standard.md`) for every
  task that triggers it. The
  Developer reads one Task Package at a time — never ExecutionPlan.md itself (see
  `ai-factory/README.md` hand-off rule).

## 07-CodeReview → 08-ArchitectureReview
Owner: Developer (default: Cursor). Gate before hand-off to Architect/Analyst for Architecture
Review. Applies at both tiers — "the plan" below means ExecutionPlan.md + Task Packages for
Full tier, or QuickPlan.md for Quick tier. Full tier additionally includes the EPS Definition of
Done (`ai-factory/gates/eps-standard.md#definition-of-done-for-the-whole-plan`) for the whole
ExecutionPlan.md, not just this one code review:
- [ ] Build passes
- [ ] Unit tests pass
- [ ] Code review checklist items all checked or explicitly waived with reason
- [ ] All planned tasks in the plan completed, none skipped
- [ ] No unresolved blockers logged in `05-Implementation/notes.md`
- [ ] No architectural deviation exists between the implementation and the design (TechnicalDesign.md
      for Full tier, QuickPlan.md's Approach for Quick tier)

## 08-ArchitectureReview
Owner: Architect/Analyst (default: Claude). Gate before 09-Release. Optional independent review —
it may be invoked without a preceding stage-07 Pass verdict when the user explicitly asks for it
directly; record any predecessor check it could not run as skipped/unavailable rather than
fabricating a Pass for it. ArchitectureReview.md must meet the full standard in
`ai-factory/gates/ars-standard.md` — this is its Definition of Done:
- [ ] Every FR ID is traced to a Task ID with a verified checkmark
- [ ] Every Task Package's diff was actually inspected, not sampled or assumed
- [ ] All four conformance checks (Architectural, Technical, Plan, Behavioral) were run
      independently — none inherited from CodeReview.md as fact
- [ ] Every finding has a severity per the Severity Rubric, a Task ID, and a location
- [ ] No unresolved High-severity findings (a Pass with an unresolved High is not valid)
- [ ] The verdict follows mechanically from the findings — no "Pass with reservations"
- Verdict "Needs Revision" sends the story back to the Developer role with the cited Task ID(s);
  it does not proceed to Release.

## 09-Release
Owner: Developer (default: Cursor). Gate before merge.
- [ ] Story branch pushed; create-PR link given to human (no `gh pr create`)
- [ ] PR (once created) references the story folder
- [ ] Deploy notes / migrations documented
- [ ] Rollback plan still valid
