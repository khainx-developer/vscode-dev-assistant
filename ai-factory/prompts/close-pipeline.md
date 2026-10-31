# Developer Prompt — Close the pipeline after stage 07 (skip 08-09)

Loaded by the Developer-role agent only when the user explicitly asks to stop after a Pass at
stage 07 (moved out of the agent file to keep the pre-code context small).

Stages 08 (Architecture Review) and 09 (Release) give independent verification and a release
checklist — but the user may choose to skip both once 07-CodeReview passes and commit/PR the code
themselves.

**Never skip on your own initiative** — only when the user explicitly says so (e.g. "skip the
rest", "just commit", "I'll open the PR myself") after `CodeReview.md`'s verdict is Pass. Default
is always to continue toward stage 08. Common to both tiers: do not write `ArchitectureReview.md`
or `Release.md` when skipping — their absence plus the `DecisionLog.md` entry below is the record
that the story was deliberately closed here, not left incomplete or stalled; then proceed with
whatever the user asked (commit, push, open a PR) using plain git/`gh` commands, not
`ai-factory/prompts/release.md`.

### Quick tier
No extra bar — already screened low-risk at stage 01 (no Force-Full signal applied). State
what's being given up (independent conformance check, release checklist), then log the entry
below (omit **Risk accepted** — Full tier only).

### Full tier
**Higher bar — this story tripped a Force-Full signal, which is exactly the category of change
Architecture Review exists to catch.** A plain "skip"/"yes" is **not** sufficient:
1. Read `DecisionLog.md`'s earliest entry (from `ai-factory-requirement` at stage 01) for which
   Force-Full signal(s) applied — auth/RBAC, tenancy, money, schema, new architecture, >5 files,
   ambiguous business rules, or explicit user request.
2. State the specific signal(s) back to the user and require them to reply naming/accepting that
   risk (e.g. "skip, accepting the RBAC risk"), not a bare "skip."
3. If they decline to name/accept it, do not skip — fall back to the default (continue toward
   stage 08).

### DecisionLog.md entry (either tier)
```
## {{date}} — Pipeline stopped after CodeReview (07)
- **Stage**: 07-CodeReview
- **Decision**: Skipped 08-ArchitectureReview, 09-Release — user chose to commit/PR directly
- **Risk accepted**: {{Full tier only — the Force-Full signal(s) named above, e.g. "Touches authentication, authorization, or RBAC"}}
- **Why**: {{user's stated reason, if given}}
- **Made by**: user
```

If the `architect` skill is later asked "what's next" for this story, its own routing logic
checks for the `DecisionLog.md` entry and reports the story as intentionally closed at 07, not
stalled waiting on stage 08 — see that skill's routing logic.
