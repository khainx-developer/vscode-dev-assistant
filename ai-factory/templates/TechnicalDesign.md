# Technical Design Specification — {{story_title}}

- **Story ID**: {{story-slug}}
- **Status**: Draft | In Review | Approved
- **Author**: Architect/Analyst agent (ai-factory-technical-design, default: Claude)
- **Input**: `03-Design/Design.md` (SDS) only
- **Date**: {{date}}

Follows `ai-factory/gates/tds-standard.md`. Specifies **how the solution is implemented at the
source code level** — no architectural decisions (those belong in Design.md/SDS) and no
business rule redefinition (those belong in Requirement.md/BRS). The Developer should be able
to translate this document into code without design choices of their own.

## 1. Solution Structure
{{Complete solution layout — e.g. Application / Domain / Infrastructure / API / Worker / Shared
/ Tests. Document the responsibility of every project touched.}}

## 2. Module Structure
| Module | Purpose | Responsibilities | Dependencies | Public Interfaces | Internal Components | Forbidden Dependencies |
|---|---|---|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} |

## 3. Folder Structure
{{Folder organization for the code touched by this story, e.g.:}}
```
Application/
  Commands/
  Queries/
  Validators/
  Handlers/
Infrastructure/
  Persistence/
  Repositories/
```
Must remain consistent with the existing codebase's structure.

## 4. Layer Responsibilities
| Layer | Allowed Responsibilities | Forbidden Responsibilities | Dependency Rules |
|---|---|---|---|
| Presentation | | | |
| Application | | | |
| Domain | | | |
| Infrastructure | | | |
| Persistence | | | |

## 5. Class Responsibilities
Each class has a single responsibility.
| Class | Type (Controller/Handler/Repository/...) | Responsibility |
|---|---|---|
| {{...}} | {{...}} | {{...}} |

## 6. Request Flow
```
{{HTTP Request}}
   ↓
{{Controller}}
   ↓
{{Validator}}
   ↓
{{Command/Query}}
   ↓
{{Handler}}
   ↓
{{Domain}}
   ↓
{{Repository}}
   ↓
{{Database}}
```
Alternative flows: {{...}}

## 7. CQRS Strategy
N/A if CQRS is not used — state that explicitly and why.
- Commands: {{...}}
- Queries: {{...}}
- Handlers: {{...}}
- Mediator: {{...}}
- Validation / behavior pipeline: {{...}}
- Transaction boundary: {{...}}
- Read model / write model: {{...}}
- When CQRS should NOT be used here: {{...}}

## 8. Domain Model
| Element | Type (Entity/Aggregate/Value Object/Domain Service/Domain Event/Factory/Repository) | Responsibility |
|---|---|---|
| {{...}} | {{...}} | {{...}} |

## 9. Repository Strategy
Business logic must never exist inside repositories.
| Repository | Purpose | Responsibilities | Returned Objects | Transaction Ownership | Query Responsibilities | Caching | Forbidden Logic |
|---|---|---|---|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{business logic}} |

## 10. DTO Strategy
- Request DTOs: {{...}}
- Response DTOs: {{...}}
- Internal DTOs: {{...}}
- External DTOs: {{...}}
- Mapping rules: {{...}}
- Validation ownership: {{...}}
- Versioning strategy: {{...}}

## 11. Validation Strategy
- Input validation: {{...}}
- Business validation: {{...}}
- Database validation: {{...}}
- Cross-field / cross-entity validation: {{...}}
- Validation library: {{...}}
- Validation ownership: {{which layer owns which check}}
- Validation order: {{...}}

## 12. Error Handling
| Exception Type | Mapping to HTTP Response | Logging Policy | Retry Behavior |
|---|---|---|---|
| Business exception | | | |
| Validation exception | | | |
| Infrastructure exception | | | |
| Concurrency exception | | | |
| Unexpected exception | | | |

## 13. Transaction Strategy
- Transaction boundaries: {{...}}
- Nested transactions: {{...}}
- Rollback behavior: {{...}}
- Compensation: {{...}}
- Distributed transactions: {{...}}
- Event publishing (in/out of transaction): {{...}}
- Outbox pattern: {{used? N/A?}}

## 14. Dependency Injection
| Service | Lifetime (Scoped/Transient/Singleton) | Registration | Notes |
|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} |

Service locator pattern: prohibited unless explicitly justified here.

## 15. Logging Strategy
- Structured logging format: {{...}}
- Log levels and when to use each: {{...}}
- Correlation IDs: {{...}}
- Sensitive data policy (what must never be logged): {{...}}
- Audit logging: {{tie back to Requirement.md §14 / Design.md §18}}
- Performance logging: {{...}}

