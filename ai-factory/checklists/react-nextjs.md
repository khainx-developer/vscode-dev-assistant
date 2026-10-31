---
id: react-nextjs
name: React / Next.js (TypeScript) coding checklist & rules
version: 1.0
applies-to: ["**/*.tsx", "**/*.ts", "**/*.jsx", "**/*.js", "**/next.config.*", "**/app/**", "**/*.css"]
stages: [05-implementation, 07-code-review]
spec-profile: F   # Frontend profile of ai-factory/gates/code-spec-standard.md (§9.2-F)
---

# React / Next.js Checklist — App Router, TypeScript

A **checklist plugin** (see `ai-factory/checklists/README.md`). Loaded only when the diff or task
touches files matching `applies-to` and the plugin is active in the registry. **Review Checklist** =
what the Developer self-checks at stage 05 and the reviewer checks at stage 07; **Rules** = the
forbidden shapes with rationale, cited by ID — `RX-n`. Task-level client data specs are written to
`ai-factory/gates/code-spec-standard.md` §9.2-F; this plugin is the baseline a package's §9.4
*references, not copies*.

## Review Checklist
Run every group that the diff touches. Mark an item N/A only with a reason. Items marked 🔍 need
measurement — don't fail them on a hunch. Rule IDs in brackets are defined in **Rules** below.

**Short on time — check these first:** fetch location & waterfalls (RX-1, RX-12) · `'use client'`
boundary (RX-12) · effects/derived state (RX-2, RX-3) · client-side security (RX-7, RX-14) · loading/
error/empty states (RX-9) · accessibility (RX-10).

### Next.js (App Router)
- [ ] Server Component by default; `'use client'` only at the smallest leaf that needs state/effects/
      handlers [RX-12]
- [ ] No server-only code (DB, secrets, `server-only`) imported into Client Components [RX-12]
- [ ] Independent fetches run in parallel (`Promise.all` / parallel `Suspense`), no waterfall;
      the same data is fetched once per tree and passed down or request-cached [RX-12, RX-1]
- [ ] Every fetch states caching intent (`no-store` / `revalidate` / tags); mutations call
      `revalidatePath`/`revalidateTag` [RX-12]
- [ ] Server Actions / route handlers validate input with a schema and check authorization [RX-12]
- [ ] `loading.tsx`/`Suspense`, `error.tsx`, and an empty state exist for the route [RX-9]

### React & data fetching
- [ ] Client data uses the project's data layer, not `fetch` in `useEffect`; no request inside a loop or
      list item; cache key/invalidation as specified in §9.2-F [RX-1]
- [ ] Effect/memo dependency arrays correct; no effect that sets state it depends on; no derived data
      stored in state [RX-2, RX-3]
- [ ] Stable, unique list keys (never `index` on reorderable lists) [RX-4]
- [ ] No blanket `useMemo`/`useCallback` without need; no unstable literals passed to memoized
      children/hooks for no reason [RX-5]
- [ ] Components render; business rules live in hooks/services, not JSX/handlers [RX-8]
- [ ] Subscriptions, timers, listeners cleaned up; large lists paginated/virtualized [RX-13]
- [ ] No new component/hook/utility that duplicates a Reuse Map entry; design tokens used [RX-11]

### TypeScript, security & input
- [ ] No `any`, unchecked `as`, or unexplained `@ts-ignore`; API responses typed [RX-6]
- [ ] No unsanitized `dangerouslySetInnerHTML`; no tokens in `localStorage`; no secret in client code or
      `NEXT_PUBLIC_*` [RX-7, RX-14]
- [ ] Forms validated at the boundary, guarded against double-submit, errors tied to fields [RX-16]

### UX, accessibility & performance
- [ ] Interactive elements are real `button`/`a`, labelled, keyboard-operable, focus managed [RX-10]
- [ ] Loading, error, and empty states present; no silent `catch` [RX-9]
- [ ] 🔍 Images sized / `next/image`; heavy client code code-split; no unmeasured memoization [RX-15]

