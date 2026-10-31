# Sources of Truth

Every rule or procedure is **written in exactly one file**. Every other file — stage prompts, skills,
templates, other standards — says *what step to do* and links to the owner; it never restates the
rule. If you find the same instruction in two places, delete the copy and link to the owner. If a
rule needs to change, change it in the owner only.

| Concern | Owner (the only place it is written) | Everyone else |
|---|---|---|
| Which checklists apply, how they are selected, run, and recorded | `ai-factory/checklists/README.md#procedure` | link to it |
| Which checklists this project uses (active/off, file globs) | `ai-factory/checklists/registry.md` | read it |
| What to check / forbidden shapes for one stack (`DN-n`, `RX-n`, …) | that plugin file in `ai-factory/checklists/` | cite rule IDs |
| What a task's code spec must contain, when it is required, how detailed, readiness gate, preflight, self-review evidence | `ai-factory/gates/code-spec-standard.md` | link to it; templates hold only fill-in headings |
| Stack-neutral code-review checks | `ai-factory/gates/review-checklist.md` | link to it |
| Project naming / structure / layering / API conventions | the project's `ai-factory/gates/coding-standard.md` (preset: `templates/CodingStandard.dotnet-nextjs.md`) | link to it; it points to plugins for rules, never restates them |
| Developer behavior and scope discipline | `ai-factory/gates/cis-standard.md` | link to it |
| Task Package shape and quality gate | `ai-factory/gates/itps-standard.md` | link to it |
| Stage hand-off / approval | `ai-factory/gates/approval-gates.md` | link to it |

## How stages use them
Each stage lists the *step* and the owner link, nothing more — e.g. "select checklists —
`checklists/README.md#procedure`", "preflight — `code-spec-standard.md#developer-preflight`".
A stage needing a rule it can't find in its owner is a gap in the owner: fix the owner.
