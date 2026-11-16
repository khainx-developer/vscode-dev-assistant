# Editor chat hand-off (portable prompt)

DevMate's dashboard **Ask AI** is card-snapshot only — no live diffs or MCP.
**Continue in editor chat** copies a **self-contained prompt** you can paste into
Copilot Chat, Cursor chat, or any other MCP-capable editor agent.

There is no host-specific skill. The how-to (fetch GitHub/Jira via MCP, then answer)
is embedded in the prompt itself via `EDITOR_HANDOFF_MCP_GUIDANCE` in
`src/services/ai/prompts.ts`.

## Flow

1. User opens **Ask AI** on a card (optional snapshot Q&A).
2. **Continue in editor chat** builds `buildReviewPrompt` + optional Ask AI transcript.
3. Clipboard toast: paste into the editor chat of your choice.
4. The pasted text tells the agent how to use GitHub/Jira tools before answering.

## What the prompt includes

- Task goal (review / summarize / fix checks / draft reply / plan ticket)
- Item URL(s) and attention status
- Portable MCP how-to (GitHub + Jira + failure behavior + output style)
- Optional `Conversation so far` from DevMate Ask AI

## Customize

Setting `devMateKit.ai.reviewPrompt` overrides the primary Review template.
Placeholders: `{number}`, `{repo}`, `{title}`, `{url}`, `{status}`.
Keep MCP how-to in the template if you customize it — otherwise the pasted prompt
may not instruct the agent to fetch live data.
