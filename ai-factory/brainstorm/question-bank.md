# Brainstorm — Clarifying Question Bank

Used by the `ai-factory-requirement` skill during stage 01-Requirement/02-Analysis to gather
enough material to fill every applicable section of the BRS (`ai-factory/gates/brs-standard.md`,
`ai-factory/templates/Requirement.md`). Not every question applies to every story — the agent
picks the categories relevant to what the story actually touches, asks them, and records
answers (or a stated, reasonable default if the user has no strong opinion) in `Analysis.md`.
Never invent an answer to a question that materially affects security, compliance, or a business
rule — those must be asked, not assumed.

## Business Rules & Validation (BRS §9-10)
- What rules govern whether this action is allowed (e.g. no overlapping appointments, referenced
  record must exist and be active)?
- What field-level constraints apply (format, required, max length, allowed values, date ranges)?
- Are there status transitions that are invalid (e.g. can't edit a cancelled record)?

## Workflow & Exceptions (BRS §11-12)
- What is the primary step-by-step flow from trigger to completion?
- What alternative flows exist (e.g. partial success, user cancels mid-flow)?
- What should happen on each failure mode (not found, conflict, timeout, external dependency
  down, validation failure)?

## Authorization (BRS §13)
- For each actor, what are they explicitly allowed to do, and explicitly forbidden from doing?
- Does any operation require a second person's approval before it takes effect?

## Notifications (BRS §15)
- Does this feature need to notify anyone? On what trigger, to whom, via what channel?
- What happens if the notification fails to send — retry, drop, alert someone?

## Reporting (BRS §19)
- Does this feature need to appear in any report or dashboard?
- What would someone want to filter, sort, or group it by?

## Terminology (BRS §7)
- Are there business terms here that could mean different things to different people (e.g.
  "Appointment" vs "Visit" vs "Encounter")? Pin down one definition per term.

## Tenancy (BRS §16-17)
- Is this feature scoped to a single clinic/tenant, or shared across multiple clinics?
- Does data introduced/touched here need tenant-level isolation (separate rows, schema, or DB)?
- Can data ever be shared or compared across tenants (e.g. analytics, benchmarking)?

## RBAC / Auth (BRS §6, §13 — feature-level, before per-actor detail)
- Which roles can access this feature (e.g. admin, doctor, nurse, receptionist, patient)?
- Are there field-level restrictions (e.g. a nurse sees vitals but not billing)?
- Does this introduce a new permission, or reuse an existing one?
- Should actions here be restricted to the record owner / assigned practitioner only?

## Compliance / HIPAA / PHI / PII (BRS §14, §16-17)
- Does this feature create, read, or modify patient health information (PHI)?
- Does it touch personally identifiable information (PII) beyond what's already handled?
- Are there retention or right-to-deletion requirements for this data?
- Does anything here need to be excluded from logs, analytics, or error reporting?

## Data / Database (BRS §17)
- Does this require new tables/columns, or reuse existing schema?
- Any expected data volume that affects indexing or query design?
- Is a migration required, and is it reversible?

## Scalability / Performance (BRS §16)
- Expected number of concurrent users / requests for this feature?
- Any known peak-load pattern (e.g. morning check-in rush)?
- Is this on a latency-sensitive path (patient-facing) or backend/admin?

## Audit (BRS §14)
- Does this action need to be recorded in an audit trail (who did what, when)?
- Is there a regulatory reason the audit trail must be immutable or retained N years?

## Backup / Disaster Recovery (BRS §16-17)
- Is new data covered by existing backup jobs, or does it need its own?
- What's the acceptable data-loss window (RPO) if this data store fails?

## Users / Scale & Integration (BRS §16, §18)
- Roughly how many total users/clinics is this expected to support at launch vs. in a year?
- Any expected integration with external systems (insurance, labs, pharmacies)? Protocol, auth,
  retry/timeout expectations?

## Recording answers
In `Analysis.md`, log every question actually asked with its answer and whether it came from
the user or was assumed as a default. Flag any unanswered question that blocks the Requirement
gate as an Open Question in `Requirement.md` rather than guessing.

