# Business Requirement Specification — {{story_title}}

- **Story ID**: {{story-slug}}
- **Status**: Draft | In Review | Approved
- **Author**: Architect/Analyst agent (ai-factory-requirement, default: Claude)
- **Date**: {{date}}

Follows `ai-factory/gates/brs-standard.md`. Describes **what** the system must achieve — no
implementation details (those belong in `03-Design/Design.md`).

## 1. Business Context
- Current process: {{...}}
- Existing problems: {{...}}
- Business objectives: {{...}}
- Why this feature is needed: {{...}}
- Expected business value: {{...}}
- Why is this feature important? {{...}}
- What problem does it solve? {{...}}
- What happens if it is not implemented? {{...}}

## 2. Stakeholders
| Stakeholder | Responsibilities | Expectations | Permissions |
|---|---|---|---|
| Business owner | | | |
| Product owner | | | |
| End users | | | |
| Administrators | | | |
| External systems | | | |

## 3. Business Goals
Measurable wherever possible.
- {{goal, e.g. "Reduce manual appointment scheduling errors by X%"}}

## 4. Scope
Explicitly list everything included.
- {{capability}}

## 5. Out of Scope
Explicitly list everything excluded. Never assume future work belongs to this feature.
- {{excluded item}}

## 6. Actors
| Actor | Responsibilities | Permissions | Limitations |
|---|---|---|---|
| {{e.g. Receptionist}} | | | |
| {{e.g. Doctor}} | | | |
| {{e.g. Patient}} | | | |
| {{e.g. System Administrator}} | | | |
| {{e.g. Background Job}} | | | |
| {{e.g. External API}} | | | |

## 7. Terminology
One meaning per term — avoid synonyms that could confuse implementation.
| Term | Definition |
|---|---|
| {{e.g. Appointment}} | {{...}} |
| {{e.g. Visit}} | {{...}} |
| {{e.g. Invoice}} | {{...}} |
| {{e.g. Encounter}} | {{...}} |

## 8. Functional Requirements
| ID | Description | Business Reason | Expected Result |
|---|---|---|---|
| FR-001 | {{...}} | {{...}} | {{...}} |

## 9. Business Rules
Mandatory. Every rule has a unique ID.
| ID | Rule |
|---|---|
| BR-001 | {{e.g. Appointments cannot overlap}} |

## 10. Validation Rules
Distinct from business rules — field-level and structural constraints.
| ID | Rule |
|---|---|
| VR-001 | {{e.g. Email must be a valid format}} |

## 11. Workflow
Primary flow (use arrows to show sequence) plus every alternative flow.

```
{{Step 1}}
   ↓
{{Step 2}}
   ↓
{{Step N}}
```

Alternative flows:
- {{condition}} → {{resulting flow}}

## 12. Exception Scenarios
| Scenario | Expected System Behavior |
|---|---|
| {{e.g. Doctor unavailable}} | {{...}} |
| {{e.g. Patient not found}} | {{...}} |
| {{e.g. Duplicate booking}} | {{...}} |
| {{e.g. Network timeout}} | {{...}} |
| {{e.g. External API unavailable}} | {{...}} |
| {{e.g. Validation failure}} | {{...}} |

## 13. Authorization Rules
| Actor | Allowed Operations | Restricted Operations | Approval Required |
|---|---|---|---|
| {{e.g. Receptionist}} | Create Appointment, Cancel Appointment | Cannot Delete Visit | |
| {{e.g. Doctor}} | Read Visit, Update Diagnosis | Cannot Delete Invoice | |

## 14. Audit Requirements
- What must be logged: {{...}}
- Who performed the action: {{...}}
- Old value / new value captured: {{yes/no}}
- Timestamp: {{yes/no}}
- Reason captured: {{yes/no}}
- Compliance requirements: {{...}}

## 15. Notifications
N/A if none.
| Trigger | Recipient | Channel | Retry Policy | Failure Behavior |
|---|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} | {{...}} |

## 16. Non-Functional Requirements
- Performance: {{e.g. 95% of requests complete within 500ms}}
- Availability: {{...}}
- Scalability: {{e.g. Support 500 concurrent users}}
- Reliability: {{...}}
- Maintainability: {{...}}
- Security: {{...}}
- Accessibility: {{...}}
- Localization: {{...}}

## 17. Data Requirements
- Required entities: {{...}}
- Relationships: {{...}}
- Ownership: {{...}}
- Retention: {{...}}
- Sensitive data / PII: {{...}}
- Soft delete: {{yes/no}}
- Archiving: {{...}}

## 18. Integration Requirements
N/A if none.
- External systems: {{...}}
- Protocols: {{...}}
- Authentication: {{...}}
- Retry policy: {{...}}
- Failure handling: {{...}}
- Timeouts: {{...}}
- Idempotency: {{...}}

## 19. Reporting Requirements
N/A if none.
- Metrics: {{...}}
- Filters: {{...}}
- Sorting: {{...}}
- Grouping: {{...}}
- Export: {{...}}
- Permissions: {{...}}

## 20. Acceptance Criteria
Every requirement must be testable. Never subjective.
1. Given {{context}}, when {{action}}, then {{outcome}}.

## 21. Open Questions
Unknowns MUST be recorded here — never guessed.
- [ ] {{question}} — owner: {{who}}

## 22. Assumptions
Only assumptions explicitly approved by the user. Never invented.
- {{assumption}} — approved by: {{who}}, on: {{date}}

## 23. Risks
- Business risk: {{...}}
- Technical risk: {{...}}
- Legal risk: {{...}}
- Migration risk: {{...}}
- Security risk: {{...}}
- Performance risk: {{...}}

## 24. Requirement Traceability
Each requirement maps: Business Goal → Functional Requirement → Design → Execution Plan →
Implementation → Test Cases. This table is owned entirely by this stage and is never edited by
downstream stages (that would break the "read only the prior artifact" rule) — instead,
downstream artifacts trace back to this one by citing the FR ID: Design.md sections reference
the FR IDs they address, and ExecutionPlan.md tasks reference the FR IDs they implement.
| Business Goal | FR ID(s) |
|---|---|
| {{...}} | {{...}} |

## Completion Checklist
Self-assessed against `ai-factory/gates/brs-standard.md#completion-checklist` before presenting
the gate below.

## Approval Gate — Definition of Ready
See `ai-factory/gates/approval-gates.md#01-requirement--02-analysis` and
`ai-factory/gates/brs-standard.md#definition-of-ready-for-system-design`.
- [ ] Business goals are fully understood
- [ ] Scope is finalized
- [ ] All critical questions are answered
- [ ] No blocking unknowns remain
- [ ] Acceptance criteria are complete
- [ ] Design could begin without guessing

<!-- Add "**Gate confirmed by user — {{date}}**" above this line once the user confirms. -->
