# AI chat features — design notes

DevMate Kit's AI surface on attention cards is a single **Ask AI** control with in-chat
suggestion chips, plus an optional clipboard hand-off to the editor for MCP-capable work.

| # | Feature | Where it runs | Sees code? |
|---|---------|---------------|-----------|
| 1 | **Ask AI** card chatbox | Inside the dashboard | No (card snapshot only) |
| 2 | **Continue in editor chat** (clipboard hand-off) | Copilot / Cursor / any editor chat | Yes (workspace + MCP tools) |
| 3 | **What next / Standup / Explain builders** | Dashboard (What next / Standup UI; Explain reused as a chip prompt) | No |

See also [editor-chat-handoff.md](./editor-chat-handoff.md) for MCP paste guidance.

---

## Ask AI (card chat)

### Goal
One control on each attention card. Clicking **Ask AI** expands the card chat box.
Suggestion chips send (or fill) short prompts into that chat — they do **not** restore the
old Review-with-AI split button.

### Required chips (at least)
- Explain
- Summarize the changes
- Review PR (when a PR is on the card)
- Why does this need attention?

Additional chips may appear from card state (failing checks, unread comments, Plan this ticket, What's the next step?).

### Flow
1. User clicks **Ask AI** → `toggleChat` expands the panel.
2. Chip or typed question posts `{ command: 'ai.chat.send', key, text }`.
3. `AiCoordinator.chatSend` streams via `AiAssistant.chatAboutItem` / `buildChatAboutItemPrompt`.
4. Context is the card snapshot only (no URLs, no code).

### Continue in editor chat
- Button inside the chat panel posts `{ command: 'ai.reviewInChat', key, template? }`.
- Builds `buildReviewPrompt` (URLs + MCP guidance allowed on this path only).
- `ChatHandoff` **copies to the clipboard** (primary path — host chat command IDs are not relied on).

---

## Prompt / safety notes

- In-dashboard prompts never include item URLs; the editor hand-off may include them.
- Comment text is wrapped as untrusted `<comment>` data.
- For code or live GitHub/Jira lookups, the card-chat prompt tells the model to suggest
  **Continue in editor chat**.

### Implemented
- Single **Ask AI** control; Review with AI split-button and standalone Explain button removed from cards.
- Dynamic suggestion chips in the chat panel.
- `buildReviewPrompt` / `EDITOR_HANDOFF_MCP_GUIDANCE` / clipboard `ChatHandoff`.
- `chatAboutItem` + per-card threads; commands `ai.chat.send` / `ai.chat.clear`.
- Setting `devMateKit.ai.reviewPrompt` for the default review hand-off template.
