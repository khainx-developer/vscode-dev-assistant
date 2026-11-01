# Checklist Registry (project-owned)

The single list of checklist plugins this project uses. A plugin applies only if its row is
**active** and its globs match the files being worked on — how that matching is done and used is
defined once, in `ai-factory/checklists/README.md#procedure`. Edit this table freely; to add a
plugin copy `_TEMPLATE.md`, fill it in, and add a row. Set `off` to retire one (keep the file).

This project (`dev-assistant`) is a single VS Code extension package — TypeScript, bundled with
esbuild, no database, no ASP.NET Core/EF Core backend, no React/Next.js frontend (its UI is
inline-HTML webviews, see `ai-factory/gates/coding-standard.md`). The `dotnet` and `react-nextjs`
plugins below ship with the AI Factory framework for stacks this project doesn't have — `dotnet`'s
globs never match here, and `react-nextjs`'s `**/*.ts`/`**/*.js` globs *would* spuriously match
this project's plain TypeScript files by extension alone despite none of its React/Next.js-specific
Rules (JSX, Server Components, `next.config.*`, etc.) applying. Both are marked `off` below so
`ai-factory/checklists/README.md#procedure`'s step 1 doesn't select either for this project's
tasks/reviews. No active plugin currently matches this stack — that's expected, not a gap (see
"Ideas for later plugins" below; a `vscode-extension`/`node-typescript` plugin could be added here
if this project ever needs stack-specific Rules beyond what `coding-standard.md` and
`gates/review-checklist.md` already cover).

| id | file | applies to (globs) | status |
|---|---|---|---|
| `dotnet` | `dotnet.md` | `**/*.cs`, `**/*.csproj`, `**/Migrations/**`, `**/*.sql` | off — no .NET code in this project |
| `react-nextjs` | `react-nextjs.md` | `**/*.tsx`, `**/*.ts`, `**/*.jsx`, `**/*.js`, `**/next.config.*`, `**/app/**`, `**/*.css` | off — no React/Next.js code in this project; its `**/*.ts`/`**/*.js` globs would otherwise spuriously match every file here |

Ideas for later plugins: `security`, `accessibility`, `sql-migrations`, `api-contract`,
`observability`, `vscode-extension`/`node-typescript`, `mobile`.
