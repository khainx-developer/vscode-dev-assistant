# Execution Plan Specification — {{story_title}}

- **Story ID**: {{story-slug}}
- **Status**: Draft | In Review | Approved
- **Author**: Architect/Analyst agent (ai-factory-exec-plan, default: Claude) — the Planner
- **Input**: `03-Design/TechnicalDesign.md` only
- **Date**: {{date}}

Follows `ai-factory/gates/eps-standard.md`. This is an implementation contract, not a project
management task list: the Planner (Architect/Analyst) decides implementation order here; the
Developer executes tasks and MUST NOT redesign the solution. Every task must be precise enough
that the Developer never needs to guess.

## 1. Plan Overview
- Feature name: {{...}}
- Business goal: {{from Requirement.md §3, carried through}}
- Referenced Business Requirement: `01-Requirement/Requirement.md` (FR IDs: {{FR-001, ...}})
- Referenced System Design: `03-Design/Design.md`
- Referenced Technical Design: `03-Design/TechnicalDesign.md`
- Estimated complexity: {{...}}
- Estimated implementation phases: {{N}}

## 2. Scope
- Included work: {{...}}
- Excluded work: {{...}}
- Deferred work: {{...}}
- Future enhancements (not this plan): {{...}}

## 3. Dependency Graph
```
{{Task 1}}
   ↓
{{Task 2}}
   ↓
{{Task 3}}
```
The Developer never determines execution order — it is fixed here.

## 4. Implementation Phases
| Phase | Name | Tasks |
|---|---|---|
| 1 | {{e.g. Foundation}} | {{Task IDs}} |
| 2 | {{e.g. Database}} | {{Task IDs}} |
| 3 | {{e.g. Domain}} | {{Task IDs}} |
| 4 | {{e.g. Application}} | {{Task IDs}} |
| 5 | {{e.g. API}} | {{Task IDs}} |
| 6 | {{e.g. Testing}} | {{Task IDs}} |

Omit phases that don't apply to this story; don't force a fixed phase count.

