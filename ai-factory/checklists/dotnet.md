---
id: dotnet
name: .NET (ASP.NET Core + EF) coding checklist & rules
version: 1.0
applies-to: ["**/*.cs", "**/*.csproj", "**/Migrations/**", "**/*.sql"]
stages: [05-implementation, 07-code-review]
spec-profile: B   # Backend profile of ai-factory/gates/code-spec-standard.md (§9.2-B)
---

# .NET Checklist — ASP.NET Core / Entity Framework

A **checklist plugin** (see `ai-factory/checklists/README.md`). It is loaded only when the diff or
task touches files matching `applies-to` and the plugin is active in the registry. It has two parts:
the **Review Checklist** (what the Developer self-checks at stage 05 and the reviewer checks at stage
07) and the **Rules** (the forbidden shapes with rationale, cited by ID — `DN-n`).
Task-level data-access specs are written to `ai-factory/gates/code-spec-standard.md` §9.2-B; this
plugin is the baseline a package's §9.4 *references, not copies*.

## Review Checklist
Run every group that the diff touches. Mark an item N/A only with a reason. Items marked 🔍 need
measurement or profiling evidence — don't fail them on a hunch; all others are defects on sight.
Rule IDs in brackets are defined in **Rules** below.

**Short on time — check these first:** load-once (DN-26) · N+1 (DN-3) · indexes (DN-1, DN-25) ·
projection (DN-13) · premature `ToList()` (DN-2) · unbounded concurrency (DN-27) · blocking async
(DN-12) · authorization (DN-34) · input/secret handling (DN-41, DN-42).

### Data access & EF performance
- [ ] **Projection** — reads `Select` into a DTO/anonymous type with only the columns the caller uses;
      no full entity, no redundant columns, no unused `Include` [DN-13]
- [ ] **Async** — every DB call is the `...Async` form, awaited end-to-end, `CancellationToken` passed;
      no `.Result`/`.Wait()`/`async void`/`Task.Run` around DB calls [DN-12]
- [ ] **Tracking** — `AsNoTracking()` (or non-entity projection) on read-only queries [DN-14]
- [ ] **Filter in SQL** — `Where`/`OrderBy`/paging before materialization; no `ToList()` then filter;
      sargable, translatable predicates; no client evaluation [DN-2, DN-7, DN-19]
- [ ] **Existence/count** — `AnyAsync`/`CountAsync`, not loading rows [DN-8, DN-15]
- [ ] **Load once** — the same entity/data is queried once per operation: no exists-then-get, no helper
      re-fetching what the caller holds (pass the loaded object down), no loop-invariant query in a
      loop [DN-26, DN-11]
- [ ] **No N+1** — no query, `Include`, or lazy navigation inside a loop/lambda; id lists chunked [DN-3]
- [ ] **Joins** — via navigation properties; ≤2 joins per query; no 1:1 `GroupBy`; one collection
      `Include` max, else `AsSplitQuery`/split queries [DN-5, DN-6, DN-18]
- [ ] **Indexes** — every predicate/order/join column has an index status; unindexed ones have a
      narrowing plan or index proposal [DN-1, DN-25]
- [ ] **Paging** — bounded results; `Skip`/`Take` with a deterministic unique `OrderBy`; keyset paging
      where specified; large exports streamed [DN-8, DN-20, DN-22]
- [ ] **Writes** — one `SaveChanges` per unit of work, none in a loop; mutated entity loaded once,
      tracked; `AddRange`/`ExecuteUpdate`/`ExecuteDelete` for bulk [DN-11, DN-16]
- [ ] **Context safety** — no parallel use of one `DbContext`; scoped lifetime; no `IQueryable` leaking
      out of the data layer [DN-17, DN-21, DN-24]
- [ ] **Concurrency cap** — no unbounded `Task.WhenAll`/`Parallel` over DB/HTTP work; cap stated
      (measured or marked default) and within the connection-pool limit [DN-27]
