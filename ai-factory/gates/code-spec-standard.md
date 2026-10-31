# AI Engineering Standard — Code & Data Access Specification (CDS)

**Version**: 1.0

ITPS defines the *shape* of a Task Package; CIS defines the Developer's *behavior*. Neither says
**how the code itself must be shaped**. That gap is where generated code goes wrong: the package
says *what* to build ("show the customer's orders"), so the agent invents the *how* — a join on
an unindexed text column, a `ToList()` followed by a loop that queries or scans again, a
component that fetches inside an effect and re-renders forever, a helper that already existed.
CIS forbids the Developer from making design decisions, so the design decisions must be **made
upstream and written down at code level**. This standard says what that means.

Owners: the Planner writes it (TDS for the design, Task Package §9.1-§9.5 / QuickPlan Approach for
the per-task copy); the Developer verifies it (preflight) before coding and evidences it
(self-review) after; stage 07 re-checks it.

The standard has a stack-neutral core and two stack profiles. Apply the core always; apply each
profile to the code the task touches:
- **Profile B — Backend / .NET (ASP.NET Core + EF)**: C# that reads or writes a database through
  Entity Framework (EF Core; where a project is on EF6 the rule intent holds but a few APIs differ —
  note `ExecuteUpdate`/`ExecuteDelete`, `AsSplitQuery`).
- **Profile F — Frontend / React + Next.js (TypeScript, App Router)**: React components, hooks,
  Server Components, Server Actions, and data fetching.

The project's stack-specific naming/structure/layering is its `coding-standard.md`; a ready-made
preset for this exact stack is `ai-factory/templates/CodingStandard.dotnet-nextjs.md` (Part A = Profile
B, Part B = Profile F).

Other stacks (Node/Prisma, etc.) follow the core and map the profile rules onto their own ORM or
framework; the project's `coding-standard.md` names the concrete types.

## When it applies
A task/QuickPlan **must** carry §9.1-§9.5 when it:
- reads or writes a database or remote API, or
- loops/filters/groups/joins over collections that came from one, or
- adds a new class, handler, service, hook, component, or public function, or
- modifies an existing function longer than ~30 lines (component > ~80 lines).

Not applicable (state "N/A — <reason>" per section): pure SQL/migration scripts, config, docs,
static markup/styling-only tasks (they still need §9.1 Code Design and §9.3 Reuse Map where new
components/functions are added).

## Where it lives & level of detail
The spec is **required at task-detail time**: written into every Task Package §9 (Full tier) or
the QuickPlan's Code & Data Access Spec section (Quick tier) when the Planner creates the tasks
— not left for the Developer to work out. The test is the readiness gate below, question 9: a
developer who has never seen this codebase can implement it without choosing a join, filter column,
projection, fetch strategy, state location, or helper. Concretely that means:
- exact file paths, type/function/component names, and full signatures;
- the algorithm as numbered steps, with every empty/not-found/duplicate/permission path stated;
- the query or hook written out as a skeleton, not described in prose;
- every referenced symbol anchored to `file:line`, found by real search;
- every fact (cardinality, index status, API contract) confirmed and cited, never assumed;
- test cases named, one per acceptance criterion and edge path.
Detail beyond that (variable names, formatting, private helpers within budget) stays Developer
Freedom per CIS.

## 9.1 Code Design
| Field | Content |
|---|---|
| File & type | exact path; class/handler/service/component/hook; layer and why it belongs there |
| Signature | exact name, parameters (props), return type (`OperationResult<T>` / `Task<...>` / props interface), `CancellationToken` / `AbortSignal` where async |
| Dependencies | injected interfaces (readonly) and where registered; for React: hooks/contexts/stores used |
| Algorithm | numbered steps, ≤15 lines: inputs → queries (by Q-ID) → in-memory steps → result; include empty/not-found/duplicate/permission paths and the failure status or UI state for each |
| Complexity budget | each method ≤ ~40 lines and < 10 branches; each component ≤ ~80 lines of JSX+logic; where it would exceed, **name the extracted private methods / child components / custom hooks** here |

## 9.2 Data Access Spec
A task with more than one non-trivial query/request (any join, subquery, grouping, non-key filter,
or dependent fetch) must be **split** — one non-trivial query per task. Trivial key lookups may
share a task.

