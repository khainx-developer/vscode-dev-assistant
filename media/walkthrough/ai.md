# Turn on AI analysis (optional)

AI stays off until you do both steps. DevMate never picks a default model.

1. In **Setup → AI assistant**, turn on a backend (editor language models or Cursor Agent CLI).
2. **Choose a model** from the list (or run **DevMate Kit: Select AI Model**).

DevMate can use either:

- **Editor language models** via the VS Code Language Model API — for example GitHub Copilot, or Claude when your Copilot plan or another installed provider offers it.
- **Cursor Agent CLI** (`agent` / `cursor-agent` on your PATH) in ask/print-only mode — useful when this editor does not register host models. Install the CLI, run `agent login` (or set `CURSOR_API_KEY`), then choose **Cursor Agent CLI** in Setup. DevMate never asks you to paste an Anthropic API key.

- **Analyze** on any inbox card runs analysis for that card only: situation, actions, findings, draft replies, **Copy prompt** for editor chat, and **Open** links the engine resolved. Analysis text is English. Card analysis detail stays hidden until you click **Analyze**; then you can **Show analysis** / **Hide analysis**.
- Optional: turn on `devMateKit.ai.analysis.auto` (off by default) and important cards also analyze automatically after a refresh, without a click. Those results feed the Inbox **Next actions** list; they do not open the card’s analysis panel by themselves.
- **Generate Standup Summary** writes Yesterday / Today / Blockers you can paste into chat.

DevMate sends only titles, statuses, reasons, short comment excerpts and (when available) failed-check excerpts — never tokens or credentials — and stores no model API keys of its own.
