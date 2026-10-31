# Code Review — {{story_title}}

- **Story ID**: {{story-slug}}
- **Status**: Draft | Passed | Needs Revision
- **Author**: Developer agent (default: Cursor Agent)
- **Input**: code diff + `05-Implementation/notes.md`
- **Date**: {{date}}

## Checklist
See `ai-factory/gates/review-checklist.md#code-review`.
- [ ] Follows existing code conventions
- [ ] No dead code / unused imports
- [ ] Error handling matches project patterns
- [ ] No obvious security issues (injection, secrets, auth bypass)
- [ ] Tests cover new/changed behavior

## Stack Checklists
Per `ai-factory/checklists/README.md#procedure`. One block per selected plugin; none match → "N/A —
no active checklist matches the changed files".

### Checklist: {{id}} (v{{version}})
- Result: Pass | Needs Revision — failed rule IDs: {{e.g. DN-26}} · N/A with reason: {{...}}

## Plan Definition of Done
Full tier: see `ai-factory/gates/eps-standard.md#definition-of-done-for-the-whole-plan`. Quick
tier: see `04-ExecutionPlan/QuickPlan.md`'s own Definition of Done section. Either way, a Pass
verdict requires all of these, not just a clean diff:
- [ ] Every task (in ExecutionPlan.md/Task Packages, or in QuickPlan.md's Tasks list) is
      Completed per `05-Implementation/notes.md`, none skipped
- [ ] No task left Blocked without escalation
- [ ] No architectural deviation from the design (TechnicalDesign.md for Full tier, QuickPlan.md's
      Approach for Quick tier)

## CIS Scope Check
See `ai-factory/gates/cis-standard.md#anti-patterns` and `#forbidden-activities`. Scan the diff
for unrequested scope, not just correctness:
- [ ] No change outside the files listed in the task's file list (Task Package §6-7 for Full
      tier, QuickPlan.md's Files To Create/Modify for Quick tier) — i.e. no "while I was here"
- [ ] No unrequested refactor, rename, optimization, or dependency change present in the diff
- [ ] Every change traces back to a specific task objective — if a hunk of the diff can't be
      explained by one, flag it as a finding

## Findings
| Severity | File:Line | Category | Root cause | Issue | Fixed? |
|----------|-----------|----------|------------|-------|--------|
| {{High/Med/Low}} | {{path:line}} | {{learning-loop category}} | {{spec-gap/skill-gap/rule-ignored/domain-fact/process}} | {{description}} | Y/N |

**Learning loop (automatic, not optional):** every Med/High finding (and any Low that reveals a
pattern) is also appended as a row to `docs/ai-learning/findings.md` per
`ai-factory/gates/learning-loop.md`, then run
`node ai-factory/tools/findings-report.mjs --check` and `--write`.
- [ ] Findings appended to `docs/ai-learning/findings.md` (IDs: {{F-NNN…}}); `--check` passes; `recurring.md` regenerated

## Build / Test Status
{{Output summary of build + unit test run.}}

## Verdict
Pass | Needs Revision — {{if revision, list blocking items}}
