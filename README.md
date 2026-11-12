# DevMate Kit

**Your daily work radar.** DevMate Kit shows the GitHub pull requests and Jira tickets that need *your* attention — right inside VS Code — and can turn them into a prioritized plan or a standup update with the AI models your editor already has.

> What should I do next? Open the sidebar and you'll know.

## Why

Knowing what to work on usually means checking GitHub for reviews you owe, Jira for ticket status and due dates, and notifications for comments on both. Each switch costs focus, and the one review a teammate is blocked on is easy to miss.

DevMate Kit pulls those signals into one **Attention Inbox**, sorted by priority, so you can act without leaving the editor.

## Features

### Attention Inbox

Everything that needs you, highest priority first:

| Priority | What lands here |
|---|---|
| **Urgent** (red) | Failing checks, changes requested, merge conflicts, overdue tickets, PRs or tickets stale for 3+ days |
| **New activity** (blue) | Comments on your PRs or tickets you haven't opened yet |
| **Waiting on you** (orange) | Reviews requested from you, teammates' PRs waiting for review, tickets in Review or due today/tomorrow |

Jira tickets are grouped with the pull requests that reference them (ticket key in the PR **title** or **branch name**), so a ticket and its PR show up as one item. Every item has one-click **Open PR**, **Open in Jira** and **Open comment** actions, expandable details (comments, subtasks, linked PR), and **Snooze** (1 hour, later today, or tomorrow morning) for things you can't act on yet.

### Daily Tasks dashboard

The full dashboard opens on the Attention Inbox. Stat tiles — *Needs attention*, *My PRs*, *Team PRs*, *My Jira* — switch the main list, and everything else stays one click away. If GitHub or Jira can't be reached, a banner says so and the rest of the dashboard keeps working.

### Always in view

- **Status bar** — `🔔 3` shows how many items need you; click to open the dashboard.
- **Activity bar badge** on the DevMate Kit icon.
- **Notifications** when a background refresh finds something new. Several new items are batched into one message, and VS Code's Do Not Disturb mode silences them.
- **Pause monitoring** — turn off at night or when you are away. DevMate stops refreshing and connecting to GitHub/Jira; your sign-in is kept. Resume from Setup, the dashboard banner, or the Command Palette.

### AI assistant (optional)

DevMate uses the **language models already available in your editor** through the VS Code Language Model API — GitHub Copilot, Claude when Copilot or another installed provider offers it, or any other registered model. DevMate stores no API keys of its own.

- **Ask AI: What should I do next?** — a 3–7 step plan with one "start here" recommendation.
- **Generate Standup Summary** — Yesterday / Today / Blockers in Markdown, ready to copy.
- **Explain** on any inbox item — why it's flagged and the next human action.

Only titles, keys, statuses, reasons, dates and short comment excerpts are sent to the model. Access tokens, OAuth secrets, URLs and raw API payloads are never included, and comment excerpts are scanned for anything that looks like a credential.

If your editor exposes no language models (for example, some VS Code forks), AI features say so and everything else keeps working.

### Text utilities

Quick transforms from the **Tools** tab, the Command Palette, or the editor right-click menu under **DevMate Kit** (they work on every selection, or the current line):

- Base64 encode / decode, URL encode / decode
- Format JSON, escape text as a JSON string
- Insert UUID, insert current Unix timestamp, convert a Unix timestamp to an ISO date
- UPPERCASE, lowercase, camelCase, snake_case, kebab-case

## Getting started

1. Open **DevMate Kit** from the activity bar.
2. **Setup → Sign in to GitHub.** DevMate uses your VS Code GitHub account.
3. **Add repositories** (`owner/repo`) and, optionally, **teammates** by GitHub username.
4. *Optional:* **Connect Jira** — enter your site URL, approve access in the browser, type your name exactly as it appears in the Assignee field, and add a JQL query (DevMate suggests one).
5. *Optional:* turn on **AI** and pick a model.

There's also a guided walkthrough: **Help → Welcome → Get started with DevMate Kit**.

## Commands

| Command | What it does |
|---|---|
| DevMate Kit: Open Daily Tasks Dashboard | Opens the full dashboard |
| DevMate Kit: Refresh Attention Inbox | Refreshes GitHub and Jira now |
| DevMate Kit: Open Setup | Opens the setup checklist |
| DevMate Kit: Ask AI — What should I do next? | Prioritized plan from your inbox |
| DevMate Kit: Generate Standup Summary | Yesterday / Today / Blockers in a new editor |
| DevMate Kit: Select AI Model | Pick from the models this editor offers |
| DevMate Kit: Sign in to GitHub | Signs in with your VS Code GitHub account |

## Settings

| Setting | Default | Description |
|---|---|---|
| `devMateKit.github.monitoredRepos` | `[]` | Repositories to watch, as `owner/repo` |
| `devMateKit.github.monitoredAuthors` | `[]` | Teammates' GitHub usernames (Team PRs) |
| `devMateKit.jira.siteUrl` | `""` | Your Jira Cloud site, set by Setup |
| `devMateKit.jira.currentUser` | `""` | Your Jira display name, exactly as shown in Assignee |
| `devMateKit.jira.teamMembers` | `[]` | Teammates' Jira display names |
| `devMateKit.jira.savedQueries` | `[]` | JQL queries that choose which tickets to fetch |
| `devMateKit.ai.provider` | `none` | `vscodeLm` to use this editor's language models |
| `devMateKit.ai.model` | `""` | Model id; empty picks the first Copilot model |
| `devMateKit.monitoring.enabled` | `true` | Keep watching GitHub and Jira; turn off to pause all monitoring network activity |
| `devMateKit.notifications.enabled` | `true` | Notify when new items need attention |
| `devMateKit.refresh.background` | `true` | Refresh every 10 minutes even when no DevMate view is open |
| `devMateKit.statusBar.enabled` | `true` | Show the attention count in the status bar |

## Privacy

- GitHub access uses VS Code's built-in GitHub authentication; Jira access uses Atlassian's OAuth through their official MCP server. Tokens are kept in VS Code's secret storage.
- DevMate only reads data. It never comments, approves, merges or changes Jira tickets on your behalf.
- AI requests go only to the language model you select in your editor, with the curated summary described above.

## Roadmap

- **Inline quick actions** (approve, comment, merge, change Jira status) — planned once they can be offered with explicit confirmation through the existing GitHub and Atlassian integrations.
- Automatic detection of your Jira display name.

## Installing

Install **DevMate Kit** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=khainx-developer.devmate-kit).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for building from source, project layout, and publishing.
