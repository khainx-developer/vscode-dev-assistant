# Coding Standard — ASP.NET Core / EF Core (API) + React / Next.js / TypeScript (UI)

**Version**: 1.0 — pre-filled preset of `ai-factory/templates/CodingStandard.md`

**How to use:** a project on this stack copies this file to `ai-factory/gates/coding-standard.md`
(replacing the scaffold) and edits the `{{...}}` placeholders and anything the real codebase does
differently. Like the blank template, it is **project-owned once copied** — never let a later
framework re-copy overwrite it. Where the real codebase already does something differently, the
codebase wins; record the divergence in `DecisionLog.md`.

It is the concrete style/structure reference for this stack. Rules for query shape, performance, and
security live in the checklist plugins `ai-factory/checklists/dotnet.md` (Part A) and
`ai-factory/checklists/react-nextjs.md` (Part B); code-level task specs in
`ai-factory/gates/code-spec-standard.md`. This document does not repeat them, it points to them.

## Purpose
One shared, concrete answer for "how do we structure and name things" in the API and the UI, so
each story doesn't re-derive conventions and no two stories drift into incompatible styles.

---

# Part A — API (ASP.NET Core / EF Core / SQL)

## A1. Solution & Project Structure
`{{Solution}}.sln` with one project per responsibility; dependencies point inward only:
- `{{App}}.Api` — composition root + HTTP layer (controllers/minimal-API endpoints, filters,
  middleware, DI registration). No business logic, no `DbContext` queries.
- `{{App}}.Application` — use cases: commands/queries + handlers, validators, DTOs, service and
  persistence **interfaces**. Depends on `Domain` only.
- `{{App}}.Domain` — entities, value objects, domain rules/events. Depends on nothing.
- `{{App}}.Infrastructure` — EF Core `DbContext`, entity configurations, migrations, query/
  repository implementations, external clients. Implements Application interfaces.
- `{{App}}.*.Tests` — one test project per production project it covers.
Single deployable? Say so here rather than leaving it blank. Verify the target framework in the
project's `.csproj` (use the repo's current LTS) before assuming a language/package feature.

## A2. Naming Conventions
- Types, methods, properties, namespaces: `PascalCase`; locals/parameters: `camelCase`; private
  fields: `_camelCase`; interfaces: `I` prefix; async methods: `Async` suffix.
- Namespace mirrors folder: `{{App}}.Application.Orders.GetOrder`.
- Use-case types: `{Verb}{Noun}Command` / `{Noun}Query` + `{...}Handler` + `{...}Validator`,
  together in a feature folder (e.g. `Orders/CreateOrder/`).
- DTOs: `{Noun}Dto` / `{Noun}Response` / `{Noun}Request` (API contract types). EF configuration:
  `{Entity}Configuration`.
- Tests: class `{Subject}Tests`; method `{Method}_{Scenario}_{Expected}`.

## A3. Layering & Dependency Rules
- Controllers/endpoints are thin: bind + authorize, send the command/query, map the result to an
  HTTP response. No business rules, no EF types, no `try/catch` for the general case.
- Handlers own orchestration and business-rule enforcement for **one** use case; they depend on
  Application interfaces, never on Infrastructure types or `HttpContext`.
- Only `Infrastructure` references EF Core types; `Application` talks to persistence through
  interfaces/query objects that return materialized DTOs or lists.
- Business rules never live inside an EF expression or a controller (CIS Code Organization).

## A4. Architecture Pattern
{{CQRS with a mediator (e.g. MediatR) / plain application services / other — state which and why.
Default: command/query handlers per use case; a command may call `SaveChangesAsync` once.}}

## A5. Persistence Conventions (EF Core)
- Entity mapping via `IEntityTypeConfiguration<T>` classes, applied with
  `ApplyConfigurationsFromAssembly`; no data-annotation sprawl on entities.
- Migrations: code-first `dotnet ef migrations add`, one migration per story change, reviewed for
  index and data-loss impact; never edit an applied migration. Schema and entity changes ship in the
  same story.
