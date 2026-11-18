# Groups 3 and 4 — Code and API Toolkit

Stateless tools that work on a selection. They live in the Tools tab as the
*Code* and *API* categories, plus the editor context menu and *Run Tool…*. No
GitHub/Jira connection needed. See `roadmap.md`.

Tool logic: pure functions in `src/services/textTools/`, registered once in
`src/services/toolRegistry.ts`.

## Already built

- Format JSON, Base64 encode/decode, URL encode/decode, JSON string escape,
  UUID v4, Unix timestamp now / to ISO
- Tools tab search
- Tools tab category grouping (Code / API / Debug)
- JWT decoder (API) — decode only, never verify or send; includes Base64URL
- Removed duplicate case transforms — use VS Code **Transform to Uppercase /
  Lowercase / Camel Case / Snake Case / Kebab Case**
- Timestamp with time zones (Code) — UTC, local, and named IANA zones via Intl
- Hash (API) — SHA-256, SHA-1, MD5, SHA-512 (and All hashes)

## Keep as is

(Same set as Already built above — no further changes planned for those.)

## Add (in priority order)

Tools
1. **JSON ↔ YAML** (Code) — check bundle size for the YAML dependency
2. **JSON → Types** (Code) — TypeScript and C# (the languages in use); more
   languages later. Handle nested objects, arrays, nullable / optional fields;
   C# as classes or records with `PascalCase` names and a property-name option.

Tools tab, continued
3. *Run Tool…* Quick Pick command (one entry, replaces per-tool commands)
4. Recent / pinned tools row

Later, by demand
5. Minify JSON and sort JSON keys (Code)
6. URL / query-string parser (API)
7. cURL → C# `HttpClient` / fetch / axios converter (API)
8. Basic auth header and HMAC (API)
9. JSONPath query on a selection (Code)
10. Date calculator — add/subtract days, relative age (Code)
11. Output choice per tool — replace, insert below, or copy
12. Regex tester (Code) — only if requested; needs a two-input contract
    (.NET and JavaScript regex flavours differ; pick one or offer both)

## Not planned

- **API group extras:** REST client (Thunder Client, REST Client, httpyac exist),
  OpenAPI viewer, mock server.
- **Covered by VS Code or other extensions:** text diff, line tools (sort,
  dedupe, trim), color converter, Markdown table formatter, case transforms
  (built-in *Transform to …*).
- **Rarely used:** cron explainer, JSON ↔ CSV, UUID v7 / ULID / nanoid, HTML
  entities, number base, Lorem ipsum.
- AI regex / cron generation.

## Open questions

- Bundle-size budget is set: under about +100 KB combined for toolkit
  dependencies, loaded on demand (see `roadmap.md`). Measure the YAML library
  before adding it.
