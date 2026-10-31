# Complexity Tiers

The full pipeline (BRS → SDS → TDS → EPS → ITPS → CIS-governed implementation → ARS) exists to
eliminate drift on stories where drift is expensive: security, tenancy, compliance, money,
architecture. Running that same ~100-section ceremony on "add a filter dropdown to the patient
list" doesn't buy accuracy — it just burns tokens generating N/A rows. Every story picks a tier
at stage 01, before Requirement is written.

## Tiers

**Full** (default when uncertain — never silently downgrade):
- Full BRS (`brs-standard.md`), full SDS + TDS (`sds-standard.md`, `tds-standard.md`), full EPS
  + one ITPS Task Package per task (`eps-standard.md`, `itps-standard.md`), full ARS review
  (`ars-standard.md`).
- Use `ai-factory-requirement` → `ai-factory-design` → `ai-factory-technical-design` →
  `ai-factory-exec-plan` → per-task `prompts/implementation.md` → `ai-factory-arch-review`.

**Quick**:
- A trimmed Requirement (`templates/QuickRequirement.md`), a single combined design+plan
  (`templates/QuickPlan.md` — replaces Design.md, TechnicalDesign.md, ExecutionPlan.md, and
  per-task Task Packages), and a trimmed review (`templates/QuickReview.md` — replaces the full
  ARS Traceability Matrix / four conformance checks).
- Use `ai-factory-requirement` (Quick branch) → `ai-factory-quick-plan` →
  `prompts/implementation.md` (reads QuickPlan.md directly, one pass, no Task Packages) →
  `ai-factory-arch-review` (Quick branch).
- CIS still applies in full — the behavioral contract is cheap (one file) and is exactly what
  keeps a fast pass from turning into unbounded scope creep. Nothing about "Quick" means "less
  disciplined," only "less document to produce."

## Deciding the tier
Run at the very start of stage 01, before Brainstorm. Answer the force-Full checklist below
against the raw story. **Any single "yes" forces Full — no exceptions, no judgment call.**

### Force-Full signals
- [ ] Creates, reads, or modifies PHI/PII (Requirement.md §"Compliance" territory)
- [ ] Touches authentication, authorization, or RBAC
- [ ] Touches multi-tenant isolation or could leak data across tenants
- [ ] Touches billing, payments, or money movement
- [ ] Adds or changes a database schema, migration, or index strategy
- [ ] Introduces a new external integration or third-party dependency
- [ ] Introduces a new architectural pattern not already used in the codebase
- [ ] Estimated to touch more than ~5 files or more than one module/domain boundary
- [ ] Requirement is ambiguous enough that Business Rules can't be stated in one sentence each
- [ ] The user explicitly asks for Full rigor

If every box is unchecked, the story is Quick. If genuinely unsure after checking the actual
codebase (not guessing), default to Full — the cost of over-scoping a small story is wasted
tokens; the cost of under-scoping a risky one is a security or compliance incident.

## Recording the tier
Write the decision to `stories/<slug>/.tier` (plain text: `quick` or `full`) and log
the checklist result in `DecisionLog.md`. Every orchestrator (`architect`, `developer`) and
every stage skill reads `.tier` first, before doing anything else, to know which artifact set
and which skill/prompt applies. Never infer the tier from which files happen to exist — the
marker file is the single source of truth.

## Escalation (Quick → Full)
If at any stage — Quick Plan, implementation, review — it becomes clear a force-Full signal
actually applies (e.g. a "simple filter" turns out to need a new tenant-scoped index), **stop
immediately**. Do not keep going in Quick mode to avoid redoing work. Update `.tier` to `full`,
log why in `DecisionLog.md`, and re-run `ai-factory-requirement` in Full mode — reuse
QuickRequirement.md's content as a head start rather than discarding it, but the output must be
a complete BRS satisfying `brs-standard.md`, not a patched QuickRequirement.md.

There is no downgrade path (Full → Quick) — if a story was correctly scoped as Full, finishing
it at Quick rigor is exactly the drift this pipeline exists to prevent.