- Transactions: the command handler owns the unit of work; no nested/implicit transaction guessing.
- `DbContext` lifetime, query shape, projection, tracking, paging, concurrency, indexes: not
  restated here — `ai-factory/checklists/dotnet.md` (rules `DN-n`) and the task's §9.2-B spec.

## A6. API Conventions
- REST, JSON, `camelCase` property names; plural-noun routes (`/api/v1/orders/{id}`); URL-segment or
  header versioning via `Asp.Versioning`.
- Status codes: `200/201/204` success, `400` validation (ProblemDetails with field errors), `401/403`
  auth, `404` not found, `409` conflict/concurrency, `500` unexpected. Errors use RFC 7807
  `ProblemDetails`; one shared shape, produced by global exception handling.
- Request/response types are explicit DTOs (`dotnet.md` DN-35).
- List endpoints are paginated (`page`/`pageSize` with a max, or cursor); results carry a total or
  next-cursor; ordering is deterministic.
- CORS: {{no CORS — UI calls the API server-side only / explicit allow-list of UI origins}}.
- Public contract: publish OpenAPI; the UI's typed client is generated from it (see B5).

## A7. Validation Conventions
- Request-shape validation: FluentValidation (or `[ApiController]` model validation) at the
  boundary, before any persistence read/write. Business-rule validation: in the handler against the
  loaded instance. A validation failure returns `400`, not an exception.
- Validate at every boundary the diff introduces (ids, enums, lengths, ranges, tenant ownership).

## A8. Error Handling & Exceptions
- Expected failures (not found, invalid input, forbidden, conflict) return a result type
  (`OperationResult<T>` / `Result<T>`) mapped to a status code; exceptions are for the unexpected.
- One global handler (`IExceptionHandler` / middleware) logs and maps unexpected exceptions to a
  `500` `ProblemDetails` with a correlation id; no per-action `try/catch`.

## A9. Logging Conventions
- `ILogger<T>`, structured message templates (`"Order {OrderId} created"`), never string
  interpolation in the template. Levels: `Debug` diagnostics, `Information` meaningful events,
  `Warning` recoverable, `Error` failures (log once, at the boundary that handles it); include a
  correlation/trace id. What must never be logged: `dotnet.md` DN-42.

## A10. Async Conventions
- Async end-to-end for all I/O, accepting and passing `CancellationToken` — rules: `dotnet.md` DN-12, DN-27.

## A11. Language Conventions
- `<Nullable>enable</Nullable>` and `<ImplicitUsings>` per project; warnings-as-errors for nullable.
  Records for DTOs/value objects; `sealed` classes by default; `required`/init-only properties for
  DTOs. Analyzers (`Microsoft.CodeAnalysis.NetAnalyzers`, `.editorconfig`) enforced in CI.
- XML docs on public types/members of shared libraries; elsewhere prefer clear names over comments.

## A12. Testing Conventions
- xUnit; NSubstitute (or Moq) for mocks; AwesomeAssertions/FluentAssertions for assertions.
  Arrange-Act-Assert, one behavior per test, names per A2.
- Unit tests: handlers/validators/domain with mocked interfaces. Query/persistence tests run against
  a **real provider** (Testcontainers / SQLite-in-memory is not enough for SQL translation) — the
  EF in-memory provider is not accepted as proof a query translates or performs.
- API tests: `WebApplicationFactory` for endpoint contract, auth, and status codes.
- Every Acceptance Criterion has a corresponding test by stage 06; cases come from the task's §9.5.

## A13. Configuration & Secrets
- Options pattern (`IOptions<T>` + validation on start) — read config once, at startup, into typed
  options; no `IConfiguration` reads in business logic. Secrets from user-secrets/Key Vault/env
  vars; nothing secret committed. `appsettings.{Environment}.json` for non-secret overrides.

## A14. Multi-Tenancy
{{N/A — single tenant / tenant resolved from an authenticated claim in middleware → `ITenantContext`
→ global EF query filter + tenant column. Never accept a tenant id from an unverified request
field. A violation is a Blocking Condition (CIS).}}

