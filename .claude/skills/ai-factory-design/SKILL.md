---
name: ai-factory-design
description: AI Factory stage 03 (Design). Reads only a story's Requirement.md and produces a full System Design Specification (Design.md) per ai-factory/gates/sds-standard.md. Use when a story's Requirement has been approved and needs a technical design.
---

# AI Factory — Design

Stage owner: Architect/Analyst role (default: Claude). Produces `03-Design/Design.md` (an SDS)
for one story.

## Allowed inputs
- `stories/<slug>/01-Requirement/Requirement.md` — **only this file**. Do not read
  `Analysis.md` beyond what's already folded into Requirement.md, and do not rely on earlier
  conversation turns — if the Requirement doc is missing information you need, that's a gap in
  the Requirement, not something to fill in from memory.
- `ai-factory/gates/sds-standard.md` — the quality standard this stage must satisfy
- `ai-factory/templates/Design.md`
- The current codebase, to ground the design in what actually exists (read code, don't guess
  file layouts).

## Hard rules (from sds-standard.md)
- Describes system-level **architecture** — never source-code-level detail (that's
  TechnicalDesign.md's job, next in this stage) and never task-level implementation steps
  (that's ExecutionPlan.md's job, stage 04).
- Every FR ID in Requirement.md §8 must be mapped to a system capability/module in Design.md §2
  — no business requirement left unmapped.
- Every architectural decision needs a documented reason (§24) — a named technology or pattern
  with no stated reason is a guess, not a decision (see the Anti-Patterns list).
- Never invent an assumption (§25) or silently resolve an unresolved architectural question —
  record it in Open Questions (§26) and escalate to the user instead.

## Steps
1. Confirm Requirement.md's Approval Gate has the `**Gate confirmed by user — ...**` line. If
   not, stop and tell the user this stage requires an approved Requirement first.
2. Explore the relevant parts of the codebase (use Explore/Grep/Glob) to understand existing
   patterns before proposing a design — don't design in a vacuum. For sections describing
   system-wide structure this story doesn't change, write "Unchanged — {{pointer}}" rather than
   leaving them blank or re-deriving the whole system's architecture.
3. Write `03-Design/Design.md` from `ai-factory/templates/Design.md`, filling in all 26
   sections (mark a section N/A with a one-line reason if it genuinely doesn't apply, e.g. no
   new events for a purely internal UI change).
4. Run the AI Quality Gate self-check (9 questions) in
   `ai-factory/gates/sds-standard.md#ai-quality-gate` before considering the draft done. Any
   "No" answer (including "are there unresolved architectural decisions?" answered "Yes") means
   stop and resolve it or escalate — don't draft around a gap.
5. Log each significant design decision (Design.md §24) to the story's `DecisionLog.md`.
6. Self-assess against the Design Validation Checklist in
   `ai-factory/gates/sds-standard.md#design-validation-checklist`, then present the Approval
   Gate (Definition of Ready) from `ai-factory/gates/approval-gates.md#03-design-sds` with your
   self-assessment, and ask the user to confirm. Once confirmed, tell the user the story is
   ready for `ai-factory-technical-design` (still stage 03, the code-level design) — not
   straight to 04-ExecutionPlan.
7. Once the user confirms, append the `**Gate confirmed by user — {{date}}**` line to
   Design.md's Approval Gate section per
   `ai-factory/gates/approval-gates.md#recording-confirmation`.

## Output
- `stories/<slug>/03-Design/Design.md`
- Updated `DecisionLog.md` (if applicable)
