---
name: ai-factory-technical-design
description: AI Factory stage 03 second half (Technical Design). Reads only a story's Design.md (SDS) and produces TechnicalDesign.md (TDS) per ai-factory/gates/tds-standard.md — the code-level implementation blueprint. Use after Design.md's Approval Gate is confirmed and before running ai-factory-exec-plan.
---

# AI Factory — Technical Design

Stage owner: Architect/Analyst role (default: Claude). Produces `03-Design/TechnicalDesign.md`
(a TDS) for one story. This runs after `ai-factory-design` (SDS) and before `ai-factory-exec-plan`
— stage 04-ExecutionPlan reads TechnicalDesign.md only, not Design.md directly, once this stage
is done.

## Allowed inputs
- `stories/<slug>/03-Design/Design.md` — **only this file**. Do not read
  Requirement.md or Analysis.md directly; anything needed from them must already be reflected in
  Design.md (if it isn't, that's a gap in the SDS to flag, not to silently backfill).
- `ai-factory/gates/tds-standard.md` — the quality standard this stage must satisfy
- `ai-factory/gates/coding-standard.md` — the concrete, stack-specific naming/structure/layering
  conventions this TDS's classes, layers, and file organization must follow. Read this before
  drafting, not after — it's the default answer for every §2 naming/structure choice; deviate
  only with a stated reason logged as a Design Decision (see that document's Amendments section).
- `ai-factory/templates/TechnicalDesign.md`
- The current codebase — naming conventions, folder structure, and existing patterns must be
  read from the real code, not invented. Where the codebase already diverges from
  `coding-standard.md`, the codebase wins — but flag the divergence rather than silently picking
  one.

## Hard rules (from tds-standard.md)
- Specifies **how the solution is implemented at the source code level** — never an
  architectural decision (that's Design.md/SDS's job) and never a redefinition of a business
  rule (that's Requirement.md/BRS's job).
- Every major class, layer, transaction boundary, validation point, and repository
  responsibility must be defined — the Developer should never need to make a design decision,
  only translate this document into code.
- A named operation with no defined responsibility/lifetime/rule (e.g. "implement repository"
  with no stated responsibilities) is an anti-pattern, not a technical decision.
- Never invent an implementation decision the SDS didn't call for — record it in Open Technical
  Questions (§28) and escalate instead.
- Naming, project/folder structure, layering, and framework-usage conventions (persistence, API,
  logging, testing, etc.) follow `ai-factory/gates/coding-standard.md` — don't re-decide these
  per story.

## Steps
1. Confirm Design.md's Approval Gate has the `**Gate confirmed by user — ...**` line. If not,
   stop and tell the user this stage requires an approved System Design (SDS) first.
2. Read `ai-factory/gates/coding-standard.md`. If it is still the blank scaffold from
   `ai-factory/templates/CodingStandard.md` (no project-specific content filled in), this is this
   project's first story to reach Technical Design: author `coding-standard.md` now from that
   template (for an ASP.NET Core/EF Core + React/Next.js stack, start from the pre-filled
   `ai-factory/templates/CodingStandard.dotnet-nextjs.md`), using Design.md's stack/structure decisions and this project's actual conventions,
   before continuing — don't draft the TDS against a blank standard. Otherwise, read the
   current codebase's conventions (Explore/Grep/Glob) — naming, folder structure, existing
   patterns for repositories/handlers/DTOs/etc — so the TDS matches the coding standard and
   what's already there, rather than inventing a new style. If the codebase has drifted from
   `coding-standard.md`, note it rather than silently following either one.
2a. **Ground data/integration decisions in real facts.** Before writing the data-access,
   persistence, or external-integration sections, verify assumptions against the real system
   (actual schema, existing queries/handlers to mirror, real API contracts) rather than
   guessing — batch anything you can't verify and ask the user once, then log the answers to
   `DecisionLog.md`. Never leave an unconfirmed fact in the shipped TDS.
2b. Read `docs/ai-learning/recurring.md` (`ai-factory/gates/learning-loop.md`) once; fold any
   applicable recurring category into the relevant TDS section as a constraint or anti-pattern
   to avoid.
3. Write `03-Design/TechnicalDesign.md` from `ai-factory/templates/TechnicalDesign.md`, filling
   in all 28 sections (mark a section N/A with a one-line reason if it genuinely doesn't apply,
   e.g. no CQRS in this codebase).
4. Run the AI Quality Gate self-check (10 questions) in
   `ai-factory/gates/tds-standard.md#ai-quality-gate` before considering the draft done. Any
   "No" answer (or #10 answered "Yes" — meaning something is still left to the developer to
   decide) means stop and resolve it or escalate.
5. Log each significant technical decision to the story's `DecisionLog.md`.
6. Self-assess against the Design Validation Checklist in
   `ai-factory/gates/tds-standard.md#design-validation-checklist`, then present the Approval
   Gate (Definition of Ready) from
   `ai-factory/gates/approval-gates.md#03-technicaldesign-tds` with your
   self-assessment, and ask the user to confirm before stage 04-ExecutionPlan begins.
7. Once the user confirms, append the `**Gate confirmed by user — {{date}}**` line to
   TechnicalDesign.md's Approval Gate section per
   `ai-factory/gates/approval-gates.md#recording-confirmation`.

## Output
- `stories/<slug>/03-Design/TechnicalDesign.md`
- Updated `DecisionLog.md` (if applicable)
