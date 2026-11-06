# Contributing

## Project layout

The code is organized by layer, not by feature, so a reviewer can tell at a glance whether a
change touches presentation, business logic, or an external integration:

- `src/extension.ts` — composition root. Activation wires every layer together and registers
  commands.
- `src/ui/` — everything VS Code renders: webview panels (`panels/DashboardPanel.ts`,
  `panels/ToolPanel.ts`), the sidebar (`views/SidebarProvider.ts`), command-palette handlers
  (`commands/*.ts`, one file per feature group, each exporting a list of `DevUtilityCommand`),
  and editor-selection helpers (`textEdit.ts`).
- `src/services/` — business/domain logic with no VS Code or network dependency beyond typing:
  the GitHub/Jira attention engines, the Jira↔PR link matcher, the attention inbox builder, and
  the pure text-tool transforms (`textTools/`) behind the "Other Tools" panel.
- `src/infrastructure/` — adapters to external systems and persistence: the GitHub/Jira MCP
  adapters, auth, config/connection stores, the PR cache, the refresh scheduler, and the raw MCP
  connection/OAuth plumbing.
- `src/shared/` — cross-cutting type definitions with no behavior (`githubTypes.ts`,
  `jiraTypes.ts`, `mcpTypes.ts`, `toolTypes.ts`).

Each `*.ts` file sits next to its `*.test.ts` counterpart.

To add a new editor utility: create (or extend) a file in `src/ui/commands/`, export its
`DevUtilityCommand` entries, add it to `src/ui/commands/index.ts`, and declare the command id +
title in `package.json` (`contributes.commands`, and optionally the context menu).

## Development

```bash
npm install
npm run watch     # esbuild in watch mode
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

## Building a .vsix

```bash
npm install
npm run package
```

This produces `dev-assistant-toolkit-<version>.vsix` in the project root, installable via:

- VS Code UI: Extensions view → `...` menu → **Install from VSIX...**
- or CLI: `code --install-extension dev-assistant-toolkit-<version>.vsix`

## Publishing

```bash
npx vsce login khainx-developer   # one-time, needs an Azure DevOps PAT with Marketplace (Manage) scope
npm run package
npx vsce publish
```

Bump `version` in `package.json` before publishing a new release, and add an entry to `CHANGELOG.md`.
