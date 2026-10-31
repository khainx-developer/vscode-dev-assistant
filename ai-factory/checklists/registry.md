# Checklist Registry (project-owned)

The single list of checklist plugins this project uses. A plugin applies only if its row is
**active** and its globs match the files being worked on — how that matching is done and used is
defined once, in `ai-factory/checklists/README.md#procedure`. Edit this table freely; to add a
plugin copy `_TEMPLATE.md`, fill it in, and add a row. Set `off` to retire one (keep the file).

| id | file | applies to (globs) | status |
|---|---|---|---|
| `dotnet` | `dotnet.md` | `**/*.cs`, `**/*.csproj`, `**/Migrations/**`, `**/*.sql` | active |
| `react-nextjs` | `react-nextjs.md` | `**/*.tsx`, `**/*.ts`, `**/*.jsx`, `**/*.js`, `**/next.config.*`, `**/app/**`, `**/*.css` | active |

Ideas for later plugins: `security`, `accessibility`, `sql-migrations`, `api-contract`,
`observability`, `python`, `java`, `mobile`.
