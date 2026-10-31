# AI Engineering Standard — Architecture Review Specification (ARS)

**Version**: 1.0

This is the quality bar for stage 08-ArchitectureReview. It is a standard, not a template — the
fill-in template that follows this structure is `ai-factory/templates/ArchitectureReview.md`.
Every ArchitectureReview.md produced by `ai-factory-arch-review` must satisfy everything in
this document before its verdict can be trusted.

## Purpose
Every upstream document in this pipeline (BRS, SDS, TDS, EPS, ITPS, CIS) exists to eliminate
*generation* drift — ambiguity in what should be built. Architecture Review exists to eliminate
**review drift** — inconsistency in judging what actually got built. A review that says "looks
good" without evidence is exactly as much of a guess as a Developer inventing behavior; this
standard makes the review itself deterministic, traceable, and reproducible by a different
reviewer given the same diff.

This is a **verification** activity, not a design activity: the reviewer checks conformance
against decisions already made upstream, it does not make new ones. Anything that looks like a
missing decision is a finding, not something the reviewer resolves by picking an answer.

## Core Principles
Architecture Review must be: Traceable, Evidence-based, Deterministic, Actionable, Objective,
Non-redundant (don't re-litigate what `07-CodeReview/CodeReview.md` already checked and passed
— build on it, don't repeat it).

## Severity Rubric
Applied consistently — a finding's severity is not a feeling, it's determined by this table:

| Severity | Definition |
|---|---|
| High | Violates a Business Rule, Security Rule, or Developer Restriction (TDS §27 / CIS Forbidden Activities); breaks an acceptance criterion; introduces a regression in an existing passing test |
| Medium | Deviates from the approved Design/Technical Design without a logged justification; missing observability/audit coverage the design called for; a Task Package's Acceptance Criteria met but its Validation Steps weren't actually run |
| Low | Style/consistency issue with no behavioral effect; a documentation gap; a CIS Allowed Decision used in a way that's technically fine but worth a note |

A verdict of Pass requires **zero unresolved High findings**. Medium findings may accompany a
Pass if each has a stated follow-up (a new task, not silent acceptance). There is no "Pass with
reservations" — the verdict is binary, matching the rest of this pipeline's determinism.

## AI Quality Gate
Self-check before finalizing the verdict. The Architect/Analyst agent must be able to answer
**YES** to every one of these:

1. Does every finding cite a Task ID and file:line (or file) — never a vague area — plus a
   learning-loop Category and Root cause, and was it appended to `docs/ai-learning/findings.md`
   (`ai-factory/gates/learning-loop.md`)?
2. Was every FR ID from Requirement.md §8 checked against the implementation, not assumed?
3. Was every Task Package's Acceptance Criteria and Validation Steps checked against
   `05-Implementation/notes.md`, not inferred from the diff alone?
4. Was TDS's Implementation Constraints (§25) and Developer Restrictions (§27) checked
   independently, not just trusted from CodeReview.md's self-assessment?
5. Was the CIS Anti-Patterns scope-check re-run independently (§ "CIS Scope Check" in
   CodeReview.md is the Developer's own self-check — this stage re-verifies it, it doesn't
   inherit it as fact)?
6. Is every severity assigned per the Severity Rubric, not by feel?
7. Does the verdict follow mechanically from the findings (no Pass with an unresolved High, no
   Needs Revision with only Low findings)?
8. Could a different reviewer, given the same diff and the same upstream artifacts, reach the
   same verdict from what's written here?

If any answer is NO, the review is incomplete — fix the review before recording a verdict.

## Anti-Patterns
Never acceptable in a review:

- "Looks fine to me." — no evidence, no traceability.
- "Approved with minor comments." — vague; every comment needs a severity and a Task ID.
- Rubber-stamping because CodeReview.md already said Pass — this stage exists specifically to
  independently re-check, not to ratify.
- A single finding like "code needs refactoring" with no file, no reason, no severity.
- Blanket Pass despite an open High finding, on the reasoning that it's "probably fine."
- Silently expanding scope to fix something found mid-review — that's a CIS Anti-Pattern
  ("while I was here...") even when the reviewer does it, not just the Developer. Log it as a
  finding for a future task instead.

## Required Sections (in ArchitectureReview.md)
1. **Review Scope** — which Task IDs / files this review covers (should be all of them; note
   any explicitly out of scope and why).
2. **Traceability Matrix** — every FR ID → the Task ID(s) that implement it → verified Y/N. No
   FR ID should be untraced.
3. **Architectural Conformance** (against Design.md/SDS) — Solution Overview and Design
   Decisions (§24) actually reflected in the implementation; any drift logged.
4. **Technical Conformance** (against TechnicalDesign.md/TDS) — Implementation Constraints (§25)
   and Developer Restrictions (§27) held; class/layer/transaction responsibilities as specified.
5. **Plan Conformance** (against ExecutionPlan.md/EPS) — the EPS Definition of Done
   (`ai-factory/gates/eps-standard.md#definition-of-done-for-the-whole-plan`) independently
   re-checked, not copied from CodeReview.md.
6. **Behavioral Conformance** (against CIS) — an independent re-run of the CIS Scope Check; any
   unrequested refactor/rename/optimization found is a finding regardless of correctness.
7. **Findings** — severity (per the Rubric), Task ID, file:line, issue, recommendation.
8. **Regression / Risk Re-check** — whether TechnicalDesign.md §24 Technical Risks and
   ExecutionPlan.md §13 Risk Analysis materialized, and whether existing tests still cover them.
9. **Verdict & Rationale** — Pass or Needs Revision, and the one-line mechanical reason (e.g.
   "2 High findings unresolved" or "zero High, 1 Medium with follow-up task logged").

## Definition of Done (for the review itself)
An Architecture Review is complete only when:

- [ ] Every FR ID is traced to a Task ID with a verified checkmark
- [ ] Every Task Package's diff was actually inspected (not sampled/assumed)
- [ ] Every finding has a severity per the Rubric, a Task ID, and a location
- [ ] The CIS Scope Check and EPS Definition of Done were independently re-verified, not
      inherited from CodeReview.md
- [ ] The verdict follows mechanically from the findings
- [ ] A different reviewer could reproduce this verdict from what's written here
