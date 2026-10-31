# Architecture Review — {{story_title}}

- **Story ID**: {{story-slug}}
- **Status**: Draft | Passed | Needs Revision
- **Author**: Architect/Analyst agent (ai-factory-arch-review, default: Claude)
- **Input**: `04-ExecutionPlan/ExecutionPlan.md`, `04-ExecutionPlan/tasks/`,
  `05-Implementation/notes.md`, code diff, `07-CodeReview/CodeReview.md` (for context only —
  every check here is re-verified independently, not inherited)
- **Date**: {{date}}

Follows `ai-factory/gates/ars-standard.md`. This is a verification activity, not a design
activity: check conformance against decisions already made upstream, don't make new ones.
Anything that looks like a missing decision is a finding, not something to resolve here.

## 1. Review Scope
{{Which Task IDs / files this review covers — should be all of them. Note anything explicitly
out of scope and why.}}

## 2. Traceability Matrix
Every FR ID from Requirement.md §8 must appear here.
| FR ID | Task ID(s) | Verified |
|---|---|---|
| {{FR-001}} | {{TASK-00N}} | {{Y/N}} |

## 3. Architectural Conformance (vs. Design.md / SDS)
{{Does the implementation reflect Design.md's Solution Overview and Design Decisions (§24)? Any
drift — logged as a finding below, not silently accepted.}}

## 4. Technical Conformance (vs. TechnicalDesign.md / TDS)
{{Do Implementation Constraints (§25) and Developer Restrictions (§27) hold? Do
class/layer/transaction responsibilities match what TDS specified?}}

## 5. Plan Conformance (vs. ExecutionPlan.md / EPS)
Independently re-check the EPS Definition of Done
(`ai-factory/gates/eps-standard.md#definition-of-done-for-the-whole-plan`) — do not copy
CodeReview.md's self-assessment.
- [ ] All planned tasks completed, none skipped
- [ ] No unresolved blockers in `05-Implementation/notes.md`
- [ ] No architectural deviation from TechnicalDesign.md

## 6. Behavioral Conformance (vs. CIS)
Independent re-run of the CIS Scope Check (`ai-factory/gates/cis-standard.md#anti-patterns`) —
do not inherit CodeReview.md's self-check as fact.
- [ ] Every changed hunk traces to a Task Package objective
- [ ] No unrequested refactor, rename, optimization, or "while I was here" fix present

## 7. Findings
Severity per `ai-factory/gates/ars-standard.md#severity-rubric`. Cite the Task ID each finding
maps to — this is how the Developer role knows which Task Package(s) to redo on a Needs
Revision verdict.
| Severity | Task ID | File:Line | Category | Root cause | Issue | Recommendation |
|----------|---------|-----------|----------|------------|-------|-----------------|
| {{High/Med/Low}} | {{TASK-00N}} | {{path:line}} | {{learning-loop category}} | {{spec-gap/skill-gap/rule-ignored/domain-fact/process}} | {{description}} | {{fix}} |

**Learning loop (automatic):** append every finding to `docs/ai-learning/findings.md`
(`ai-factory/gates/learning-loop.md`), run `findings-report.mjs --check` then `--write`.
If this session cannot execute commands, append the rows anyway and say `recurring.md` needs
regenerating.

## 8. Regression / Risk Re-check
{{Did TechnicalDesign.md §24 Technical Risks or ExecutionPlan.md §13 Risk Analysis items
materialize? Are they still covered by existing tests?}}

## 9. Verdict & Rationale
Pass requires zero unresolved High findings (Medium findings may accompany a Pass only if each
has a stated follow-up task — no silent acceptance). No "Pass with reservations."

**Verdict**: Pass | Needs Revision
**Rationale**: {{one-line mechanical reason, e.g. "2 High findings unresolved (TASK-004,
TASK-007)" or "zero High, 1 Medium with follow-up task TASK-011 logged"}}

Pass → proceed to 09-Release using `ai-factory/prompts/release.md`.
Needs Revision → back to the Developer role for the cited Task ID(s) via
`ai-factory/prompts/implementation.md`.
