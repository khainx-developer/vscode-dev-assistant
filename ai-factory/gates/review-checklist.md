# Review Checklists

## Code Review
Owner: Developer (default: Cursor), stage 07. Applies to the diff only. Also governed by the
standing behavioral contract in `ai-factory/gates/cis-standard.md` — this checklist covers code
quality; CIS covers scope discipline (see its Anti-Patterns and Forbidden Activities).
- [ ] Matches `ai-factory/gates/coding-standard.md` (naming, layering, API/UI/logging/test
      conventions) and existing code conventions/folder structure where the codebase has already
      diverged from that document with a logged reason
- [ ] No dead code, unused imports, or leftover debug statements
- [ ] Error handling matches project patterns (no silent catches, no unhandled promise rejections)
- [ ] Input validation at every boundary the diff introduces or touches
- [ ] No hardcoded secrets, credentials, or environment-specific values
- [ ] No obvious injection risk (SQL, command, XSS) in new code paths
- [ ] Unit tests exist for new/changed behavior and actually assert something meaningful
- [ ] Every Med/High finding is logged in `docs/ai-learning/findings.md` with Category + Root cause
      (`learning-loop.md`); recurring categories from `docs/ai-learning/recurring.md` were checked first
- [ ] **Stack checklists** pass for every plugin that applies — `ai-factory/checklists/README.md#procedure`
- [ ] Every changed query/fetch matches its Task Package §9.2 spec (the spec is the contract; the
      plugin Rules are the baseline)
- [ ] **Reuse & smells:** no duplicate of a Reuse Map entry or existing helper/hook/component;
      functions within the §9.1 size/branch budget (components within the render budget); no smell
      such as long method, god handler/component, primitive obsession, feature envy, message
      chains, speculative generality, or dead code
- [ ] Developer's preflight, self-review, and `<id> checklist` evidence is in `05-Implementation/notes.md`
      for each code task and consistent with the diff
- [ ] No new dependency added without justification in DecisionLog.md
- [ ] Every changed hunk traces back to a task objective — a Task Package for Full-tier stories,
      or an item in QuickPlan.md's Tasks list for Quick tier (CIS Anti-Patterns check — no
      unrequested refactor, rename, optimization, or "while I was here" fix)

## Architecture Review
Owner: Architect/Analyst (default: Claude), stage 08. Superseded by the full standard at
`ai-factory/gates/ars-standard.md` — Traceability Matrix, four independent conformance checks
(Architectural/Technical/Plan/Behavioral), a Severity Rubric, an AI Quality Gate, and a
mechanical Pass/Needs Revision rule. Use that document, not this section.
