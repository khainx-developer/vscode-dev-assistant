# AI Engineering Standard — System Design Specification (SDS)

**Version**: 1.0

This is the quality bar for stage 03-Design. It is a standard, not a template — the fill-in
template that follows this structure is `ai-factory/templates/Design.md`. Every Design.md
produced by `ai-factory-design` must satisfy everything in this document before its Approval
Gate can be marked confirmed.

## Purpose
Transforms an approved Requirement.md (BRS) into a complete technical solution implementable
without ambiguity. Must give an AI Planner (stage 04) enough detail to generate an accurate
Execution Plan, and an AI Developer (stage 05) enough detail to implement without making
architectural decisions. Describes **how the system should be built**, not how individual tasks
should be implemented (that's ExecutionPlan.md's job).

Design.md is written per-story, not as a whole-system architecture doc. For any section
describing system-wide structure this story doesn't change, write "Unchanged — see
system-wide architecture" with a one-line pointer, rather than leaving it blank or restating
the whole system's architecture.

## Design Principles
The design must satisfy: Simplicity, Consistency, Scalability, Security, Reliability,
Maintainability, Testability, Observability, Extensibility, Performance. Every architectural
decision must have a documented reason (section 24).

## AI Quality Gate
Self-check before the design is considered done. The Architect/Analyst agent must be able to
answer **YES** to every one of these:

1. Do I understand every business requirement (from Requirement.md)?
2. Have all requirements been mapped to the design (section 2)?
3. Does every component have a clear responsibility?
4. Are there unresolved architectural decisions? *(must be NO — if yes, stop)*
5. Is the design scalable?
6. Is the design secure?
7. Can another developer implement this without making architecture decisions?
8. Does this design avoid unnecessary complexity?
9. Is every external dependency documented?

If any answer is NO (or #4 is YES), the design is incomplete — stop and either resolve it or
record it in Open Questions (section 26) and escalate to the user rather than guessing.

## Anti-Patterns
A named technology or pattern with no stated reason is not a design decision — it's a guess.
Never acceptable:

- "Use Clean Architecture." — without explaining why.
- "Use Redis." — without defining what will be cached.
- "Use CQRS." — without identifying the read/write separation.
- "Optimize performance." — without measurable targets.
- "Use Event Bus." — without defining publishers and consumers.
- "Scale horizontally." — without explaining how state is managed.

## Design Validation Checklist
Self-assessed against before presenting the Approval Gate:

- [ ] Every business requirement (FR ID) has been mapped to the design
- [ ] Every module has a defined responsibility
- [ ] Every integration is documented
- [ ] Every database decision is justified
- [ ] Every API is identified
- [ ] Every event is identified (or section marked N/A)
- [ ] Every security concern is addressed
- [ ] Every scalability concern is addressed
- [ ] Every deployment dependency is documented
- [ ] Every architectural decision has a reason (section 24)
- [ ] No implementation tasks are included (that's ExecutionPlan.md)
- [ ] No business requirement is ignored

## Definition of Ready (for Technical Design)
Design.md is Ready for the Technical Design (TDS) half of stage 03 — i.e. its Approval Gate may
be confirmed — only when:

- [ ] Every business requirement has a corresponding design
- [ ] All architectural decisions are documented
- [ ] No unresolved architectural blockers remain
- [ ] External dependencies are fully identified
- [ ] Security, scalability, reliability, and observability have been addressed
- [ ] The Technical Design stage can turn this into a code-level blueprint without making
      additional architectural decisions
- [ ] The Developer (stage 05) should only make implementation decisions, never architectural
      ones, once TDS and ExecutionPlan are written from this

If any of these fail, the workflow MUST stay on the SDS half of stage 03 rather than proceeding
to Technical Design — this is the content of
`ai-factory/gates/approval-gates.md#03-design-sds`.
