---
name: ai-factory-new-story
description: Scaffold a new AI Factory story folder (all 9 stage subfolders + DecisionLog.md) from the _TEMPLATE. Use when the user wants to start a new feature/story in the AI Factory pipeline.
---

# AI Factory — New Story

Scaffolds `stories/<slug>/` from `stories/_TEMPLATE/` so the pipeline has
a place to write each stage's artifact.

## Inputs
- A short story title or description from the user (e.g. "Patient check-in kiosk flow").

## Steps
1. Derive a kebab-case slug from the title (e.g. `patient-checkin-kiosk`). If a folder with that
   slug already exists under `stories/`, ask the user whether to reuse it or pick a
   different slug — never silently overwrite an existing story.
2. Copy `stories/_TEMPLATE/` to `stories/<slug>/`, preserving all 10 stage
   subfolders (`01-Requirement` … `09-Release`) and `DecisionLog.md`.
3. Replace `{{story_title}}` in the copied `DecisionLog.md` with the actual title.
4. Report the new path back to the user and tell them the next step is running the
   `ai-factory-requirement` skill with the raw user story text and this story path.

## Constraints
- Do not write into any other story's folder.
- Do not pre-fill Requirement.md, `.tier`, or any other stage artifact here — this skill only
  scaffolds empty folders; content generation, including the Quick/Full tier decision (see
  `ai-factory/gates/complexity-tiers.md`), belongs to the stage-specific skills.