- [ ] **Work order / enumeration** — filter before expensive work; reused deferred sequence
      materialized once [DN-10, DN-28, DN-29]
- [ ] **Large data** — big writes/processing chunked (batch size stated) or streamed [DN-22, DN-30]
- [ ] 🔍 **Execution plan / allocations** — plan reviewed for high-traffic/large-table queries;
      allocations flagged only with evidence [DN-31, DN-32]
- [ ] **Raw SQL** — parameterized, no concatenation [DN-23]
- [ ] **Matches spec** — query equals the task's §9.2-B LINQ skeleton and expected SQL shape / round trips
- [ ] **Optimistic concurrency** — competing updates have a concurrency token and `409` mapping [DN-37]

### API, security & input
- [ ] **Authorization** — `[Authorize]`/policy on every endpoint; object-level/tenant ownership checked;
      deny by default [DN-34]
- [ ] **DTOs only** — no entity bound from or returned to the wire; only allowed fields mapped [DN-35]
- [ ] **Input limits** — body/collection/page-size/file limits, safe deserialization, rate limiting
      where public or expensive [DN-41]
- [ ] **No secret/PII leakage** in logs, exceptions, `ProblemDetails`, telemetry [DN-42]

### Reliability & correctness
- [ ] **External calls** — `IHttpClientFactory`, timeout, bounded retry only on idempotent calls,
      cancellation [DN-33]
- [ ] **Time/money/text** — UTC + `TimeProvider`; `decimal` for money; ordinal/invariant comparison
      and parsing [DN-36]
- [ ] **Background work** — no fire-and-forget; long work via hosted service/queue; scope captured
      correctly [DN-38]
- [ ] **DI** — lifetimes valid (no captive dependency), constructor injection only [DN-39]
- [ ] **Disposal** — `using`/`await using` for disposables [DN-40]
- [ ] **Nullable & exceptions** — no unjustified `!`, no swallowing catch, `throw;` not `throw ex;`,
      exhaustive enum handling [DN-43]
- [ ] **Shared state & magic values** — no mutable statics; constants/options instead of magic
      strings/numbers [DN-44]
- [ ] **Migrations** — backward-compatible, reversible, safe on a large table [DN-45]
- [ ] **Observability** — failure/unusual paths logged with context and correlation id [DN-46]

### Tests
- [ ] Cases from the task's §9.5 exist and assert behavior; query/persistence behavior tested against
      a real provider where SQL translation matters (not only the EF in-memory provider)

## Rules (forbidden shapes)
Baseline for stage-07 review and for the Planner's §9.4. A package lists only *task-specific* shapes
plus applicable `docs/ai-learning/recurring.md` categories.