## A15. Folder/File Conventions
- Group by **feature** inside each project (`Orders/CreateOrder/...`), not by technical type.
  One public type per file, filename = type name. Tests mirror the production folder/namespace.

---

# Part B — UI (React / Next.js App Router / TypeScript)

## B1. Project Structure
One Next.js app (`ui/`) with its own `package.json`, independent of the API project.
- `app/` — routes (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`,
  `route.ts` for route handlers). Route files are thin: compose features, no business logic.
- `features/{feature}/` — components, hooks, server actions, API calls, types for one feature.
- `components/` — shared, presentational, feature-agnostic UI. `lib/` — API client, utilities,
  config. `types/` — shared types. Dependency direction: `app` → `features` → `components`/`lib`.

## B2. Naming Conventions
- Components/types: `PascalCase`; hooks: `useCamelCase`; functions/variables: `camelCase`;
  constants: `UPPER_SNAKE`. Files: `kebab-case` for routes/folders, `PascalCase.tsx` per component,
  `useThing.ts` per hook. Props interface `{Component}Props`. Test files `{name}.test.tsx`.

## B3. Layering & Dependency Rules
- Components render; hooks/server functions decide (`react-nextjs.md` RX-8). A feature never imports another feature's internals — share through `components/`
  or `lib/`.
- All HTTP to the .NET API goes through the typed client in `lib/api` (generated from OpenAPI), never
  ad hoc `fetch` strings in components.

## B4. Server vs Client Components
- Server Component by default; `'use client'` only at the smallest leaf that needs it — rules:
  `react-nextjs.md` RX-12.
- Mutations use **Server Actions** (typed result) or route handlers.

## B5. Data Fetching Conventions
- Fetch on the server where possible; client-side fetching through the project's data layer
  (TanStack Query / SWR). Loading, caching, and waterfall rules: `react-nextjs.md` RX-1, RX-12.
- Loading and error UX via `loading.tsx`/`Suspense` and `error.tsx`.

## B6. Error Handling
- Route-level `error.tsx` boundaries; typed result from server actions/API client (never throw for an
  expected failure); user-facing messages are safe text, details logged server-side.

## B7. Styling & Accessibility
- {{Tailwind / CSS Modules / design-system library — pick one}}; design tokens, not hard-coded colors
  or spacing; `next/image` and `next/link`. WCAG 2.1 AA is the target — checks: `react-nextjs.md` RX-10.

## B8. Language Conventions
- TypeScript `strict: true` (type-safety rules: `react-nextjs.md` RX-6). API types come from the generated client; validate untrusted input with a schema (e.g. Zod) at the
  boundary (forms, server actions, route handlers). ESLint (`next/core-web-vitals`) + Prettier in CI.

## B9. Configuration & Secrets
- Read config once through a validated `lib/env.ts`; no environment-specific URLs hard-coded.
  Secret/token handling: `react-nextjs.md` RX-14.

## B10. Testing Conventions
- Vitest/Jest + React Testing Library: query by role/label, assert user-visible behavior, cover
  loading/error/empty/populated states and each interaction. Mock the network at the boundary (MSW),
  not the hook under test. Playwright for critical end-to-end flows.
- Every Acceptance Criterion has a test by stage 06; cases come from the task's §9.5.

## B11. Folder/File Conventions
- One component per file; colocate styles, tests, and types with the component/feature. No barrel
  files that pull server and client code into one import.

---

## Applicability
- `ai-factory-technical-design` reads this document alongside `tds-standard.md` and must not
  contradict it. `prompts/implementation.md` treats every rule as "project coding standards"
  (CIS); a Task Package's Developer Freedom never overrides it. `prompts/code-review.md` /
  `review-checklist.md` use it for the "matches conventions" check. `prompts/unit-test.md` follows
  A12/B10.

## Amendments
A deviation is a Design Decision in the story's `Design.md`/`TechnicalDesign.md` with a stated
reason; update this document in the same story. Never diverge silently.
