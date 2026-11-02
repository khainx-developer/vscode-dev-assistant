# Dev Assistant

A VS Code extension bundling handy developer utilities: a daily-tasks dashboard that tracks your GitHub pull requests and Jira issues, plus a set of quick text-transform commands.

## Features

### Daily Tasks Dashboard

A sidebar view (Dev Assistant activity bar icon) that surfaces:

- Your open GitHub pull requests, and PRs from teammates you monitor (`devAssistant.github.monitoredRepos`, `devAssistant.github.monitoredAuthors`)
- Your Jira issues and saved JQL queries (`devAssistant.jira.*` settings)

Sign in to GitHub via **Dev Assistant: Sign in to GitHub**, then open it via **Dev Assistant: Open Daily Tasks Dashboard**.

### Text utilities

All commands work on the current selection(s) (or the current line if nothing is selected), available via the Command Palette (`Ctrl+Shift+P`) and the editor right-click menu under **Dev Assistant**:

- Base64 Encode / Decode
- URL Encode / Decode
- Format JSON / Escape as JSON string
- Insert UUID
- Insert current Unix timestamp / Convert Unix timestamp to ISO date
- Case transforms: UPPERCASE, lowercase, camelCase, snake_case, kebab-case

## Project layout

- `src/extension.ts` — activation, registers every command in `src/commands`.
- `src/commands/*.ts` — one file per feature group; each exports a list of `DevUtilityCommand`.
- `src/utils/textEdit.ts` — shared helpers for editing the active editor's selections.

To add a new utility: create (or extend) a file in `src/commands/`, export its `DevUtilityCommand` entries, add it to `src/commands/index.ts`, and declare the command id + title in `package.json` (`contributes.commands`, and optionally the context menu).

## Development

```bash
npm install
npm run watch     # esbuild in watch mode
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

## Installing

Install **Dev Assistant** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=khainx-developer.dev-assistant), or build it yourself:

```bash
npm install
npm run package
```

This produces `dev-assistant-<version>.vsix` in the project root, installable via:

- VS Code UI: Extensions view → `...` menu → **Install from VSIX...**
- or CLI: `code --install-extension dev-assistant-<version>.vsix`

## Publishing

```bash
npx vsce login khainx-developer   # one-time, needs an Azure DevOps PAT with Marketplace (Manage) scope
npm run package
npx vsce publish
```

Bump `version` in `package.json` before publishing a new release, and add an entry to `CHANGELOG.md`.
