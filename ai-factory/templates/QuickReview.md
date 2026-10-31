# Architecture Review (Quick) — {{story_title}}

- **Story ID**: {{story-slug}}
- **Tier**: Quick
- **Status**: Draft | Passed | Needs Revision
- **Author**: Architect/Analyst agent (ai-factory-arch-review, default: Claude)
- **Input**: `04-ExecutionPlan/QuickPlan.md`, `05-Implementation/notes.md`, code diff,
  `07-CodeReview/CodeReview.md` (context only — re-verified independently, not inherited)
- **Date**: {{date}}

Replaces the full ARS Traceability Matrix and four separate conformance checks — a Quick-tier
story is small enough for one reviewer pass, not four. Still independent: don't just ratify
CodeReview.md's self-assessment.

## Conformance Check
- [ ] Implementation matches QuickPlan.md's Approach and Tasks — any drift logged
- [ ] Only files listed in QuickPlan.md's Files To Create/Modify were touched
- [ ] No CIS Anti-Pattern present (`ai-factory/gates/cis-standard.md#anti-patterns`) — no
      unrequested refactor, rename, optimization, or "while I was here" fix
- [ ] Every QuickPlan.md task is Completed per `05-Implementation/notes.md`
- [ ] Acceptance criteria satisfied

## Findings
| Severity | File:Line | Issue | Recommendation |
|----------|-----------|-------|-----------------|
| {{High/Med/Low}} | {{path:line}} | {{description}} | {{fix}} |

## Verdict
Pass requires zero unresolved High findings. If a finding suggests this story was actually
Full-tier complexity, say so explicitly rather than passing it — see
`ai-factory/gates/complexity-tiers.md#escalation-quick--full`.

**Verdict**: Pass | Needs Revision
**Rationale**: {{one line}}

Pass → proceed to 09-Release using `ai-factory/prompts/release.md`.
Needs Revision → back to the Developer role via `ai-factory/prompts/implementation.md`.
