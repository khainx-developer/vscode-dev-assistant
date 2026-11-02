# Contributing

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
