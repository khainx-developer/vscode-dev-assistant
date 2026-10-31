---
name: ai-factory-requirement
description: AI Factory stage 01-02 (Requirement + Analysis). First decides the story's complexity tier (Quick/Full), then either runs the full Brainstorm bank and writes a Business Requirement Specification (BRS) per ai-factory/gates/brs-standard.md, or writes a trimmed QuickRequirement. Use when the user gives a raw feature/user-story description and wants it turned into a formal Requirement.
---

# AI Factory — Requirement & Analysis

Stage owner: Architect/Analyst role (default: Claude). This is the entry point of the
pipeline — before anything else, it decides how much ceremony this story actually needs (see
`ai-factory/gates/complexity-tiers.md`), then produces `01-Requirement/Requirement.md` in
whichever shape that tier calls for.

## Allowed inputs
- The raw user story / feature description as given by the user in this conversation.
- `ai-factory/gates/complexity-tiers.md` — read first, always
- `ai-factory/brainstorm/question-bank.md`
- `ai-factory/gates/brs-standard.md` — the quality standard for Full tier
- `ai-factory/templates/Requirement.md` (Full), `ai-factory/templates/QuickRequirement.md`
  (Quick), `ai-factory/templates/Analysis.md`
- **Do not** read other stories' artifacts or unrelated conversation history — this stage should
  work from the raw story alone.

## Step 0 — Tier Assessment (always, before anything else)
1. If no story folder exists yet, run `ai-factory-new-story` first.
2. Walk the raw story against the Force-Full checklist in
   `ai-factory/gates/complexity-tiers.md#force-full-signals`. Check the actual codebase if scope
   ("how many files") is unclear — don't guess. Any single "yes" (or genuine uncertainty) means
   Full tier.
3. Write the decision to `stories/<slug>/.tier` (plain text `quick` or `full`) and
   log the checklist result in `DecisionLog.md`.
4. If Quick, follow the **Quick branch** below. If Full, follow the **Full branch**.

## Full branch (existing behavior)
Produces `01-Requirement/Requirement.md` (a full BRS) and `02-Analysis/Analysis.md`. Do not
skip the Brainstorm step or the AI Quality Gate self-check to save time — this tier exists
specifically for stories where that rigor is load-bearing.

Hard rules (from brs-standard.md): the BRS describes **what** the system must achieve, never
**how**; never invent a missing requirement, business rule, or assumption (unknowns go in Open
Questions §21, approved assumptions go in §22); avoid anti-pattern wording ("handle errors
appropriately", "validate input", etc.) — state exact expected behavior.

1. Read `ai-factory/brainstorm/question-bank.md`. Select the categories actually relevant to
   this story, with coverage broad enough to fill every BRS section that applies.
2. Ask the user the relevant clarifying questions using AskUserQuestion, batched sensibly. State
   a reasonable default for anything the user has no strong opinion on — but never assume
   answers to security/compliance-critical questions (RBAC, PHI/HIPAA, tenancy, business rules).
3. Record the Brainstorm Q&A in `02-Analysis/Analysis.md`.
3a. **Codebase feasibility check.** Run a small, bounded number of Explore/Grep/Glob lookups to
   confirm the requirement doesn't already exist and that its assumed integration points are
   real — not an open-ended audit. Record what you checked and found in Analysis.md's Feasibility
   Notes section. A real conflict escalates to Open Questions/Risks in the BRS, not something to
   quietly resolve yourself.
4. Run the AI Quality Gate self-check (10 questions) in
   `ai-factory/gates/brs-standard.md#ai-quality-gate` and record answers in Analysis.md's table.
   Any "No" on 1-9, or "Yes" on 10, means stop and resolve the gap with the user.
5. Write `01-Requirement/Requirement.md` from `ai-factory/templates/Requirement.md`, filling all
   24 sections (mark N/A with a one-line reason, never omit silently).
6. Log any notable decision to `DecisionLog.md`.
7. Self-assess against the Completion Checklist in
   `ai-factory/gates/brs-standard.md#completion-checklist`, present the Approval Gate (Definition
   of Ready) from `ai-factory/gates/approval-gates.md#01-requirement--02-analysis`, and ask the
   user to confirm before stage 03-Design begins.
8. Once confirmed, append `**Gate confirmed by user — {{date}}**` per
   `ai-factory/gates/approval-gates.md#recording-confirmation`.

## Quick branch
Produces only `01-Requirement/Requirement.md` from `ai-factory/templates/QuickRequirement.md` —
no separate Analysis.md; the Force-Full checklist result already lives in `.tier` and
`DecisionLog.md`.

1. Skip the full Brainstorm walk — the Force-Full checklist in Step 0 already covers the
   material risk categories. Ask only what's needed to state the User Story and Acceptance
   Criteria unambiguously.
1a. **Codebase feasibility check.** Run 1-2 Explore/Grep/Glob lookups to confirm this doesn't
   already exist and its one or two assumed integration points are real. A real conflict is a
   Force-Full signal (Step 0) — re-run that decision, don't push through as Quick.
2. Write `01-Requirement/Requirement.md` from `ai-factory/templates/QuickRequirement.md`:
   restate the Force-Full checklist (all unchecked), User Story, Actors, Acceptance Criteria,
   Out of Scope if relevant, Open Questions.
3. Present the Approval Gate with your self-assessment, and ask the user to confirm.
4. Once confirmed, append `**Gate confirmed by user — {{date}}**` per
   `ai-factory/gates/approval-gates.md#recording-confirmation`, and tell the user the story is
   ready for `ai-factory-quick-plan` — not `ai-factory-design`.

## Output
- `stories/<slug>/.tier`
- `stories/<slug>/01-Requirement/Requirement.md`
- `stories/<slug>/02-Analysis/Analysis.md` (Full tier only)
- Updated `stories/<slug>/DecisionLog.md`
