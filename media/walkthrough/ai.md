# Ask AI what to do next (optional)

DevMate can use either:

- **Editor language models** via the VS Code Language Model API — for example GitHub Copilot, or Claude when your Copilot plan or another installed provider offers it.
- **Cursor Agent CLI** (`agent` / `cursor-agent` on your PATH) in ask/print-only mode — useful when this editor does not register host models. Install the CLI, run `agent login` (or set `CURSOR_API_KEY`), then choose **Cursor Agent CLI** in Setup. DevMate never asks you to paste an Anthropic API key.

- **Ask AI: What should I do next?** turns your inbox into a short, prioritized plan.
- **Generate Standup Summary** writes Yesterday / Today / Blockers you can paste into chat.
- **Explain** on any inbox item says why it's flagged and what to do.

DevMate sends only titles, statuses, reasons and short comment excerpts — never tokens or credentials — and stores no model API keys of its own.
