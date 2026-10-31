# AI Factory — Root Agent Guide

Entrypoint for AI assistants working in a project that has the AI Factory framework copied into
it (see `README.md`). Read this first, then `.claude/skills/` for the actual stage logic — this
file is an overview and pointer, not a restatement of any skill's rules.

## What this is

An SDLC pipeline for AI coding assistants: every feature is a **story** under `stories/<slug>/`,
progressing through up to 9 stages across two roles, each stage producing one artifact that the
next stage reads and the user approves at defined gates. The pipeline is stack-agnostic — this
repo's own gates/prompts describe the *process*; `ai-factory/gates/coding-standard.md` is the one
file that's project-specific (see its own header), filled in by this project's first story rather
than shipped with real content.

## Roles & stages

| Role | Stages | Default agent | Orchestrator skill |
|------|--------|----------------|---------------------|
| Architect/Analyst | 01-Requirement, 02-Analysis, 03-Design, 04-ExecutionPlan, 08-ArchitectureReview | Claude | `architect` |
| Developer | 05-Implementation, 06-UnitTest, 07-CodeReview, 09-Release | Cursor Agent (swappable) | `developer` |

The Developer role runs in a separate coding agent that Claude Code cannot drive directly — the
`developer` skill doesn't execute those stages itself, it hands back the matching prompt from
`ai-factory/prompts/` for the user to paste into that agent.

The `ai-factory-investigate` skill is an on-demand debugging discipline (Reproduce → Isolate →
Hypothesize → Verify → Fix → Regression-test) for when the root cause of a bug isn't known yet —
load it before writing a Task Package for a fix, not as part of the stage sequence.

## Starting a new story

Run `ai-factory-new-story` with the raw feature description to scaffold
`stories/<slug>/` from `stories/_TEMPLATE/`, then hand off to the `architect` skill (or just say
"run architect on `<slug>`" / "what's next for `<slug>`") to drive stage 01 onward. Once Architect
finishes planning, `developer` picks up the same story for stages 05+.

## Complexity tiers

Every story is Full or Quick (`ai-factory/gates/complexity-tiers.md`), decided once at stage 01
and recorded in `stories/<slug>/.tier` — the single source of truth; never infer the tier from
which files happen to exist. Full runs the complete BRS → SDS → TDS → EPS → per-task ITPS → ARS
chain; Quick collapses Design/TechnicalDesign/ExecutionPlan into one `QuickPlan.md` and the
Architecture Review into `QuickReview.md`. Any force-Full signal (auth, multi-tenancy, money,
schema changes, new dependencies, ambiguous requirements, user asks for Full rigor) means Full,
no exceptions — see that document's checklist.

## Gates

A stage's artifact is not approved until it carries the exact
`**Gate confirmed by user — ...**` line (`ai-factory/gates/approval-gates.md`) — a checked-off
checklist alone is not enough. No orchestrator or stage skill advances past an unconfirmed gate,
unless the user has set `HumanAutoApprove: true` (see the `architect` skill) and the
stage's own self-check came back clean — a failed self-check always stops and asks regardless.

## Behavioral contract

`ai-factory/gates/cis-standard.md` (CIS) is the Developer role's standing constitution across
every task in stages 05-07: translate the approved design into code, don't
redesign, don't scope-creep ("while I was here, I also..." is always forbidden even when the
underlying observation is correct — log it instead of acting on it). `ai-factory/gates/
definition-of-done.md` is the base checklist every `ExecutionPlan.md` inherits.

## Where to look

- `.claude/skills/` — one skill per pipeline stage/orchestrator; see each `SKILL.md` for the
  actual stage logic (inputs, steps, output).
- `ai-factory/gates/` — the process standards (BRS/SDS/TDS/EPS/ITPS/ARS/CIS) and this project's
  own `coding-standard.md`.
- `ai-factory/gates/sources-of-truth.md` — which single file owns each rule/procedure; never restate
  one elsewhere, link to it. `ai-factory/checklists/` holds the pluggable stack checklists.
- `ai-factory/prompts/` — ready-to-paste prompts for the Developer-role agent, one per stage.
- `ai-factory/templates/` — blank artifact templates each stage skill fills in.
- `stories/<slug>/` — one folder per story: 9 numbered stage subfolders plus `DecisionLog.md`.

## Guardrails

- Never skip stage 07 (Code Review) or invent a Pass verdict to reach stage 08 sooner.
- Stage 08 (Architecture Review) can be invoked independently, without a preceding stage-07 Pass,
  when the user explicitly asks for it directly.
- A user may explicitly stop the pipeline after a stage-07 Pass and skip 08/09 themselves — see
  `ai-factory/prompts/close-pipeline.md`. Never skip on your own initiative; log the decision in
  `DecisionLog.md`.
- Never let the Developer role read more than the one file a stage's prompt names (Task Package,
  or QuickPlan.md at Quick tier) — that's deliberate, not an oversight, per `itps-standard.md`.
- A Task Package/QuickPlan.md that seems to need a judgment call beyond its stated Developer
  Freedom is a Blocking Condition, not something to guess through.
- If an artifact's state looks inconsistent (e.g. a later-stage file exists but an earlier gate
  was never confirmed), stop and flag it rather than guessing intent.