### Tests
- [ ] Cases from the task's §9.5 exist; Testing Library queries by role/label; loading/error/empty/
      populated states and each interaction covered; network mocked at the boundary [RX-17]

## Rules (forbidden shapes)
Baseline for stage-07 review and for the Planner's §9.4. A package lists only *task-specific* shapes
plus applicable `docs/ai-learning/recurring.md` categories. ⭐ = most common/severe; 🔍 needs
measurement, don't block on it without evidence; everything else is a defect on sight.

RX-1. Data fetching inside `useEffect` with hand-rolled loading/error state where the project's data layer exists; fetch inside a list-item component or loop (N+1 requests).
RX-2. Missing or incorrect effect/memo dependency arrays; effect that sets state it depends on (render loop); effect used to derive state that could be computed during render.
RX-3. Derived data stored in state (duplicated source of truth); state lifted higher than its consumers, or prop-drilled > 2 levels where context/store is the project norm.
RX-4. `key={index}` on a reorderable/filterable list; missing `key`; unstable keys.
RX-5. New object/array/function literals passed to memoized children or hook dependencies every render without cause (and, inversely, blanket `useMemo`/`useCallback` with no measured need).
RX-6. `any`, unchecked `as` casts, `// @ts-ignore`/`@ts-expect-error` without reason; untyped API responses.
RX-7. `dangerouslySetInnerHTML` with unsanitized input; secrets, tokens, or environment-specific URLs in client code; tokens in `localStorage` where the project standard says otherwise.
RX-8. Business rules inside JSX or event handlers — components render, hooks/services decide.
RX-9. Missing loading/error/empty state; silent `catch`; unhandled promise rejection; mutation without double-submit protection.
RX-10. Inaccessible interaction: clickable `div` instead of `button`/`a`, missing label/alt, focus lost after modal/route change, no keyboard path.
RX-11. A new component/hook/utility that duplicates a §9.3 entry; styling or design tokens hard-coded where the design system provides them.
RX-12. **Next.js App Router misuse.** `'use client'` on a page/layout or high in the tree when only a
    leaf needs it; importing server-only code (DB, secrets, `server-only` modules) into a Client
    Component; sequential `await`s of independent fetches (waterfall) instead of `Promise.all`/
    parallel components with `Suspense`; the same data fetched in several components of one tree
    instead of once and passed down / request-cached; a fetch with no explicit caching intent;
    Server Action or route handler that trusts its input without schema validation or re-checks
    no auth; mutation without `revalidatePath`/`revalidateTag`; a secret in a `NEXT_PUBLIC_*` var.
RX-13. Unbounded list rendering with no pagination/virtualization where §9.2-F states large volume; non-cleaned-up subscriptions, timers, or listeners.
RX-14. ⭐ **Client-side security.** Auth/session tokens in `localStorage`/`sessionStorage` (use `httpOnly`,
    `Secure`, `SameSite` cookies); a missing Content-Security-Policy where the project sets one;
    user input rendered as HTML/URL without sanitization or scheme check; secrets in client
    bundles or `NEXT_PUBLIC_*`.
RX-15. 🔍 **Core Web Vitals / bundle.** Images without dimensions or `next/image` (layout shift); a heavy
    client-only library imported on first load without `next/dynamic`/code-splitting; a large
    dependency added for a trivial need; unmeasured memoization added "for performance".
RX-16. **Forms & mutation UX.** A form with no schema validation at the boundary (client and server);
    submit not disabled/guarded while pending; optimistic update with no rollback; validation
    errors not associated with their fields (`aria-describedby`).
RX-17. **Test quality.** Tests that assert implementation details or only snapshots; queries by CSS class
    or `data-testid` where role/label exists; no loading/error/empty coverage; mocking the hook or
    module under test instead of the network boundary.
