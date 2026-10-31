# Risk Analysis — Guidance

Used at 04-ExecutionPlan (and referenced again at 08-ArchitectureReview to check whether risks
materialized).

## How to score
- **Likelihood**: Low (unlikely this sprint) / Medium (plausible) / High (expected without
  mitigation)
- **Impact**: Low (cosmetic/reversible) / Medium (degrades a feature) / High (data loss,
  security breach, multi-tenant data leak, compliance violation, outage)

## Rule
Any risk scored **High/High** must have a stated mitigation before the ExecutionPlan gate can
pass. If no mitigation is possible within scope, the risk must be escalated as an Open Question
back to the user rather than silently accepted.

## Common risk categories for this project (clinic management system)
- **Tenant data isolation** — cross-tenant data leakage in queries, caching, or background jobs
- **PHI/PII exposure** — patient records in logs, error messages, analytics events
- **RBAC gaps** — new endpoint/feature missing an authorization check
- **Migration safety** — destructive schema changes, long-running migrations on large tables
- **Audit trail gaps** — an action that should be logged for compliance but isn't
- **Backup/restore** — new data store or table not covered by existing backup jobs

## Template row
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| {{risk}} | L/M/H | L/M/H | {{mitigation, or "escalated as Open Question"}} |