**Measure before optimizing.** Prefer the simple, correct shape §9.2 specifies; no micro-optimization
without evidence. Rules marked 🔍 (DN-31, DN-32, concurrency caps in DN-27, batch sizes in DN-30)
need measurement — profile, load test, or an execution plan — and the result (or "not yet measured,
default X") goes in the spec or `notes.md`. Don't block on a 🔍 rule without evidence; treat every
other rule (⭐ = most common/severe) as a defect on sight.

DN-1. Filter, sort, or join on a text/`string` column, or any column not `PK`/`FK`/`confirmed-indexed`, without the Narrowing plan (includes `!= null` checks).
DN-2. Materialize (`ToList`/`ToArray`/`AsEnumerable`) before `Where`/`OrderBy`/`Select`/paging; `Select()` after materialization.
DN-3. Any DB call, `Include`, or lazy navigation access inside a loop / LINQ lambda over materialized rows (N+1).
DN-4. List-scan lookups inside a loop (`FirstOrDefault`/`Any`/`Contains`/`Where` per iteration) — use a dictionary/hash set.
DN-5. `GroupBy`/loops over a navigation that is 1:1 (confirm cardinality).
DN-6. A single LINQ expression with ≥3 joins/nested subqueries, or conditional query-building that hides the shape — split into ≤2-join queries stitched by ids, or ask for an approved view/stored procedure script.
DN-7. Non-sargable predicates on columns: `.ToLower()`/`.ToUpper()`/`.Substring()`/`.Date`/`.Year ==`/arithmetic on the column — use ranges or compare the parameter side.
DN-8. `ToList().Count`, `Count() > 0` (use `Any`), unbounded result without paging.
DN-9. Business rules inside an EF expression (CIS Code Organization) — query fetches, code decides.
DN-10. A new helper/extension that duplicates a §9.3 entry; multiple enumeration of the same `IEnumerable`.
DN-11. **Read-then-refetch-to-update.** Reading an entity untracked (`AsNoTracking`, read-only query
    abstractions) to validate it, then fetching the *same* entity again tracked for mutation. If a
    task both reads and updates an entity, fetch it **once**, tracked, validate against the loaded
    instance, mutate that instance, and `SaveChanges()` — one round trip, not two.
DN-12. **Sync or blocking DB I/O.** Any database call that is not async (`ToList`, `First`, `Any`, `Count`,
    `SaveChanges`, `Find` instead of the `...Async` form); `.Result`/`.Wait()`/`GetAwaiter().GetResult()`
    on a task; `async void`; `Task.Run` wrapped around a DB call to fake async; a missing `await`
    or a missing `CancellationToken` pass-through on the async chain. The async chain is async
    end-to-end, controller/handler to `...Async` call, so threads are released during I/O.
DN-13. **No projection / redundant columns.** Loading a full entity (or `Include`-ing whole related
    entities) for a read, when the table has many columns and the caller needs a few. Every read
    uses `Select` into a DTO / anonymous type naming **only the columns the caller consumes** —
    no "just in case" columns, no navigation loaded and then ignored. Full entity only when it
    is mutated and saved in the same unit of work (§9.2 Projection). Read-only paths use
    `Select` over navigation properties instead of `Include`.
DN-14. **Tracking on read-only queries.** A read that is never mutated and saved but tracks entities
    (no `AsNoTracking()` / no projection to a non-entity type).
DN-15. **Existence/count via loading.** Loading rows or entities to answer "does it exist / how many" —
    use `AnyAsync` / `CountAsync` (or `LongCountAsync`) translated to SQL.
DN-16. **`SaveChanges` in a loop**, or one save per item. Collect changes and save once per unit of
    work; use `AddRange`/`RemoveRange`; for mass updates/deletes use set-based `ExecuteUpdate`/
    `ExecuteDelete` (EF Core 7+) or an approved stored procedure instead of load-modify-save per row.
DN-17. **Parallel work on one `DbContext`.** `Task.WhenAll` or concurrent queries sharing the same
    context instance (it is not thread-safe). Run sequentially, or give each its own scoped context.
DN-18. **Cartesian explosion.** More than one collection `Include` (or collection navigation in a
    projection) in a single query without `AsSplitQuery` or an explicit second query stitched by ids.
DN-19. **Client evaluation / untranslatable expressions.** Custom C# methods, `ToString()`, complex
    string/regex operations, or local functions inside a `Where`/`Select`/`OrderBy` that EF cannot
    translate (silent client evaluation or runtime throw). Predicate columns are compared against
    pre-computed parameters. Leading-wildcard `Contains`/`EndsWith` on large text columns also
    counts here unless the Narrowing plan covers it.
DN-20. **Deep or unstable paging.** `Skip`/`Take` without a deterministic, unique `OrderBy` (add the PK as
    a tiebreaker); `Skip` of large offsets on big tables where keyset/seek paging (`Where(x.Id > last)`)
    is specified; paging computed in memory.
DN-21. **Leaking `IQueryable` / deferred execution.** Returning `IQueryable` out of the data layer, or
    passing it across layers, so queries execute (or re-execute) in an unpredictable place; building
    a query then enumerating it more than once. The data layer returns materialized DTOs/lists.
DN-22. **Unbounded result materialization.** Loading a very large set into memory for export/report —
    stream (`AsAsyncEnumerable`) or page it; never `ToListAsync` an unbounded query.
DN-23. **Unparameterized raw SQL.** `FromSqlRaw`/`ExecuteSqlRaw` with string concatenation or
    interpolation of user input — use `FromSqlInterpolated`/parameters (also a security finding).
DN-24. **`DbContext` lifetime misuse.** A context held in a static/singleton, cached across requests, or
    created per item in a loop; contexts are scoped per request/unit of work.
DN-25. **New filter/sort/join column with no index decision.** A new predicate, `OrderBy`, or join
    column introduced with no §9.2 index status and, where it is unindexed and the table is
    large, no migration/index proposal or Narrowing plan.
DN-26. **Repeated query for the same data.** Fetching the same entity or the same data more than once
    in one operation — e.g. an `AnyAsync`/`CountAsync` existence check followed by a `FirstOrDefaultAsync`
    of that row; a helper/validator/child method that re-queries what its caller already loaded;
    the same lookup issued in two branches; a loop-invariant query inside a loop. **Load the object
    once** (one query, with the projection or tracked entity the whole operation needs), then
    **pass the loaded instance down** to helpers and reuse it for validation, branching, and any
    mutation. A method that needs data the caller already holds takes it as a parameter, not an
    id to re-fetch. The §9.2 "Round trips" count is the maximum — every query in the operation
    is listed once, and a second query for the same row or key set is a finding. (Related: DN-3 N+1,
    DN-10 multiple enumeration, DN-11 read-then-refetch-to-update.)
DN-27. **Unbounded concurrency.** `Task.WhenAll(items.Select(ProcessAsync))` or `Parallel` over an
    unbounded collection, hitting the database or an HTTP service. Cap it (`SemaphoreSlim`,
    `Parallel.ForEachAsync` with `MaxDegreeOfParallelism`, or chunking) at a value that respects
    the connection-pool limit, and state the cap in the spec. The cap is **measured, not guessed**
    — see "Measure before optimizing" below. (Each concurrent task still needs its own scoped
    `DbContext`, DN-17.)
DN-28. **Expensive work before filtering.** `Select(ExpensiveCalculation).Where(...)`, mapping or
    computing over rows that a later `Where`/`Take`/`Any` discards. Filter (and page) first, then
    project/compute.
DN-29. **Repeated enumeration or copying of in-memory sequences.** Calling `Any()`/`Count()`/`Where()`/
    `foreach` several times over the same deferred LINQ sequence (each pass re-runs the pipeline),
    and needless `ToList()`/`ToArray()` copies or chained intermediate LINQ collections.
    Materialize **once** when the sequence is reused; don't materialize when it is consumed once.
DN-30. **Large datasets processed whole.** Inserting, updating, or processing thousands of records in
    one call or one `SaveChanges`, or building a huge list before processing it. Process in
    chunks (`Chunk(n)`, batch size stated and justified), or stream (`AsAsyncEnumerable`,
    `IAsyncEnumerable<T>`) where each item is handled and released.
DN-31. **Critical query shipped without an execution-plan check.** For a query on a high-traffic path
    or a large table, the spec/self-review records that the execution plan was reviewed (no table
    or clustered-index scan on a large table, index used, estimated vs actual rows sane), or
    states why it isn't needed. 🔍 *Validate*.
DN-32. **Gratuitous allocations on hot paths.** Per-item temporary objects, string concatenation in
    loops (use `StringBuilder`/interpolation once), boxing, closure allocations in tight loops,
    and intermediate collections that a single pass could avoid. 🔍 *Validate* — only flag with
    evidence (profile/benchmark) or on a clearly hot path.
DN-33. ⭐ **HttpClient & external calls.** `new HttpClient()` per call or per request (use
    `IHttpClientFactory`/typed clients); an external call with no timeout; retries (Polly /
    `Microsoft.Extensions.Http.Resilience`) on a non-idempotent call or without back-off/jitter;
    no circuit-breaker or fallback on a dependency that can take the request down; blocking
    waiting on an external call with no cancellation.
DN-34. ⭐ **Missing authorization / object-level ownership.** An endpoint, handler, or Server-side
    action with no `[Authorize]`/policy where one is required; a resource fetched or changed by id
    without checking the caller may access *that* object/tenant (IDOR); authorization decided only in
    the UI. Deny by default.
DN-35. ⭐ **Over-posting / entity on the wire.** Binding a request body directly to an EF entity or
    mapping all request fields onto an entity (mass assignment); returning an EF entity from an
    API. Use explicit request/response DTOs and map only the allowed fields.
DN-36. **Time, money, text, culture.** `DateTime.Now`/`UtcNow` read directly in logic that needs a test
    (inject `TimeProvider`); local-time storage or comparison (store/compare UTC; `DateTimeOffset`
    where an offset matters); `double`/`float` for money (use `decimal`); `ToLower()`/`==` for
    case-insensitive text compare (use `StringComparison.Ordinal`/`OrdinalIgnoreCase`); parsing or
    formatting numbers/dates without `CultureInfo.InvariantCulture`.
DN-37. **No concurrency or idempotency control.** An entity updated by competing requests with no
    concurrency token (`rowversion`/`[ConcurrencyCheck]`) and no `409` mapping for
    `DbUpdateConcurrencyException`; a retryable POST/command with no idempotency key or natural
    de-duplication.
DN-38. **Fire-and-forget / unmanaged background work.** An un-awaited `Task` (or `Task.Run`) that
    outlives the request, swallowing exceptions; long or retryable work run in the request instead
    of a hosted service/queue; a request-scoped `DbContext`/service captured by a background
    callback (create a scope inside the background work).
DN-39. **DI lifetime misuse.** A scoped service captured by a singleton (captive dependency);
    resolving services from the container in a method body (service locator); property injection
    where constructor injection works; a `DbContext` or stateful service registered as singleton.
DN-40. **Undisposed resources.** `IDisposable`/`IAsyncDisposable` (streams, readers, `HttpResponseMessage`,
    scopes) not wrapped in `using`/`await using`; a stream left open after read/return; owning a
    resource the DI container also disposes.
DN-41. ⭐ **Unbounded or unsafe input.** No size limits on request body, collection size, page size, or
    file upload (type, size, and content check); unsafe deserialization (`TypeNameHandling`,
    polymorphic deserialization of untrusted types); no rate limiting on a public, expensive, or
    auth endpoint; missing CSRF protection where cookie auth is used.
DN-42. ⭐ **Secrets / PII leakage.** Secrets, tokens, connection strings, or personal/health data in logs,
    exceptions, `ProblemDetails`, or telemetry; stack traces or SQL returned to the client.
DN-43. **Nullable & exception hygiene.** The null-forgiving `!` with no reason; empty `catch` or
    `catch (Exception)` that swallows; `throw ex;` instead of `throw;`; throwing/catching base
    `Exception`; control flow by exception; an enum `switch` with no default/exhaustiveness handling;
    a public API that returns `null` for "not found" where the project's result type exists.
DN-44. **Shared mutable state & magic values.** `static` mutable fields or non-thread-safe collections
    shared across requests (use `ConcurrentDictionary`/locks/immutable data/options); magic strings
    and numbers (status codes, role names, config keys, limits) instead of constants/options/enums.
DN-45. ⭐ **Unsafe migration.** A migration that drops/renames a column or table in the same release the
    old code still reads it (use add → backfill → switch → drop across releases); a long blocking
    index/column change on a large table with no online/batched approach; data-loss risk with no
    rollback; a migration edited after it was applied.
DN-46. **Weak observability.** A failed, rejected, or unusual path that logs nothing; log messages
    with no identifying context (ids, operation); no correlation/trace id propagated to downstream
    calls; an operation central to the feature with no metric/health signal where the project
    standard expects one.
