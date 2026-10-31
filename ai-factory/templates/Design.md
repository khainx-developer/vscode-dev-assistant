# System Design Specification — {{story_title}}

- **Story ID**: {{story-slug}}
- **Status**: Draft | In Review | Approved
- **Author**: Architect/Analyst agent (ai-factory-design, default: Claude)
- **Input**: `01-Requirement/Requirement.md` only
- **Date**: {{date}}

Follows `ai-factory/gates/sds-standard.md`. Describes **how** the system will be built — no task
breakdown (that's `04-ExecutionPlan/ExecutionPlan.md`). For any section below describing
system-wide structure this story doesn't change, write "Unchanged — {{pointer}}" instead of
leaving it blank.

## 1. Solution Overview
{{High-level description: overall architecture, primary modules touched, external systems
involved, major workflows. No implementation details.}}

## 2. Business Capability Mapping
Every FR ID from Requirement.md §8 must map to at least one system capability/module.
| FR ID | Business Capability | System Module |
|---|---|---|
| {{FR-001}} | {{e.g. Appointment Booking}} | {{e.g. Scheduling Module}} |

## 3. Architecture Style
- Style: {{e.g. Layered / Modular Monolith / Clean Architecture / Vertical Slice / Microservices / Event-Driven}}
- Why selected: {{...}}
- Alternatives rejected and why: {{...}}

## 4. System Context
N/A / Unchanged if this story touches no external systems.
| System | Purpose | Direction | Authentication | Failure Behavior |
|---|---|---|---|---|
| {{e.g. Payment Gateway}} | {{...}} | {{in/out/both}} | {{...}} | {{...}} |

## 5. Domain Design
| Domain | Responsibilities | Owned Entities | Boundaries | Dependencies |
|---|---|---|---|---|
| {{e.g. Appointment}} | {{...}} | {{...}} | {{...}} | {{...}} |

Avoid cyclic dependencies between domains.

## 6. Module Design
| Module | Responsibilities | Inputs | Outputs | Public Interfaces | Dependencies | Ownership |
|---|---|---|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} |

Each module should have a single responsibility.

## 7. Data Flow
```
{{Request}}
   ↓
{{Validation}}
   ↓
{{Application Service}}
   ↓
{{Domain}}
   ↓
{{Repository}}
   ↓
{{Database}}
```
Alternative flows: {{...}}

## 8. Component Interaction
- Synchronous: {{e.g. REST, gRPC, internal method call}}
- Asynchronous: {{e.g. messaging, event bus, background job}}
- {{Which components talk to which, and how}}

## 9. Database Strategy
- Technology: {{...}}
- Schema strategy: {{...}}
- Tenant strategy: {{see §10}}
- Migration strategy: {{...}}
- Transaction strategy: {{...}}
- Index strategy: {{...}}
- Archive strategy: {{...}}
- Backup strategy: {{...}}
- Soft delete strategy: {{...}}
- Audit strategy: {{see §14 of Requirement.md}}
- Expected growth: {{...}}
- Data ownership: {{...}}

## 10. Multi-Tenancy
N/A if this story doesn't touch tenant-scoped data.
- Tenant isolation approach: {{database-per-tenant / schema-per-tenant / shared with tenant_id}}
- Connection resolution: {{...}}
- Cross-tenant protection: {{...}}
- Security considerations: {{...}}

## 11. API Design
N/A if no API surface changes.
| Endpoint | Method | Request | Response | Status Codes | Auth | Pagination/Filtering |
|---|---|---|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} |

Versioning: {{...}} · Idempotency: {{...}} · Error response shape: {{...}}

## 12. Event Design
N/A if no events are published/consumed.
| Event | Publisher | Consumer(s) | Payload | Retry Policy | Ordering | Idempotency | Dead-Letter Handling |
|---|---|---|---|---|---|---|---|
| {{e.g. AppointmentCreated}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} |

## 13. Background Processing
N/A if none. Examples: email, reminders, scheduled jobs, retries, cleanup, sync, batch.
| Job | Trigger | Responsibility | Failure/Retry Behavior |
|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} |