### 9.2-B Backend / database (C# + EF)
| Field | Content |
|---|---|
| Purpose / caller | what the query answers; who calls it |
| Root entity & volume | starting `DbSet`; approximate row count (from the human/domain notes — never invented) |
| Joins | prefer **navigation properties** from the root entity. For each: property name, target, **cardinality 1:1 / 1:n confirmed from the schema** (cite the source). Manual `Join` only on integer/GUID key columns that are PK/FK |
| Predicates | one row per predicate: column, type, and **Index status** = `PK` \| `FK` \| `confirmed-indexed` \| `confirmed-unindexed` \| `UNCONFIRMED`; and *who confirmed* (human + date, project knowledge list, or schema PK/FK) |
| Narrowing plan | required if any predicate/order/join column is unindexed (incl. `!= null`): (1) the selective indexed SQL-side predicate and its expected candidate-set bound, (2) the in-memory step over that bounded set |
| Projection | DTO name and **exact fields**. Full entity only if it is mutated and saved in the same unit of work |
| Tracking | `AsNoTracking()` yes/no + why |
| Order / paging | order keys (indexed?), `Skip`/`Take`. `Skip` always with an `OrderBy` |
| Materialization | the single `ToListAsync`/`FirstOrDefaultAsync`/`AnyAsync`/`CountAsync` call, and confirmation nothing is enumerated twice |
| Expected SQL shape | one sentence the reviewer can check, e.g. "1 round trip; SELECT of 4 columns from Attachment INNER JOIN Service on ServiceId; no subquery" |
| Round trips | maximum number of DB calls for the operation, and confirmation none is inside a loop |
| Writes | entities mutated, `SaveChanges` count, transaction owner, and **which query above loaded the entity being mutated** — a mutated entity must be loaded by a tracked query in this same spec, never by a separate untracked read elsewhere in the task (`dotnet.md` DN-11) |
| LINQ skeleton | the query written out (compilable-looking). The Developer implements this shape, not their own |

**`UNCONFIRMED` is a Planner blocker.** The Planner asks the human once, batched, before finalizing
the package; a package with an `UNCONFIRMED` predicate must not ship. Known-unindexed columns are
recorded as `confirmed-unindexed` and *must* have a Narrowing plan or a different predicate.

### 9.2-F Frontend / client data (React)
| Field | Content |
|---|---|
| Purpose / caller | what the request answers; which component/hook owns it |
| Endpoint | method + path + request/response types (exact names, from the API contract or generated client) |
| Render location | Server Component (async fetch), Client Component, Server Action, or route handler — and why (default: Server Component; `'use client'` only at the smallest leaf that needs state/effects/handlers) |
| Fetch mechanism | Server Components: direct `await` of the typed API client. Client: the project's data layer (TanStack Query / SWR) — **never** a raw `fetch` in `useEffect` unless the project standard says so |
| Cache key / invalidation | Next.js: explicit `cache`/`revalidate`/`tags` on every fetch and the `revalidatePath`/`revalidateTag` a mutation calls; client: query key shape, stale time, invalidating mutations |
| Loading / error / empty states | the exact UI for each (`loading.tsx`/`Suspense`, `error.tsx`, empty view); error surfaces user-facing text, never a silent catch |
| Dependencies / waterfalls | requests that run in parallel vs. dependent; no sequential fetch that could be parallel |
| Round trips | maximum requests per user action / render, none inside a loop or list-item component |
| Pagination / volume | page size, or approximate list size and whether virtualization is needed |
| Writes | mutation, optimistic update yes/no, rollback on failure, double-submit protection |
| Skeleton | the hook/query written out (compilable-looking). The Developer implements this shape |