## 16. Configuration Strategy
N/A if no new configuration.
- Feature flags: {{...}}
- Configuration classes: {{...}}
- Environment overrides: {{...}}
- Secrets: {{...}}
- Dynamic configuration: {{...}}

## 17. Mapping Strategy
- Manual mapping vs mapper library: {{...}}
- Projection: {{...}}
- Database projection: {{...}}
- Performance considerations: {{...}}

## 18. File Impact Analysis
The Developer should know exactly which files are expected to change.
| Action | File Path | Notes |
|---|---|---|
| Create | {{...}} | {{...}} |
| Modify | {{...}} | {{...}} |
| Delete | {{...}} | {{...}} |
| Must NOT change | {{...}} | {{...}} |

## 19. Naming Conventions
| Kind | Convention | Example |
|---|---|---|
| Classes | {{...}} | {{...}} |
| Interfaces | {{...}} | {{...}} |
| Commands/Queries | {{...}} | {{...}} |
| Events | {{...}} | {{...}} |
| Repositories | {{...}} | {{...}} |
| Methods | {{...}} | {{...}} |
| Variables | {{...}} | {{...}} |
| Database tables/indexes | {{...}} | {{...}} |
| API routes | {{...}} | {{...}} |

Consistency with existing codebase conventions is mandatory — match what's already there over
inventing a new convention.

## 20. Coding Standards
- SOLID / DRY / KISS / YAGNI: {{project-specific notes, if any deviation from defaults}}
- Nullable reference types: {{...}}
- Async guidelines / cancellation token usage: {{...}}
- Exception guidelines: {{...}}
- Collection guidelines: {{...}}
- Immutability: {{...}}
- Thread safety: {{...}}

## 21. Performance Considerations
- Potential bottlenecks: {{...}}
- Database queries / N+1 risk: {{...}}
- Caching opportunities: {{...}}
- Large collections / pagination / streaming: {{...}}
- Memory allocation: {{...}}
- Async processing: {{...}}

## 22. Security Considerations
- Authorization points (exact locations in code): {{...}}
- Input sanitization: {{...}}
- Sensitive data handling: {{...}}
- Encryption: {{...}}
- Secrets: {{...}}
- Injection prevention: {{...}}
- Cross-tenant protection (code-level check, not just policy): {{...}}

## 23. Testability
- Mock boundaries / interfaces: {{...}}
- Dependency injection for test isolation: {{...}}
- Integration vs unit test split: {{...}}
- Test data strategy: {{...}}
- Deterministic behavior (clock, randomness, external calls): {{...}}

## 24. Technical Risks
- Complex algorithms: {{...}}
- Concurrency: {{...}}
- Performance: {{...}}
- Migration: {{...}}
- External systems: {{...}}
- Third-party libraries: {{...}}
- Backward compatibility: {{...}}

## 25. Implementation Constraints
Mandatory — the Developer must not deviate from these.
- {{e.g. Must use MediatR}}
- {{e.g. Must use EF Core}}
- {{e.g. Must not introduce new packages}}
- {{e.g. Must not change public contracts}}
- {{e.g. Must remain backward compatible}}

## 26. Developer Freedom
What the Developer MAY decide without asking:
- Private helper methods
- Local variable names
- Minor refactoring within a touched file
- Code formatting
- Extraction of private methods
- {{anything else explicitly delegated}}

## 27. Developer Restrictions
The Developer MUST NOT:
- Change architecture
- Introduce new frameworks
- Modify public APIs
- Change database schema without approval
- Change security model
- Change business rules
- Invent missing requirements
- Guess expected behavior

If any of the above seems necessary to complete a task, stop and escalate rather than doing it.

## 28. Open Technical Questions
Unresolved implementation questions. The Developer must stop if blocked by one of these —
never invent a solution.
- [ ] {{question}} — owner: {{who}}

## Design Validation Checklist
Self-assessed against `ai-factory/gates/tds-standard.md#design-validation-checklist` before
presenting the gate below.

## Approval Gate — Definition of Ready
See `ai-factory/gates/approval-gates.md#03-technicaldesign-tds` and
`ai-factory/gates/tds-standard.md#definition-of-ready-for-execution-planning`.
- [ ] Every implementation decision has already been made
- [ ] Every major class has a defined responsibility
- [ ] Every transaction boundary is documented
- [ ] Every validation point is documented
- [ ] Every repository responsibility is defined
- [ ] Every implementation constraint is documented
- [ ] The Developer can begin coding without making architectural or design decisions

<!-- Add "**Gate confirmed by user — {{date}}**" above this line once the user confirms. -->
