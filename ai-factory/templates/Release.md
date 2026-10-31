# Release — {{story_title}}

- **Story ID**: {{story-slug}}
- **Author**: Developer agent (default: Cursor Agent)
- **Input**: `08-ArchitectureReview/ArchitectureReview.md` verdict (must be Pass)
- **Date**: {{date}}

## PR
- Link: {{github create-PR url — e.g. https://github.com/<owner>/<repo>/pull/new/<branch>; human creates the PR (do not use `gh`)}}
- Branch: {{branch name}}

## Changelog Entry
{{One-line, user-facing description of the change.}}

## Deploy Notes
{{Migrations to run, feature flags to toggle, config changes, order of operations.}}

## Post-Release Checklist
- [ ] Monitoring/alerts checked after deploy
- [ ] Rollback plan (from ExecutionPlan.md for Full tier, QuickPlan.md for Quick tier) still
      valid
