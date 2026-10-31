---
id: {{short-id}}
name: {{Human name}} coding checklist & rules
version: 0.1
applies-to: ["{{**/*.ext}}"]
stages: [05-implementation, 07-code-review]
spec-profile: {{B|F|none}}
---

# {{Name}} Checklist

A **checklist plugin** (see `ai-factory/checklists/README.md`). Add a row for it to the registry
there once this is filled in. Loaded only when the diff/task touches files matching `applies-to`.

## Review Checklist
Mark an item N/A only with a reason. Items marked 🔍 need measurement/evidence — don't fail them on
a hunch; all others are defects on sight. Rule IDs in brackets are defined in **Rules** below.

**Short on time — check these first:** {{top 5-8 items with rule IDs}}

### {{Group, e.g. Correctness}}
- [ ] {{what to verify}} [{{PFX}}-1]

### Tests
- [ ] {{test expectations specific to this stack}}

## Rules (forbidden shapes)
⭐ = most common/severe; 🔍 = needs measurement. IDs are stable — never reuse or renumber.

{{PFX}}-1. ⭐ **{{Short name}}.** {{The forbidden shape, concretely, and what to do instead.}}
