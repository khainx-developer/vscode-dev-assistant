# Developer Prompt — Human Context Presentation

This is an optional, user-requested documentation pass. It creates a durable
AI context package from completed AI Factory story artifacts before those
artifacts are removed: a reusable Markdown context file and a human-readable
HTML walkthrough. It is not a required SDLC stage and does not change, review,
release, or re-implement production code.

The caller must replace `{{story_path}}` with the story directory and
`{{output_name}}` with the requested kebab-case context folder name. The output
folder is `docs/ai-context/{{output_name}}/` and contains:

- `{{output_name}}.md` — reusable implementation context for future AI work;
- `{{output_name}}.html` — standalone walkthrough for human understanding.

## Purpose

Create a presentation for product, engineering, and operations team members
that explains:

- the problem and desired outcome;
- the solution concept and major responsibilities;
- the end-to-end business/data flow;
- important states, transitions, decisions, and safety boundaries;
- operational dependencies, limitations, and deliberate future work.

The result must explain the solution and ideas in plain language. It must not
be a code walkthrough.

## Allowed inputs

Read the available artifacts under `{{story_path}}`, prioritizing:

1. `01-Requirement/Requirement.md`
2. `02-Analysis/Analysis.md`
3. `03-Design/Design.md`
4. `03-Design/TechnicalDesign.md`
5. `04-ExecutionPlan/ExecutionPlan.md`
6. `04-ExecutionPlan/tasks/`
7. `05-Implementation/notes.md`
8. `06-UnitTest/results.md`
9. `07-CodeReview/CodeReview.md`
10. `08-ArchitectureReview/ArchitectureReview.md`
11. `09-Release/Release.md`
12. `DecisionLog.md`

Missing artifacts are unavailable context. Do not treat missing material as
evidence that a stage passed. If the story artifacts disagree, use the latest
explicitly approved decision or amendment and describe the resulting current
behavior, not every abandoned design.

Use the repository's current implementation only to resolve ambiguity in the
story artifacts. Do not make the generated presentation depend on source-code
files being retained.

## Output

Create the context folder when it does not exist and write exactly these two
files:

`docs/ai-context/{{output_name}}/{{output_name}}.md`

`docs/ai-context/{{output_name}}/{{output_name}}.html`

Create `docs/ai-context/` when it does not exist. If the requested context
folder or either output file already exists, update it only when the user
explicitly asked to regenerate or replace it. Do not delete or modify source
story artifacts as part of this pass.

The Markdown file must:

- be self-contained and reusable as future implementation context;
- capture the current feature contract, system shape, data model, workflows,
  invariants, security boundaries, testing guidance, configuration/deployment
  prerequisites, and known deferred work;
- distinguish current behavior from superseded designs and explicit follow-up;
- avoid links or dependencies on the temporary story folder;
- exclude secrets, credentials, connection strings, SAS values, and sensitive
  data not needed to understand the feature.

The HTML file must:

- include its own CSS and SVG/HTML diagrams;
- work when opened directly from disk, without a build step or JavaScript
  framework;
- use a clean, presentation-like visual language: responsive slide-like
  sections, a readable sans/mono type pairing, light/dark color variables,
  cards, pipeline/flow diagrams, stat blocks, and accessible SVG figures;
- use `prefers-color-scheme: dark` and `prefers-reduced-motion`;
- include an accessible `<title>`, logical headings, and meaningful SVG
  `role="img"`/`aria-label` text;
- contain no links, imports, or runtime dependencies on the story folder.

## Content rules

Prefer 6–10 concise sections, for example:

1. Title and one-sentence value proposition.
2. Why the feature exists and what it changes.
3. System or responsibility map.
4. Main process flow.
5. State/lifecycle diagram.
6. Important decisions and guardrails.
7. Failure/retry and operational behavior.
8. Current limitations, future work, and closing summary.

Use diagrams for sequence, branching, ownership, or state transitions. Use
cards for concepts and short lists for guardrails. Keep the page usable in a
team walkthrough rather than turning it into a specification dump.

Do not include:

- source file paths, class names, method names, namespaces, project names, or
  code snippets;
- ticket-folder links or references to temporary story artifacts;
- internal AI Factory stage mechanics unless they are directly relevant to
  understanding the feature;
- invented metrics, SLAs, permissions, requirements, or completed behavior;
- superseded alternatives presented as current behavior;
- secrets, connection strings, credentials, SAS values, or sensitive data.

Solution terminology is allowed when it helps a human understand the feature
(for example, domain-specific state names like "pending" and "completed").
Explain acronyms at first use.

## Accuracy checklist

Before finishing, confirm that the presentation:

- distinguishes the current solution from rejected or superseded designs;
- shows every meaningful state transition and its failure behavior;
- explains who/what owns each external dependency;
- describes tenant/security boundaries without exposing secrets;
- clearly labels deferred behavior and operational prerequisites;
- can still be understood if every file under `{{story_path}}` is deleted.

## Completion report

After writing both files, report:

- the context folder and both output paths;
- the sections/flows covered;
- any source artifacts that were missing or contradictory;
- whether the files were newly created or regenerated.
