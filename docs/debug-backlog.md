# Group 5 — Debug Toolkit

Goal: select a stack trace and get the likely source file, where to look, and a
checklist. Plain "analyze with AI" is already done by Copilot and Cursor chat, so
the value is the deterministic, non-AI work plus links to the radar. AI is an
optional last layer.

Surface: Tools tab → *Debug*, editor right-click, *Run Tool…*. Without runtime
data (logs, traces, releases) this gives a hypothesis, not a root cause.

## Already built

- AI providers: editor language models and Cursor Agent CLI (ask-only, no file
  access).
- Credential scan on text sent to a model.
- Editor-chat hand-off.

## Add (in priority order)

1. **Redact secrets** — mask tokens, emails, IPs, usernames, hostnames and keys in
   a selection. Must exist before anything here sends text to a model.
2. **Stack trace parser** — Node/JS/TypeScript and .NET (C#) first, then
   Python, Java, Go. .NET frames carry namespace, method and `in file:line N`;
   TypeScript traces may point at compiled JS, so check for source maps.
   Ordered frames (file, line, column, function); collapse framework frames and
   mark the first frame in your own code. Works on any selection, including text
   from a Jira or PR comment.
3. **Resolve frames to workspace files** — match by path suffix and line, open at
   the line; pick list for ambiguous matches; unresolved frames stay as text.
4. **Recent-PR regression hint** — recent merged PRs in monitored repos that
   touched those files. Shown as a hint; hidden if not connected.
5. **Stack traces in Jira tickets** — detect in descriptions and comments (needs
   the description fetch in `workflow-backlog.md` #1); copy the result back as a
   Markdown comment.
6. **JSON log pretty-printer** — format NDJSON / JSON log lines.
7. **SQL formatter** — needs a dependency; by demand.
8. **AI "Analyze"** (optional, last)
   - Input: redacted trace plus short snippets around the top one to three
     frames, with a preview of the exact text before sending.
   - Output: hypothesis, where to look, investigation steps, copyable debugging
     checklist. Every claim cites a frame.
   - Same provider rules as other AI features: no stored vendor keys, no file or
     shell access.

## Not planned

- A generic "analyze this error" chat command (duplicates Copilot).
- Automatic fixes or code edits.
- A general log viewer (VS Code output filtering and existing extensions cover it).
- Production log / trace integration (Datadog-style).
- "Environment" tools (too vague; revisit if you mean a `.env` parser or diff).

## Risks

- Traces contain usernames, hostnames, tokens and ids: redaction and the send
  preview are required.
- A model can invent a root cause; cite-the-frame output and "hypothesis" wording
  reduce this.
- Each language parser adds maintenance; keep the list short.

## Open questions

- Should the inspector also read the terminal's last error, or only a selection?
