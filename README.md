# DevMate Kit

A VS Code extension bundling handy developer utilities: a daily-tasks dashboard that tracks your GitHub pull requests and Jira issues, plus a set of quick text-transform commands.

## Why

A typical day pulls you across a half-dozen browser tabs just to know what to work on next: GitHub for PRs waiting on your review, Jira for ticket status and due dates, email for notifications about both, maybe Slack on top of that. Switching out of the editor to check each one breaks focus, and it's easy to miss a review request or an overdue ticket buried in a tab you haven't looked at in hours.

DevMate Kit pulls GitHub pull requests and Jira issues into a single dashboard inside VS Code, so you can see what needs your attention without leaving the editor.

## Features

### Daily Tasks Dashboard

A sidebar view (DevMate Kit activity bar icon) that surfaces:

- Your open GitHub pull requests, and PRs from teammates you monitor (`devMateKit.github.monitoredRepos`, `devMateKit.github.monitoredAuthors`)
- Your Jira issues and saved JQL queries (`devMateKit.jira.*` settings)

Sign in to GitHub via **DevMate Kit: Sign in to GitHub**, then open it via **DevMate Kit: Open Daily Tasks Dashboard**.

### Text utilities

All commands work on the current selection(s) (or the current line if nothing is selected), available via the Command Palette (`Ctrl+Shift+P`) and the editor right-click menu under **DevMate Kit**:

- Base64 Encode / Decode
- URL Encode / Decode
- Format JSON / Escape as JSON string
- Insert UUID
- Insert current Unix timestamp / Convert Unix timestamp to ISO date
- Case transforms: UPPERCASE, lowercase, camelCase, snake_case, kebab-case

## Installing

Install **DevMate Kit** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=khainx-developer.devmate-kit).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for building from source, project layout, and publishing.
