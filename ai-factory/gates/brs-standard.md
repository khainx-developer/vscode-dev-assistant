# AI Engineering Standard — Business Requirement Specification (BRS)

**Version**: 1.0

This is the quality bar for stage 01-Requirement. It is a standard, not a template — the
fill-in template that follows this structure is `ai-factory/templates/Requirement.md`. Every
Requirement.md produced by `ai-factory-requirement` must satisfy everything in this document
before its Approval Gate can be marked confirmed.

## Purpose
Ensures every downstream agent (Architect, Planner, Developer, Reviewer) receives a
complete, consistent, actionable specification. A requirement is complete only when another
engineer or AI agent can understand the business problem and begin designing a solution
**without making assumptions**.

## Core Principles
Every requirement MUST be: Complete, Correct, Consistent, Unambiguous, Actionable, Testable,
Traceable, Verifiable.

The requirement MUST describe **what** the system needs to achieve. It MUST NOT describe
implementation details — that's Design.md's job (stage 03), not Requirement.md's.

## AI Quality Gate
Self-check before drafting is considered done. The Architect/Analyst agent must be able to
answer **YES** to every one of these before
presenting the Approval Gate. If any answer is "No", stop and ask the user — never guess, never
fill the gap with an invented default.

1. Do I fully understand the business problem?
2. Do I understand why this feature exists?
3. Do I know who will use it?
4. Do I know every business rule?
5. Do I know every validation rule?
6. Do I know the success criteria?
7. Do I know the failure scenarios?
8. Do I know what is NOT included?
9. Do I have enough information to start system design?
10. Is there anything that requires guessing?

Questions 1-9 must be YES; question 10 must be NO. Record any question that can't be answered
yet as an entry in Requirement.md's Open Questions section — do not proceed past the gate with
an unresolved one.

## Anti-Patterns
These are never acceptable as requirement text — each one is a sign the requirement isn't
actually specified, just gestured at:

- "Handle errors appropriately."
- "Validate input."
- "Optimize performance."
- "Support large datasets."
- "Send notification."

Replace vague verbs with exact expected behavior: which errors, which validation rule, what
performance number, what data volume, which trigger/recipient/channel.

## Completion Checklist
A Requirement.md is complete only if all of the following hold. This is what the Architect
self-assesses against before presenting the Approval Gate to the user:

- [ ] Every actor is identified
- [ ] Every business rule is documented
- [ ] Every validation rule is documented
- [ ] Every workflow is described (including alternative flows)
- [ ] Every failure scenario is covered
- [ ] Every permission is defined
- [ ] Every acceptance criterion is measurable
- [ ] Every unknown is documented in Open Questions
- [ ] No implementation details exist
- [ ] No contradictions exist
- [ ] No duplicated requirements exist
- [ ] No ambiguous wording exists (no anti-patterns above)
- [ ] No hidden assumptions exist (every assumption in section 22 was explicitly approved by
      the user, none invented)

## Definition of Ready (for System Design)
A Business Requirement is Ready for stage 03-Design — i.e. its Approval Gate may be
confirmed — only when:

- [ ] Business goals are fully understood
- [ ] Scope is finalized
- [ ] All critical questions are answered
- [ ] No blocking unknowns remain
- [ ] Acceptance criteria are complete
- [ ] The Architect/Analyst could begin design without guessing

If any of these fail, the workflow MUST stay in stage 01-Requirement (or return to it from
02-Analysis) rather than proceeding to Design — this is the content of
`ai-factory/gates/approval-gates.md#01-requirement--02-analysis`.
