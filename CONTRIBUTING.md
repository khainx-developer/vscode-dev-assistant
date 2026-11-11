# Contributing

## Project layout

The code is organized by layer, so a reviewer can tell at a glance whether a change touches
presentation, orchestration, business logic, or an external integration:

```
src/
  extension.ts          activate(): registers commands, views, status bar, notifier
  app/                  composition + orchestration (may use vscode)
    container.ts        builds every long-lived service once per activation
    dashboardSession.ts the ONE shared GitHub + Jira + inbox session for sidebar and dashboard
    aiCoordinator.ts    runs AI use-cases: progress, cancellation, streaming, model picker
  ui/                   VS Code surfaces only
    panels/             DashboardPanel, ToolPanel (thin hosts for webview bundles)
    views/              SidebarProvider (thin host for the sidebar bundle)
    commands/           text-utility command handlers
    statusBar.ts        attention count in the status bar
    notifications.ts    native toasts for new attention items
    webview/
      html.ts           HTML shell + strict CSP for every webview
      router.ts         routes webview commands to navigation or the session
      shared/           tokens.css, components.css, icons, DOM helpers, item renderers
      dashboard/        Daily Tasks dashboard (main.js + dashboard.css)
      sidebar/          Home / Tools / Setup (main.js + sidebar.css)
      tool/             single text tool (main.js + tool.css)
  services/             business/domain logic
    attention/          inbox builder, comment attention, reason labels, snooze, notification planner
    github/ jira/       view controllers, attention engine, Jira↔PR link matcher
    session/            connection state machines, setup checklist status (pure)
    ai/                 prompt templates, context builders, use-cases (pure — no vscode import)
    textTools/          pure text transforms behind the Tools tab
  infrastructure/       adapters to external systems and persistence
    mcp/ github/ jira/  MCP connection + OAuth, GitHub/Atlassian adapters, config stores
    attention/          comment read state, snoozes + notification baseline (globalState)
    ai/                 languageModelClient.ts (the only vscode.lm caller), AI settings store
  shared/               types and message contracts (githubTypes, jiraTypes, messages, …)
```

Rules of thumb:

- `services/ai`, `services/session` and the attention modules are pure and unit-tested without a
  VS Code window. Keep `vscode` imports out of them.
- Webviews never talk to MCP adapters. They post commands (see `src/shared/messages.ts`); the
  session routes them to the controllers.
- Webview markup is rendered client-side from state pushed by the host. Use VS Code theme
  variables (`--vscode-*`) through the tokens in `ui/webview/shared/tokens.css`; don't add inline
  `style` attributes (the CSP blocks them).

### Authentication is protected code

GitHub and Jira auth go through `infrastructure/mcp/*`, `infrastructure/github/auth.ts`,
`githubMcpAdapter.ts`, `infrastructure/jira/connectionStore.ts`, `atlassianMcpAdapter.ts` and the
server ids in `.mcp.json`. Don't change the OAuth/loopback flow, token storage keys, server ids or
headers as part of UI or architecture work — wrap them instead. `dashboardSession.test.ts`
checks that the session still drives sign-in and Jira connect/disconnect through the same calls.

### Adding things

- **A text utility:** add (or extend) a file in `src/ui/commands/`, export its `DevUtilityCommand`
  entries, add it to `src/ui/commands/index.ts`, and declare the command in `package.json`
  (`contributes.commands`, and optionally the context menu). For the Tools tab, add a
  `ToolDefinition` to `src/services/toolRegistry.ts` with an icon id from
  `src/ui/webview/shared/icons.js`.
- **A webview message:** add it to `src/shared/messages.ts`, handle it in
  `DashboardSession.handleCommand` (or `AiCoordinator.handleCommand`), and post it from the
  webview with `post({ command: … })`.
- **An attention reason:** add it to `AttentionReason` in `attentionInboxBuilder.ts` and give it
  a label in `services/attention/reasonLabels.ts` — the webviews and AI prompts both read it there.

## Development

```bash
npm install
npm run watch     # esbuild in watch mode (extension + webview bundles)
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

Checks:

```bash
npm run compile   # type-check
npm run lint
npx tsc -p ./ && npm test   # unit tests run inside a VS Code test host
```

## Building a .vsix

```bash
npm install
npm run package
```

This produces `devmate-kit-<version>.vsix` in the project root, installable via:

- VS Code UI: Extensions view → `...` menu → **Install from VSIX...**
- or CLI: `code --install-extension devmate-kit-<version>.vsix`

## Manual smoke test before a release

1. Fresh profile → sidebar Home shows the welcome state → Sign in to GitHub → add a repository → PRs appear.
2. Connect Jira → set your display name → add a JQL query → tickets appear and merge with PRs in the inbox.
3. Disconnect and reconnect Jira; reload the window and confirm GitHub and Jira stay connected.
4. Turn on AI in Setup → pick a model → **Ask AI: What should I do?** streams a plan.
5. **Generate Standup Summary** → copy the output.
6. Snooze an item → it moves to *Snoozed* → it returns after the snooze ends.
7. Go offline → refresh → the partial-failure banner appears and nothing crashes.
8. Check the sidebar and dashboard in a light and a dark theme.

## Publishing

```bash
npx vsce login khainx-developer   # one-time, needs an Azure DevOps PAT with Marketplace (Manage) scope
npm run package
npx vsce publish
```

Bump `version` in `package.json` before publishing a new release, and add an entry to `CHANGELOG.md`.
