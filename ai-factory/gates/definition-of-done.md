# Definition of Done (base checklist)

Every `ExecutionPlan.md` inherits this base list; story-specific items are added on top, never
removed.

## Code
- [ ] Implementation matches `Design.md` approach (deviations logged in `DecisionLog.md`)
- [ ] No commented-out code, debug logging, or TODOs left without a tracked follow-up
- [ ] Follows existing project conventions (naming, structure, error handling)

## Tests
- [ ] Unit tests cover every acceptance criterion in `Requirement.md`
- [ ] Existing tests still pass (no regressions)
- [ ] Edge cases from Risk Analysis are covered

## Security & Compliance
- [ ] RBAC/tenancy isolation enforced where the story touches multi-tenant data
- [ ] No PII/PHI logged in plaintext where Analysis.md flagged compliance concerns
- [ ] No secrets or credentials committed

## Docs & Traceability
- [ ] `DecisionLog.md` updated for any non-obvious decision made during implementation
- [ ] Story folder artifacts (Requirement → Release) are all present and consistent

## Review
- [ ] `CodeReview.md` verdict: Pass
- [ ] `ArchitectureReview.md` verdict: Pass
