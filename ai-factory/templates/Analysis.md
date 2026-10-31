# Analysis — {{story_title}}

- **Story ID**: {{story-slug}}
- **Status**: Draft | In Review | Approved
- **Author**: Architect/Analyst agent (ai-factory-requirement, default: Claude)
- **Date**: {{date}}

Working document that feeds `01-Requirement/Requirement.md`. The BRS itself is the
authoritative artifact — this file is the evidence trail for how it was derived, so findings
here should not contradict or duplicate the BRS once it's written.

## Brainstorm — Clarifying Q&A
Questions asked from `ai-factory/brainstorm/question-bank.md`, and answers given by the
user (or explicitly marked "assumed" with a stated default when the user had no strong
preference — never for security/compliance-critical questions, those must come from the user).

| # | Category | Question | Answer | Source |
|---|----------|----------|--------|--------|
| 1 | Tenancy | {{question}} | {{answer}} | user / assumed |
| 2 | RBAC | {{question}} | {{answer}} | user / assumed |

## AI Quality Gate Self-Check
Per `ai-factory/gates/brs-standard.md#ai-quality-gate`. All of 1-9 must be YES and 10 must be NO
before the Requirement.md gate can be presented; any "No" (or a "Yes" on #10) means stop and
ask the user, and log the resulting question in Requirement.md's Open Questions.

| # | Question | Answer (Y/N) | If No — what's missing |
|---|----------|---------------|--------------------------|
| 1 | Do I fully understand the business problem? | | |
| 2 | Do I understand why this feature exists? | | |
| 3 | Do I know who will use it? | | |
| 4 | Do I know every business rule? | | |
| 5 | Do I know every validation rule? | | |
| 6 | Do I know the success criteria? | | |
| 7 | Do I know the failure scenarios? | | |
| 8 | Do I know what is NOT included? | | |
| 9 | Do I have enough information to start system design? | | |
| 10 | Is there anything that requires guessing? | | |

## Feasibility Notes
{{Any technical constraints discovered while reasoning about the story — existing code,
libraries, integration points. Keep this to what's needed to inform Design; deep design
decisions belong in Design.md, not here.}}

## Dependencies
- {{other story / system / team this depends on}}

## Decision Log Entries
Append any decisions made during Brainstorm to `DecisionLog.md` in this story folder.
