# Dev Assistant

A private VS Code extension bundling handy developer utilities. Not published to the Marketplace — built and shared internally as a `.vsix` file.

## Features

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

## Building & sharing the .vsix

```bash
npm install
npm run package
```

This produces `dev-assistant-<version>.vsix` in the project root. Share that file with teammates.

Each teammate installs it via:

- VS Code UI: Extensions view → `...` menu → **Install from VSIX...**
- or CLI: `code --install-extension dev-assistant-<version>.vsix`

## Bumping the version

Edit `version` in `package.json` before packaging a new build so teammates can tell builds apart.
