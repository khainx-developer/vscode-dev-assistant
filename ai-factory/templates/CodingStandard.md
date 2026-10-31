# Coding Standard — {{stack summary, e.g. "ASP.NET Core / EF Core / PostgreSQL" or "Node.js/Express + Next.js"}}

**Version**: 1.0

Unlike BRS/SDS/TDS/EPS/ITPS, this is not a per-story artifact standard, and unlike
`cis-standard.md` it is not a behavioral contract either — it's the concrete, stack-specific
style and structure reference for this project (locked in during
`stories/{{story-slug}}/03-Design/Design.md` §{{n}}: {{one-line summary of the stack/structure
decision}}; see `DecisionLog.md`). CIS says "follow project coding standards" — this document is
what that phrase means until the actual codebase itself becomes the authority (see
`ai-factory-technical-design` and `prompts/implementation.md`, which point here first and to the
real code second, once real code exists to diverge from this doc).

This file is **project-owned, not framework content**. `ai-factory` ships this template blank;
the first story to reach `ai-factory-technical-design` fills it in for this project's actual
stack and structure, then every later story reads and maintains it. Once filled in, treat it as
yours: if you later re-copy framework files from a newer clone of the `ai-factory` repo, don't
let that overwrite your filled-in content — diff and merge by hand instead. See `README.md`.

> **Stack presets:** for ASP.NET Core / EF Core + React / Next.js / TypeScript, start from the
> pre-filled `ai-factory/templates/CodingStandard.dotnet-nextjs.md` instead of this blank scaffold.

## Purpose
Gives every stage that writes or reviews code — `ai-factory-technical-design` (TDS class/layer
naming), `prompts/implementation.md` (actual code), `prompts/unit-test.md` (test code),
`prompts/code-review.md` (review) — one shared, concrete answer for "how do we structure and
name things" in this project, so each story doesn't re-derive conventions from scratch and no two
stories drift into incompatible styles. Where the real codebase already does something
differently than this document by the time a story is implemented, the codebase wins (update
this document to match in that story's `DecisionLog.md`, don't silently diverge).

## 1. Solution & Project Structure
{{Every project/package/app in the repo, its responsibility, and the dependency direction between
them. If the project is a single deployable, say so explicitly rather than leaving this blank.}}

## 2. Naming Conventions
{{Files, types, functions/methods, variables, error/exception types, DTOs, test files/names —
one rule per concern, each with a concrete example from this stack.}}

## 3. Layering & Dependency Rules
{{What each layer (presentation/controller, service/handler, domain, repository/persistence) is
allowed and forbidden to depend on. Restates `cis-standard.md`'s Dependency Rules made concrete
for this stack.}}

## 4. Architecture Pattern (CQRS / Mediator / plain service layer / other)
{{State which pattern this project uses and why, or "N/A" with a one-line reason if none applies
at this project's current scope.}}

## 5. Persistence Conventions
{{ORM/query layer, migration tool and workflow, transaction handling, naming/mapping between the
domain model and the database schema.}}

## 6. API Conventions
{{Route/endpoint shape, request/response body conventions, status-code conventions, CORS policy
(or explicitly "no CORS" with why), error response shape.}}

## 7. Validation Conventions
{{Where field-level/request-shape validation lives vs. business-rule validation, what library (if
any), and the required order of validation relative to persistence writes.}}

## 8. Error Handling & Exceptions
{{Error/exception type hierarchy, where errors are thrown vs. caught vs. mapped to a response,
and what a truly unexpected/infrastructure failure maps to.}}

## 9. Logging Conventions
{{Logging library or approach, structured vs. plain-text, what gets logged at what level, what
must never be logged (secrets, connection strings).}}

## 10. Async Conventions
{{The project's async/concurrency idiom (async/await, promises, goroutines, etc.) and the rule
against unhandled rejections/exceptions escaping a boundary.}}

## 11. Module System / Language Conventions
{{Module system (CommonJS/ES modules/namespaces/packages), language version, strictness settings
(e.g. TypeScript `strict`), and why, if more than one applies across sub-projects.}}

## 12. Testing Conventions
{{Test runner/framework, mocking approach, unit vs. integration test boundaries (what's mocked,
what runs against a real dependency), naming convention for test files and test names, and the
traceability rule: every Acceptance Criterion must have a corresponding test by stage
06-UnitTest.}}

## 13. Configuration & Secrets
{{Where configuration is read (once, at startup, into a single object) vs. read ad hoc; how
secrets are sourced; what must never be committed.}}

## 14. Multi-Tenancy Implementation Pattern
{{The concrete pattern if this project is multi-tenant (shared schema + tenant column, schema-
per-tenant, database-per-tenant, etc.), or "N/A — single-tenant" if not.}}

## 15. Folder/File Conventions
{{One-export-per-file rules, how folders are organized (by feature/module vs. by technical
layer), and any other project-wide file-layout rule not already covered above.}}

---

## Applicability
- `ai-factory-technical-design` reads this document alongside `tds-standard.md` and must not
  contradict it — TechnicalDesign.md's class/layer/naming choices for this project are this
  document applied to one story, not reinvented per story.
- `prompts/implementation.md` (Developer role) treats every rule here as part of "project coding
  standards" (`cis-standard.md`'s Fundamental Rules) — a Task Package's Developer Freedom section
  never overrides this document.
- `prompts/code-review.md` / `review-checklist.md`'s "Matches existing code conventions and
  folder structure" check means this document until the real codebase supersedes a specific rule.
- `prompts/unit-test.md` follows §12 above for this project's tests.

## Amendments
If a story's Technical Design needs to deviate from this document (e.g. a module that
legitimately needs a different pattern), that deviation is a Design Decision in that story's
`Design.md`/`TechnicalDesign.md` with a stated reason — then this document is updated in the same
story to reflect the new baseline. Never diverge silently. If an unrelated future project in this
repo needs a genuinely different stack, that is itself a Design Decision to make explicitly,
replacing or forking this document with a stated reason.
