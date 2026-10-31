# Requirement (Quick) — {{story_title}}

- **Story ID**: {{story-slug}}
- **Tier**: Quick (see `ai-factory/gates/complexity-tiers.md`)
- **Status**: Draft | Approved
- **Author**: Architect/Analyst agent (ai-factory-requirement, default: Claude)
- **Date**: {{date}}

## Force-Full Checklist
Every box must be unchecked for this story to stay Quick tier — see
`ai-factory/gates/complexity-tiers.md#force-full-signals`. If anything is checked, stop and
escalate to Full tier instead of continuing this document.
- [ ] Creates/reads/modifies PHI/PII
- [ ] Touches auth/RBAC
- [ ] Touches multi-tenant isolation
- [ ] Touches billing/payments
- [ ] Adds/changes database schema
- [ ] New external integration/dependency
- [ ] New architectural pattern
- [ ] Touches more than ~5 files or crosses a module boundary
- [ ] Requirement is ambiguous at the business-rule level
- [ ] User explicitly asked for Full rigor

## User Story
As a {{role}}, I want {{capability}}, so that {{benefit}}.

## Actors
{{Who's affected — usually one or two.}}

## Acceptance Criteria
1. Given {{context}}, when {{action}}, then {{outcome}}.

## Out of Scope
{{Explicitly excluded, if anything's likely to be assumed otherwise.}}

## Open Questions
- [ ] {{question}} — owner: {{who}}

## Approval Gate
- [ ] Force-Full checklist is entirely unchecked
- [ ] Acceptance criteria are testable and unambiguous
- [ ] No blocking open questions remain

<!-- Add "**Gate confirmed by user — {{date}}**" above this line once the user confirms. -->
