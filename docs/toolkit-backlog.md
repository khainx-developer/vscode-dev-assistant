# Toolkit

Stateless tools that work on text, in the Tools tab (Code and API groups). They
need no GitHub/Jira connection. See `roadmap.md`.

Tool logic: pure functions in `src/services/textTools/`, registered once in
`src/services/toolRegistry.ts`.

## Next

- ***Run Tool…*** — one Command Palette entry with a searchable list of all tools,
  running the chosen tool on the editor selection and putting the result back or
  on the clipboard. Today JWT, Hash, the timestamp converter and JSON ↔ YAML are
  only reachable from the sidebar.

## Not planned

- **More tools until needed:** JSON → Types, minify / sort JSON, URL parser, cURL
  converter, HMAC, JSONPath, regex tester, date calculator, recent / pinned tools,
  cron explainer, JSON ↔ CSV, UUID v7 / ULID, HTML entities, number base, Lorem
  ipsum.
- **Covered by VS Code or extensions:** text diff, line tools (sort, dedupe, trim),
  color converter, Markdown table formatter, REST client (Thunder Client, REST
  Client, httpyac), OpenAPI viewer, mock server.
- **Covered by editor AI:** stack trace analysis and the debug tools built around
  it, regex or cron generation.

## Bundle budget

Toolkit dependencies stay under about +100 KB combined; about 56 KB is left. See
`roadmap.md`.
