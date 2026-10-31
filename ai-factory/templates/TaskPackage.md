# Implementation Task Package — {{TASK-ID}}

Follows `ai-factory/gates/itps-standard.md`, governed throughout by the standing behavioral
contract in `ai-factory/gates/cis-standard.md`. This is the **only** file the Developer reads to
execute this task — never `ExecutionPlan.md`, other Task Packages, `Design.md`,
`TechnicalDesign.md`, or `Requirement.md`. The Developer translates this into code; it does not
decide, weigh alternatives, or infer scope. If something here is ambiguous, that's a Blocking
Condition — stop and report, don't reason your way through it.

**Brevity rule (context cost).** A package is a *task card*: only what is specific to this task.
Anything the standards already say (CIS Developer Freedom/Forbidden Activities, the ITPS
Definition of Done, generic security/perf defaults) is **not restated** — write `standard` for
that section. Aim for ≤ ~2.5K tokens; every N/A collapses to one line (`§10-§12: standard — no
task-specific rules`). Section numbers are fixed (other files cite them).

## 1. Package Information
- Task ID: {{TASK-00N}} · Feature: {{story_title}} · Module: {{from TechnicalDesign.md §2}}
- Checklists: {{ids per `ai-factory/checklists/README.md#procedure` — or "none match"}}
- Priority/Complexity/Effort: {{...}} · Owner: Developer role · Status is tracked in
  `05-Implementation/notes.md`, never here

## 2. Objective
{{Exactly one objective. Bad: "Implement Appointment Module". Good: "Implement Appointment
Creation Command Handler".}}

## 3. Background
Minimum context only — do not duplicate the source documents, cite them:
- Business Requirement: `01-Requirement/Requirement.md` — {{FR-00N}}
- System Design: `03-Design/Design.md` — {{§N}}
- Technical Design: `03-Design/TechnicalDesign.md` — {{§N}}
- Execution Plan: `04-ExecutionPlan/ExecutionPlan.md` — {{TASK-00N}}

## 4. Dependencies
{{Task IDs that must already be Completed/Verified before starting this one, or "none".}}
If any listed dependency is not yet complete: **STOP** — do not start this task.

## 5. Scope
- Included: {{...}}
- Excluded: {{...}}
Never infer scope beyond what's listed here.

## 6. Files To Create
{{Complete list, or "none".}}

## 7. Files To Modify
{{Complete list, or "none".}} No file outside this list and §6 should be touched.

## 8. Files Forbidden To Modify
{{Critical files, shared libraries, infrastructure, public APIs, database schema — anything
outside approved scope that could be tempting to touch.}}

## 9. Implementation Instructions
- Responsibilities: {{...}}
- Required patterns: {{...}}
- Required interfaces: {{...}}
- Expected behavior: {{...}}

### 9.1-9.5 Code & Data Access Spec — REQUIRED
Per `ai-factory/gates/code-spec-standard.md` (when it applies, fields, level of detail, readiness
gate). "N/A — <reason>" per sub-section only where that standard allows.

**9.1 Code Design:** {{...}}

**9.2 Data Access** (9.2-B backend / 9.2-F frontend): {{...}}
```
// query / hook skeleton
```

**9.3 Reuse Map:** {{...}}

**9.4 Forbidden shapes** (task-specific only; plugin Rules are referenced by ID): {{...}}

**9.5 Test cases:** {{...}}

Do not redesign anything described here — implement it as specified.

## 10. Business Rules
{{Only the rules relevant to this task (from Requirement.md §9), or `standard`.}}

## 11. Technical Constraints
{{Only task-specific constraints from TechnicalDesign.md (e.g. must be async, multi-tenant, no
raw SQL, must not change public interfaces), or `standard`.}}

## 12. Security Constraints
{{Only what differs from the project defaults: authorization, tenant isolation, audit, sensitive
data, input validation — or `standard`.}}

## 13. Performance Constraints
{{Only task-specific expectations: complexity, query/round-trip counts, caching, memory,
concurrency — or `standard`.}}

## 14. Acceptance Criteria
{{Every criterion measurable, e.g. "compilation succeeds", "unit tests pass", "returns HTTP
201", "publishes AppointmentCreated event", "persists entity", "logs audit record".}}

## 15. Validation Steps
Build; Unit Tests; Integration Tests / Static Analysis / Manual Verification only if applicable.
No task is complete without running these.

## 16. Expected Output
{{Exactly what should exist after implementation — e.g. new handler, updated controller,
migration, passing tests, updated documentation.}}

## 17. Rollback
{{Files to revert; migration/config/flag rollback only if not just "revert the files".}}

## 18. Common Mistakes
{{Warn the Developer about task-specific traps, e.g. "do not bypass validation", "do not
publish the event before commit", "do not access the ORM context directly", "do not duplicate
business logic", "do not introduce a new dependency".}}

## 19. Developer Freedom
`standard` (CIS Allowed/Forbidden — the full canonical list and the Anti-Patterns to watch for,
"while I was here...", unrequested refactors/optimizations/renames). Task-specific limit only if
narrower than: private helper methods, variable naming, formatting, minor refactoring within
§6-7's files are allowed; architecture/business-rule/framework changes, database redesign, and
public API changes are forbidden and a Blocking Condition.

## 20. Completion Checklist
`standard` (ITPS Definition of Done). Additions only: {{e.g. task-specific test cases
implemented; task status updated in `05-Implementation/notes.md`}}