## 5. Task Specification
One block per task. Copy this block for every task — every field is mandatory (write "N/A"
with a reason if a field genuinely doesn't apply, never omit silently). Once this plan's gate is
confirmed, each block below is expanded into a standalone Task Package at
`04-ExecutionPlan/tasks/TASK-00N.md` per `ai-factory/gates/itps-standard.md` — **the Developer
reads only its one Task Package, never this file**. Write these blocks precisely enough to
support that expansion without the Developer needing anything else.

### TASK-001
- **Purpose**: {{why this task exists}}
- **Business Requirement Mapping**: {{FR-001}}
- **Technical Design Reference**: {{TechnicalDesign.md §N}}
- **Objective**: {{exactly one thing to implement — not multiple objectives}}
- **Files To Create**: {{explicit list, or "none"}}
- **Files To Modify**: {{explicit list, or "none"}}
- **Files Forbidden To Modify**: {{explicit list — anything not named above that could be
  tempting to touch}}
- **Implementation Notes**: {{specific instructions; do not repeat the Technical Design, only
  what's task-specific}}
- **Dependencies**: {{Task IDs that must already be complete, or "none"}}
- **Expected Output**: {{exactly what should exist after completion}}
- **Acceptance Criteria**: {{objective, e.g. "compilation succeeds", "API returns 201 with
  {shape}", "migration generated", "unit tests pass", "no nullable warnings"}}
- **Validation Steps**: {{e.g. run build, run unit tests X, run integration test Y, execute
  migration, verify API response, verify log output}}
- **Rollback Strategy**: {{how to undo this task safely}}
- **Definition of Complete**: {{conditions required before marking this task complete}}

<!-- Repeat for TASK-002, TASK-003, ... -->

## 6. Task Decomposition Rules
See `ai-factory/gates/eps-standard.md#task-decomposition-rules`. Tasks above must be small,
independent, deterministic, verifiable — never large, mixed-responsibility, or hidden-dependency.

## 7. File Impact Analysis
Aggregated from every task above — no file should be modified unexpectedly.
| File | Reason for Change | Expected Modification | Risk Level | Owner Task |
|---|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{L/M/H}} | {{TASK-00N}} |

## 8. Database Changes
N/A if none.
- Migration: {{...}}
- Tables / indexes / constraints: {{...}}
- Seed data: {{...}}
- Backward compatibility: {{...}}
- Rollback strategy: {{...}}
- Deployment considerations: {{...}}

## 9. API Changes
N/A if none.
- Endpoints / contracts / request-response models: {{...}}
- Status codes: {{...}}
- Versioning / compatibility / breaking changes: {{...}}

## 10. Event Changes
N/A if none.
- New / modified events: {{...}}
- Consumers / publishers: {{...}}
- Retry policy / ordering / failure handling: {{...}}

## 11. Configuration Changes
N/A if none.
- Settings / environment variables / secrets / feature flags: {{...}}
- Infrastructure requirements: {{...}}

## 12. Test Plan
Per task, or overall if shared:
- Unit tests: {{...}}
- Integration tests: {{...}}
- Regression tests: {{...}}
- Performance tests: {{...}}
- Negative tests / edge cases: {{...}}
- Required coverage: {{...}}

## 13. Risk Analysis
Per `ai-factory/gates/risk-analysis.md`, extended per task where relevant.
| Task | Implementation Risk | Deployment Risk | Performance Risk | Security Risk | Regression Risk | Migration Risk | Mitigation |
|---|---|---|---|---|---|---|---|
| {{TASK-00N}} | {{L/M/H}} | {{L/M/H}} | {{L/M/H}} | {{L/M/H}} | {{L/M/H}} | {{L/M/H}} | {{...}} |

Any High/High risk needs a stated mitigation or must be escalated as a blocking Open Question.

## 14. Verification Checklist
Before any task is marked complete, verify: compilation succeeds; static analysis passes; unit
tests pass; integration tests pass; logging verified; error handling verified; no unnecessary
files modified; no architecture violations introduced; no business rules violated.

## 15. Developer Constraints
See `ai-factory/gates/eps-standard.md#developer-constraints-apply-to-every-task-in-this-plan`.

## 16. Allowed Developer Decisions
See `ai-factory/gates/eps-standard.md#allowed-developer-decisions`.

## 17. Progress Tracking
Per-task status (Not Started / In Progress / Blocked / Completed / Verified) is tracked by the
Developer role in `05-Implementation/notes.md`, keyed by Task ID — **not** written back into
this file, to keep this artifact Architect/Analyst-owned and stable throughout implementation.
Blocked tasks must document the reason there.

## 18. Blocking Conditions
See `ai-factory/gates/eps-standard.md#blocking-conditions`. The Developer must stop and report
rather than guess.

## 19. Implementation Review
After every completed task, the Developer verifies: the mapped Business Requirement is still
satisfied, the Technical Design is still followed, architecture is unchanged, no regression
introduced, tests updated. Recorded per-task in `05-Implementation/notes.md`.

## 20. Final Validation — Definition of Done
See `ai-factory/gates/eps-standard.md#definition-of-done-for-the-whole-plan`. Self-assessed by
the Developer role before `07-CodeReview/CodeReview.md`'s verdict can be Pass:
- [ ] All planned tasks completed
- [ ] No skipped tasks
- [ ] No unresolved blockers
- [ ] No failed validation
- [ ] No failing tests
- [ ] Rollback documented per task

## Definition of Done (base checklist)
See `ai-factory/gates/definition-of-done.md` for the base checklist; story-specific items:
- [ ] {{item}}

## Rollback Plan (plan-level)
{{How to revert the whole story if it ships broken — feature flag, migration down-script,
revert commit. Per-task rollback is in each Task Specification block above.}}

## Open Questions
- [ ] {{question}}

## Approval Gate — Definition of Ready
See `ai-factory/gates/approval-gates.md#04-executionplan` and
`ai-factory/gates/eps-standard.md#definition-of-ready-for-development`. This is the hand-off
point to the Developer role — nothing here should require re-reading Requirement.md, Design.md,
or TechnicalDesign.md during implementation; if it does, this plan is incomplete.
- [ ] Every task is atomic, with dependencies, files, acceptance criteria, validation steps, and
      rollback strategy defined
- [ ] No implementation decisions remain
- [ ] Risk Analysis has no unmitigated High/High risks
- [ ] The Developer can implement every task without asking architectural questions

<!-- Add "**Gate confirmed by user — {{date}}**" above this line once the user confirms. -->
