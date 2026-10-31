# Checklist Plugins

Stack- or concern-specific checklists live here, **one file per checklist**, so each is loaded only
when it applies and can be added, versioned, or retired without touching the core gates. This README
is the **single owner of the procedure** for selecting, running, and recording checklists; every
stage and template just points here (`ai-factory/checklists/README.md#procedure`) instead of
restating it. The project's registry of plugins is `registry.md`. What each plugin checks is in the
plugin file itself — the plugin is the only place its rules are written.

## Plugin contract
Each plugin file has YAML front matter, a **Review Checklist**, and **Rules**:
```
---
id: <short-id>            # matches its registry row
name: <human name>
version: <semver>
applies-to: ["<glob>", ...]
stages: [05-implementation, 07-code-review]
spec-profile: <B|F|none>  # which §9.2 profile of code-spec-standard.md it pairs with
---
```
- **Review Checklist** — grouped checkbox items (what to verify), each citing rule IDs.
- **Rules** — numbered forbidden shapes with rationale and a stable ID (`<PREFIX>-<n>`). IDs are
  never reused or renumbered; retire a rule by marking it `(retired)`. ⭐ = most common/severe,
  🔍 = needs measurement (not a blocker on a hunch); anything else is a defect on sight.
- Stack-specific and concrete. Stack-neutral checks belong in `gates/review-checklist.md`;
  task-spec shape belongs in `gates/code-spec-standard.md`; naming/structure conventions belong in
  the project's `gates/coding-standard.md`. Precedence if sources disagree: real codebase
  conventions (logged divergence) > plugin > generic `review-checklist.md`.

## Procedure
1. **Select** (anyone, same rule). List the files the work touches — the diff (stage 07) or the
   task's Files To Create / Modify (planning, stage 05). Every **active** `registry.md` row whose
   globs match any of them applies; a story can match several, and a plugin matching nothing is
   skipped entirely. Nothing matches → say so, don't invent one.
2. **Plan** (Planner, stages 03-04). Record the selected ids in the task's **Checklists** field
   (Task Package §1 / QuickPlan) and write the task so it already satisfies those plugins' Rules.
   Downstream stages use that field and skip step 1 unless it's missing.
3. **Implement** (Developer, stage 05). Treat the selected plugins' Rules as forbidden shapes while
   coding; before marking the task Completed, run each Review Checklist over your own code, fix
   failures, and record `<id> checklist: pass` (or the N/A items with reasons) in
   `05-Implementation/notes.md` under the Task ID.
4. **Review** (stage 07). Run each selected Review Checklist over the diff, compare with the
   Developer's `notes.md` entry (missing or inaccurate = a finding), and record one result block
   per plugin in `CodeReview.md`. Cite failures by rule ID (`DN-26`, `RX-12`); ⭐ failures are High.