### In-memory processing (post-materialization / post-fetch)
Declare the approach for any collection work after the data arrives: build a `Dictionary`/`HashSet`/
`ToLookup` (C#) or `Map`/`Set`/keyed object (TS) from the result and look up by key — never a
nested loop, or `FirstOrDefault`/`Where`/`Contains`/`find`/`filter`/`includes` on a list inside a
loop (O(n²)), or repeated enumeration of an `IEnumerable`. Large id lists passed back to the
database (`ids.Contains(x.Id)`) are chunked (≤ 500) and the chunk size stated.

## 9.3 Reuse Map
| Need | Existing symbol (`file:line`) | Action |
|---|---|---|
| e.g. "resolve path" | `AttachmentResolver.ResolveAsync` (`src/Logic/...:123`) / `useDebounce` (`ui/hooks/useDebounce.ts:8`) | call as-is / extend in listed file / **none exists** |

Built by the Planner from real code search (codemap/MCP if available, otherwise grep/find of
implementations, duplicate types, existing hooks/components/utilities). "None exists" must list
the search terms tried. The Developer creates a new helper **only** where the map says none
exists; anything else is a duplicate (a Major finding at stage 07).

## 9.4 Forbidden shapes
The baseline lives in the checklist plugins (`ai-factory/checklists/`) — never copied here or into a
package. A package's §9.4 lists only *task-specific* shapes plus applicable categories from
`docs/ai-learning/recurring.md`. Which plugins apply and who runs them:
`ai-factory/checklists/README.md#procedure`. The Planner writes the spec so it already satisfies
their Rules (Profile B pairs with `dotnet.md`, Profile F with `react-nextjs.md`).

## 9.5 Test cases
List named cases covering each acceptance criterion: happy path, empty/not-found, boundary, each
failure status, and for queries "returns only the rows meeting X / excludes Y".
- **Backend:** `Method_Scenario_Expected`; use the project's in-memory/mocked `DbSet` helpers per
  its unit-test skill.
- **Frontend:** `renders X when Y` / `calls Z on W`, using Testing Library — query by role/label,
  not by class or test-id unless unavoidable; cover loading, error, empty, and populated states
  and each user interaction (click, type, submit, keyboard); mock the network at the boundary
  (e.g. MSW), not the hook under test.

## Planner readiness gate (adds to ITPS AI Quality Gate)
For every package that triggers this standard, the answer must be YES to all:
1. Is every type/method/component's signature and layer specified (§9.1), with the algorithm steps written?
2. Does every query/request have a complete §9.2 block with **no `UNCONFIRMED`** and cardinality/contract cited from the real schema or API definition?
3. Is there at most one non-trivial query per task?
4. Does every unindexed column have a Narrowing plan or a replacement predicate? *(backend)*
5. Is the LINQ/query skeleton present and consistent with the "Expected SQL shape" / round-trip count?
6. Is the Reuse Map filled from real searches, with anchors that exist?
7. Does §9.4 list the task-specific shapes and applicable `recurring.md` categories (baseline referenced, not copied)?
8. Are §9.5 test cases listed?
9. Could a developer who has never seen this codebase write the code without choosing a join, a filter column, a projection, a fetch strategy, a state location, or a helper? *(must be YES)*
10. Does the skeleton itself comply with the selected checklist plugins' Rules — not just internally consistent,
    but actually free of a forbidden shape (text-column join, 3+-join monster, `GroupBy` on a 1:1
    navigation, fetch-in-effect, etc.)? A skeleton that is complete and self-consistent but violates
    a rule still fails this question — check it against the rules, don't just check it against itself.

## Developer preflight
Before writing code — implementation stage step 0.
Verify the package against reality and write the result (3-6 lines) to
`05-Implementation/notes.md` under the Task ID:
1. Every cited anchor exists and matches the named symbol.
2. Schema/API contract for each §9.2 entity or endpoint: navigation cardinality, PK/FK, request/response types match the spec.
3. Predicate index status matches the spec / the project's known-index list. *(backend)*
4. Reuse Map symbols exist and their signatures fit.
5. §9.1-§9.5 are present for a task that triggers this standard.

Any mismatch, `UNCONFIRMED`, or missing section is a **Blocking Condition** (ITPS): record it,
stop, ask for a package fix. Do not "improve" the spec by guessing.

## Developer self-review evidence
After coding, before marking Completed.
Per query/request: state that the written code matches the spec's skeleton and Expected SQL shape
/ round-trip count, and that no forbidden shape (§9.4 or a selected checklist's Rules) is present. Per method/component: length/branch budget
respected, no duplicate of a Reuse Map entry. Record in `notes.md`; checklist results are recorded per
`ai-factory/checklists/README.md#procedure`. If reality forced a deviation
(e.g. the skeleton doesn't translate), that is a Blocking Condition — report it, don't ship the
deviation.

## Anti-patterns
Never acceptable in a package.
- "Query the attachments for the service" / "load the orders in the page" with no root entity,
  endpoint, columns, or shape.
- "Use LINQ/EF efficiently", "avoid N+1", "avoid re-renders", "follow best practices" as the only
  performance guidance — a rule without the concrete query is a wish, not a specification.
- §13 Performance Constraints of "N/A" while §9.2 exists.
- An index status of "probably indexed" / "should be fine".
- A Reuse Map with no search evidence.
