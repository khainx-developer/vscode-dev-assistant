# AI Engineering Standard — Technical Design Specification (TDS)

**Version**: 1.0

This is the quality bar for the second half of stage 03-Design. It is a standard, not a
template — the fill-in template that follows this structure is
`ai-factory/templates/TechnicalDesign.md`. Every TechnicalDesign.md produced by
`ai-factory-technical-design` must satisfy everything in this document before its Approval Gate
can be marked confirmed.

## Purpose
Unlike the System Design (SDS, `sds-standard.md`), which focuses on architecture, this
document specifies **how the solution is implemented at the source code level** — eliminating
implementation ambiguity. The Developer role should not make architectural decisions; it should
only implement the approved technical design. This is the last Architect/Analyst-authored
artifact before ExecutionPlan.md (stage 04) — 04-ExecutionPlan reads TechnicalDesign.md only,
not Design.md (SDS) directly.

## Core Principles
Technical Design must be: Deterministic, Consistent, Maintainable, Testable, Modular,
Extensible. Implementation decisions should already be made before coding begins — coding
should become a translation of this document into source code, not a design activity.

## AI Quality Gate
Self-check before the design is considered done. The Architect/Analyst agent must be able to
answer **YES** to every one of these:

1. Can another developer implement this without asking architectural questions?
2. Is every major class identified?
3. Are responsibilities clearly separated?
4. Are project boundaries defined?
5. Are transactions defined?
6. Are validation strategies defined?
7. Are error handling strategies defined?
8. Are naming conventions defined?
9. Are dependencies documented?
10. Are there any implementation decisions left to the developer? *(must be NO)*

If YES cannot be answered for every question (with #10 being NO), the design is incomplete —
stop and either resolve it or record it in Open Technical Questions (§28) and escalate to the
user rather than guessing.

## Anti-Patterns
A named operation with no defined responsibility/lifetime/rule is not a technical decision —
it's a placeholder. Never acceptable:

- "Implement repository." — without defining responsibilities.
- "Create service." — without defining ownership.
- "Validate input." — without defining validation rules.
- "Use dependency injection." — without defining lifetime.
- "Optimize query." — without defining expected behavior.
- "Follow Clean Architecture." — without defining layer responsibilities.

## Design Validation Checklist
Self-assessed against before presenting the Approval Gate:

- [ ] Every class responsibility is defined
- [ ] Every layer responsibility is defined
- [ ] Every dependency is documented
- [ ] Every transaction boundary is defined
- [ ] Every repository responsibility is defined
- [ ] Every DTO is identified
- [ ] Every validation point is defined
- [ ] Every exception type is defined
- [ ] Every implementation constraint is documented
- [ ] No architectural decisions remain (those belong in Design.md/SDS)
- [ ] No business rules are redefined (those belong in Requirement.md/BRS)
- [ ] No implementation ambiguity exists

## Definition of Ready (for Execution Planning)
TechnicalDesign.md is Ready for stage 04-ExecutionPlan — i.e. its Approval Gate may be
confirmed — only when:

- [ ] Every implementation decision has already been made
- [ ] Every major class has a defined responsibility
- [ ] Every transaction boundary is documented
- [ ] Every validation point is documented
- [ ] Every repository responsibility is defined
- [ ] Every implementation constraint is documented
- [ ] The Developer can begin coding without making architectural or design decisions

If any of these fail, the workflow MUST stay in stage 03 (Technical Design) rather than
proceeding to 04-ExecutionPlan — this is the content of
`ai-factory/gates/approval-gates.md#03-technicaldesign-tds`.
