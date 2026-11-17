# Groups 3 and 4 — Code and API Toolkit

Stateless tools that work on a selection. They live in the Tools tab as the
*Code* and *API* categories, plus the editor context menu and *Run Tool…*. No
GitHub/Jira connection needed. See `roadmap.md`.

Tool logic: pure functions in `src/services/textTools/`, registered once in
`src/services/toolRegistry.ts`.

## Keep as is

Format JSON, Base64 encode/decode, URL encode/decode, JSON string escape,
UUID v4, Unix timestamp now / to ISO.

## Add (in priority order)

Tools tab
1. Search
2. Category grouping (Code / API / Debug)

Tools
3. **JWT decoder** (API) — decode only, never verify or send; includes Base64URL
4. **Timestamp with time zones** (Code) — extend the existing tool
5. **Hash** (API) — SHA-256, SHA-1, MD5
6. **JSON ↔ YAML** (Code) — check bundle size for the YAML dependency
7. **JSON → Types** (Code) — TypeScript and C# (the languages in use); more
   languages later. Handle nested objects, arrays, nullable / optional fields;
   C# as classes or records with `PascalCase` names and a property-name option.

Tools tab, continued
8. *Run Tool…* Quick Pick command (one entry, replaces per-tool commands)
9. Recent / pinned tools row

Later, by demand
10. Minify JSON and sort JSON keys (Code)
11. URL / query-string parser (API)
12. cURL → C# `HttpClient` / fetch / axios converter (API)
13. Basic auth header and HMAC (API)
14. JSONPath query on a selection (Code)
15. Date calculator — add/subtract days, relative age (Code)
16. Output choice per tool — replace, insert below, or copy
17. Regex tester (Code) — only if requested; needs a two-input contract
    (.NET and JavaScript regex flavours differ; pick one or offer both)

## Remove

1. UPPERCASE
2. lowercase
3. camelCase, snake_case, kebab-case — after checking VS Code's built-in
   *Transform to …* commands cover them

## Not planned

- **API group extras:** REST client (Thunder Client, REST Client, httpyac exist),
  OpenAPI viewer, mock server.
- **Covered by VS Code or other extensions:** text diff, line tools (sort,
  dedupe, trim), color converter, Markdown table formatter.
- **Rarely used:** cron explainer, JSON ↔ CSV, UUID v7 / ULID / nanoid, HTML
  entities, number base, Lorem ipsum.
- AI regex / cron generation.

## Open questions

- Bundle-size budget is set: under about +100 KB combined for toolkit
  dependencies, loaded on demand (see `roadmap.md`). Measure the YAML library
  before adding it.
- Verify VS Code's built-in transform and sort commands before removing tools.