## 14. Security Design
- Authentication: {{...}}
- Authorization / RBAC / claims: {{derived from Requirement.md §13}}
- PII protection: {{...}}
- Encryption (at rest / in transit): {{...}}
- Secrets management: {{...}}
- Key rotation: {{...}}
- Token lifetime / session management: {{...}}
- Security logging: {{...}}
- Threat considerations: {{...}}

## 15. Performance Design
- Performance targets: {{measurable, e.g. "95% of requests < 500ms"}}
- Expected traffic / concurrent users: {{from Requirement.md §16}}
- Large dataset handling: {{...}}
- Pagination strategy: {{...}}
- Caching strategy: {{what is cached, where, invalidation}}
- Lazy loading / streaming: {{...}}
- Database optimization: {{...}}
- Connection pooling: {{...}}
- Async processing: {{...}}

## 16. Scalability Strategy
N/A / Unchanged if this story doesn't affect scaling characteristics.
- Horizontal vs vertical scaling: {{...}}
- Statelessness: {{...}}
- Distributed cache / message queue: {{...}}
- Auto scaling: {{...}}
- Database / storage scaling: {{...}}
- Future growth assumptions: {{...}}

## 17. Reliability
- Retry: {{...}}
- Timeout: {{...}}
- Circuit breaker: {{...}}
- Fallback: {{...}}
- Redundancy: {{...}}
- Health checks: {{...}}
- Recovery / graceful degradation: {{...}}
- Disaster recovery: {{...}}

## 18. Observability
- Logging: {{...}}
- Metrics: {{...}}
- Tracing / correlation IDs: {{...}}
- Monitoring / alerting: {{...}}
- Audit logs: {{tie back to Requirement.md §14}}
- Diagnostic information: {{every production issue here should be diagnosable — how?}}

## 19. Error Handling Strategy
- Validation errors: {{...}}
- Business errors: {{...}}
- Infrastructure errors: {{...}}
- Unexpected exceptions: {{...}}
- Retryable vs non-retryable: {{...}}
- User-facing messages: {{...}}
- Internal logging: {{...}}

## 20. Deployment Architecture
N/A / Unchanged if this story doesn't change hosting/infra.
- Hosting / containers / cloud resources: {{...}}
- Networking / load balancer: {{...}}
- Storage: {{...}}
- Configuration / environment strategy: {{...}}
- CI/CD assumptions: {{...}}

## 21. Configuration Management
N/A / Unchanged if no new configuration.
- Application settings: {{...}}
- Secrets: {{...}}
- Feature flags: {{...}}
- Environment variables: {{...}}
- Dynamic configuration: {{...}}

## 22. Dependency Analysis
| Dependency | Purpose | Failure Impact | Fallback |
|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} |

## 23. Risks
- Technical risk: {{...}}
- Performance risk: {{...}}
- Migration risk: {{...}}
- Operational risk: {{...}}
- Security risk: {{...}}
- Third-party risk: {{...}}
- Scalability risk: {{...}}

Mitigations stated per risk above; unmitigated risks carry into ExecutionPlan.md's Risk
Analysis (stage 04).

## 24. Design Decisions
Acts as this story's Architecture Decision Record (ADR). One entry per significant decision.
| Decision | Reason | Alternatives Considered | Trade-offs | Impact |
|---|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} | {{...}} |

Also log each to the story's `DecisionLog.md`.

## 25. Assumptions
Only assumptions explicitly approved by the user. Never invented.
- {{assumption}} — approved by: {{who}}, on: {{date}}

## 26. Open Questions
Every unresolved design issue. Do not make implementation decisions for these — record and
escalate instead.
- [ ] {{question}} — owner: {{who}}

## Design Validation Checklist
Self-assessed against `ai-factory/gates/sds-standard.md#design-validation-checklist` before
presenting the gate below.

## Approval Gate — Definition of Ready
See `ai-factory/gates/approval-gates.md#03-design-sds` and
`ai-factory/gates/sds-standard.md#definition-of-ready-for-technical-design`.
- [ ] Every business requirement has a corresponding design
- [ ] All architectural decisions are documented
- [ ] No unresolved architectural blockers remain
- [ ] External dependencies are fully identified
- [ ] Security, scalability, reliability, and observability have been addressed
- [ ] Technical Design (TDS, next) can turn this into a code-level blueprint without making
      additional architectural decisions

<!-- Add "**Gate confirmed by user — {{date}}**" above this line once the user confirms. -->
