# Ask AI what to do next (optional)

DevMate can use either:

- **Editor language models** via the VS Code Language Model API — for example GitHub Copilot, or Claude when your Copilot plan or another installed provider offers it.
- **Cursor Agent CLI** (`agent` / `cursor-agent` on your PATH) in ask/print-only mode — useful when this editor does not register host models. Install the CLI, run `agent login` (or set `CURSOR_API_KEY`), then choose **Cursor Agent CLI** in Setup. DevMate never asks you to paste an Anthropic API key.

- **Ask AI: What should I do next?** turns your inbox into a short, prioritized plan.
- **Generate Standup Summary** writes Yesterday / Today / Blockers you can paste into chat.
- **Analyze** on any inbox card reads the evidence for that item and lists concrete actions — findings, draft replies, **Copy prompt** for editor chat, and **Open** links the engine resolved. Analysis text is English.
- **Ask AI** on any inbox card opens a chat for fast triage (why flagged, whose turn, next step). Answers use card data only.
- **Deep work** chips (Review PR, Summarize changes, Plan ticket, …) copy a portable prompt for paste into Copilot, Cursor, or other editor chat — including how to use GitHub/Jira MCP for diffs and live ticket data.

DevMate sends only titles, statuses, reasons, short comment excerpts and (when available) failed-check excerpts — never tokens or credentials — and stores no model API keys of its own.
