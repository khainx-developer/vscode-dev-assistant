# AI Engineering Standard — Learning Loop (LL)

**Version**: 1.0

Problem this solves: real defects (an unindexed filter, an unbounded scan, copy-pasted query
blocks, a wrong file reference in a Task Package) get found in review or by hand, then stay in
one story's folder. Nothing feeds back into the skills, instructions, or the next story's Task
Packages. This standard makes capture **automatic** (stages 07/08 write it, no extra user step)
and turns recurring findings into **proposed, human-approved edits** to skills/instructions/gates
or into enforcement (analyzer, test, checklist item).

```
stage 07/08 finding ──► docs/ai-learning/findings.md   (automatic, structured)
                              │  node ai-factory/tools/findings-report.mjs --write
                              ▼
                     docs/ai-learning/recurring.md     (≤ ~1K tokens; planners + developer read this)
                              │  recurrence trigger
                              ▼
        retro/review ──► docs/ai-learning/proposals/*.md ──► human approves ──► agent applies edit
```

## 1. Findings log (`docs/ai-learning/findings.md`)
One table row per finding, appended at stage 07 (CodeReview) and stage 08 (ArchitectureReview) —
Medium/High always, Low when it reveals a pattern. Columns:

`| ID | Date | Story | Stage | Task | Severity | Category | Root cause | Summary (≤120 chars) | Evidence | Status |`

- **ID**: `F-NNN`, next number after the last row (`findings-report.mjs --next-id`).
- **Stage**: `05`, `06`, `07`, `08`, `retro` (found outside a story stage).
- **Severity**: `High` | `Med` | `Low` (ARS rubric).
- **Evidence**: `path:line` or artifact path — verifiable, never a vague area.
- **Status**: `open` → `proposed` (a proposal file exists) → `applied` | `wontfix`.

### Category (controlled vocabulary — pick one; `other` only with a Summary saying why)
| Group | Categories |
|---|---|
| Data access | `unindexed-filter`, `text-join`, `n-plus-1`, `full-entity-load`, `in-memory-join`, `query-complexity`, `non-sargable`, `wrong-cardinality`, `unbounded-result` |
| Code shape | `duplication`, `long-method`, `list-scan-in-loop`, `multiple-enumeration`, `business-in-query`, `layering`, `reuse-missed` |
| Spec / plan | `spec-missing`, `spec-wrong-ref`, `spec-contradiction`, `spec-unconfirmed-fact` |
| Delivery | `schema-not-migrated`, `test-blind-spot`, `untestable-code`, `scope-creep` |
| Other | `other` |

### Root cause (why it happened — this decides what the fix is)
| Root cause | Meaning | Fix goes to |
|---|---|---|
| `spec-gap` | The Task Package/TDS didn't specify or specified it wrongly | ITPS/CDS/template/planner skill; that story's package |
| `skill-gap` | No skill/instruction covers it | Skill or instruction file — **proposed edit** |
| `rule-ignored` | A skill/standard already says so; the agent didn't follow it | **Enforcement**: analyzer, test, checklist item, or shorter/louder rule (more prose is not the fix) |
| `domain-fact` | A data/business fact was unknown (index, volume, cardinality) | Data-facts registry / `docs/domain-rules.md` |
| `process` | Pipeline step missing, skipped, or misordered | Gate/prompt/agent file |

## 2. Recurring patterns (`docs/ai-learning/recurring.md`, generated)
`node ai-factory/tools/findings-report.mjs --write` regenerates it from the log. A category is
**recurring** when it appears in **≥ 2 distinct stories**, or **≥ 3 rows** with severity ≥ Med, or
**any High with root cause `rule-ignored`**. Keep the file short — one line per recurring
category: count, stories, root-cause mix, latest example. Regenerate after every append.

## 3. Who reads it, when (cost: ≤ ~1K tokens)
- **Planners** (`ai-factory-technical-design`, `ai-factory-exec-plan`, `ai-factory-quick-plan`)
  read it once and copy every relevant category into each package's forbidden-shapes / Common
  Mistakes section for the code it touches.
- **Developer** reads it before stage 05 code, in the same step as any other durable-learnings check.
- **Reviewers** (07/08) read it and check the diff for each recurring category first.

## 4. Improvement proposals (retro or on demand)
When a category is recurring (or the user asks for a retro), for each recurring category draft
`docs/ai-learning/proposals/YYYY-MM-DD-<category>.md`:

```
# Proposal — <category>
- Findings: F-012, F-019 …   - Root cause mix: rule-ignored ×2, skill-gap ×1
- Why existing rules didn't prevent it: <one paragraph, evidence>
- Proposed change: <target file(s)> — exact diff or new text (small: prefer deleting/tightening over adding)
- Enforcement option: <analyzer / integration test / checklist item, if rule-ignored>
- Context cost: +N / −N tokens on the pre-code bundle (must not grow it without removing something)
- Status: draft | approved | applied | rejected
```

**Approval rule:** an agent never edits a skill, instruction, gate, or agent file on its own from a
proposal. The user approves (per proposal); only then is the edit applied, the findings set to
`applied`, and `recurring.md` regenerated. A proposal that adds text must name what it removes or
shortens — the per-stage pre-code context budgets are a constraint, not a suggestion. Measure with
`node ai-factory/tools/context-budget.mjs` (`--check` fails when a bundle exceeds its budget in
that file; to raise a budget you must justify it in the proposal).

## 5. Not a replacement for
`DecisionLog.md` (per-story material decisions) or `CodeReview.md` (the review itself). The
findings log is the cross-story, structured, machine-checkable index of *what went wrong*; those
artifacts stay as they are.
