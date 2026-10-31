---
name: ai-factory-quick-plan
description: AI Factory Quick-tier stage 03+04 combined. Reads only a story's QuickRequirement (Requirement.md) and produces a single QuickPlan.md replacing Design.md/TechnicalDesign.md/ExecutionPlan.md/Task Packages. Use only for stories whose .tier marker is "quick" — see ai-factory/gates/complexity-tiers.md. Never use this for a story tiered "full".
---

# AI Factory — Quick Plan

Stage owner: Architect/Analyst role (default: Claude), acting as the Planner. Produces
`04-ExecutionPlan/QuickPlan.md` for one Quick-tier story — the single artifact that replaces
Design.md (SDS), TechnicalDesign.md (TDS), ExecutionPlan.md (EPS), and per-task Task Packages
(ITPS) for Full-tier stories. This is the collapsed version of four stages into one, appropriate
only because the story was already screened as small and low-risk at stage 01.

## Precondition
Read `stories/<slug>/.tier`. If it says `full`, **stop** — this skill doesn't apply,
run `ai-factory-design` instead. If the marker is missing, stop and ask the user to run
`ai-factory-requirement` first (tier is decided there, before Requirement.md exists).

## Allowed inputs
- `stories/<slug>/01-Requirement/Requirement.md` (the QuickRequirement) — **only
  this file**.
- `ai-factory/templates/QuickPlan.md`
- The current codebase — ground the approach in existing patterns, don't invent one.

## Hard rules
- Same discipline as EPS/ITPS at smaller scale: no anti-pattern task objectives ("implement
  feature," "fix bug"), every task independently verifiable, no implementation decision left
  for the Developer to guess.
- Still governed by `ai-factory/gates/cis-standard.md` — Quick tier means less document, not
  less rigor once the Developer starts.
- If, while writing this plan, you find yourself needing to write something that looks like a
  Force-Full signal (see `ai-factory/gates/complexity-tiers.md#force-full-signals`) — a schema
  change, a new dependency, a security consideration — **stop**. Don't write around it. Tell the
  user this story needs to escalate to Full tier per
  `ai-factory/gates/complexity-tiers.md#escalation-quick--full`, update `.tier` to `full`, and
  hand off to `ai-factory-design` instead of continuing here.

## Steps
1. Confirm Requirement.md's Approval Gate has the `**Gate confirmed by user — ...**` line. If
   not, stop and tell the user this stage requires an approved Quick Requirement first.
2. Check the codebase for the relevant existing pattern (Explore/Grep/Glob) before proposing an
   approach; confirm anything you can't verify with the user rather than shipping it unconfirmed.
   Needing more than light grounding here (several unfamiliar integration points, an unclear data
   shape) is itself a signal this story may need Full-tier rigor — treat it as a candidate
   Force-Full escalation, not something to push through.
2a. Read `docs/ai-learning/recurring.md` (`ai-factory/gates/learning-loop.md`) once; fold any
   applicable recurring category into the plan's task list as a thing to avoid.
3. Write `04-ExecutionPlan/QuickPlan.md` from `ai-factory/templates/QuickPlan.md`: Approach,
   Files To Create/Modify/Forbidden, an ordered task list (each with expected output and a
   verification step), Acceptance Criteria, Rollback, Definition of Done. Also its **Checklists**
   (`ai-factory/checklists/README.md#procedure`, steps 1-2) and **Code & Data Access Spec**
   (`ai-factory/gates/code-spec-standard.md`, incl. its Planner readiness gate). A task needing more
   than one non-trivial query is a signal to split it — or to escalate to Full tier.
4. If nothing in the plan is a real risk, leave the Risk section as "none" — don't invent one to
   fill the section. If a real risk does appear, treat it as the escalation trigger above.
5. Log any material decision to the story's `DecisionLog.md`.
6. Present the Approval Gate checklist with your self-assessment, and ask the user to confirm.
   Once confirmed, append the `**Gate confirmed by user — {{date}}**` line per
   `ai-factory/gates/approval-gates.md#recording-confirmation`, and tell the user the story is
   ready for the Developer role using `ai-factory/prompts/implementation.md` — the Developer
   reads QuickPlan.md directly, one pass, no Task Packages.

## Output
- `stories/<slug>/04-ExecutionPlan/QuickPlan.md`
- Updated `DecisionLog.md` (if applicable)
