# Quick Plan — {{story_title}}

- **Story ID**: {{story-slug}}
- **Tier**: Quick
- **Status**: Draft | Approved
- **Author**: Architect/Analyst agent (ai-factory-quick-plan, default: Claude) — the Planner
- **Input**: `01-Requirement/Requirement.md` (QuickRequirement) only
- **Date**: {{date}}

Replaces Design.md, TechnicalDesign.md, ExecutionPlan.md, and per-task Task Packages for Quick
tier stories. The Developer reads **this one file**, directly, in one pass — no separate Task
Packages. Still governed throughout by `ai-factory/gates/cis-standard.md`.

## Approach
{{One or two paragraphs: what changes, where, and why. Cite the codebase pattern being
followed, not invented — check neighboring files before proposing anything.}}

## Files To Create
{{Explicit list, or "none".}}

## Files To Modify
{{Explicit list, or "none".}}

## Checklists
{{ids per `ai-factory/checklists/README.md#procedure` — or "none match".}}

## Files Forbidden To Modify
{{Anything adjacent that could be tempting to touch but isn't in scope.}}

## Tasks
Small, ordered, verifiable — same discipline as EPS, just inline instead of separate files
since this is a single Developer pass.
1. [ ] {{task}} — expected output: {{...}} — verify: {{how}}
2. [ ] {{task}} — expected output: {{...}} — verify: {{how}}

## Code & Data Access Spec — REQUIRED when it applies
Per `ai-factory/gates/code-spec-standard.md`, one block per task that triggers it (else "N/A —
<reason>"), keyed by task number: 9.1 Code Design · 9.2 Data Access · 9.3 Reuse Map · 9.4 Forbidden
shapes (task-specific) · 9.5 Test cases.
{{...}}

## Acceptance Criteria
{{Objective, measurable — carried from Requirement.md.}}

## Risk
{{Only if non-trivial — most Quick stories have none. If a real risk shows up here, that's a
signal this should have been Full tier; escalate per
`ai-factory/gates/complexity-tiers.md#escalation-quick--full` instead of documenting around it.}}

## Rollback
{{How to revert if this ships broken.}}

## Definition of Done
- [ ] All tasks completed
- [ ] Acceptance criteria met
- [ ] Build passes, tests pass
- [ ] No file touched outside Files To Create/Modify
- [ ] No CIS Anti-Pattern present (no unrequested refactor/rename/optimization)

## Approval Gate
- [ ] Every task maps to an acceptance criterion
- [ ] No implementation decisions remain — the Developer can execute without guessing
- [ ] Code & Data Access Spec filled for every task that triggers `code-spec-standard.md` and passes its Planner readiness gate
- [ ] Rollback stated

<!-- Add "**Gate confirmed by user — {{date}}**" above this line once the user confirms. -->
