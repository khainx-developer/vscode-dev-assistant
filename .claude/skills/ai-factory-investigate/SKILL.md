---
name: ai-factory-investigate
description: Iron Law debugging discipline — forces Reproduce → Isolate → Hypothesize → Verify → Fix → Regression-test, in order. Hard gate — no code edits until a written, evidence-backed root-cause hypothesis exists. Use when the task is diagnosis-first ("investigate", "why does X happen", "trace this bug", "how does X break", a spike over an unknown), not when the root cause is already known.
---

# AI Factory — Investigate (Iron Law debugging)

## When to load

Load this skill when the task is **diagnosis-first**, not implementation-first:

- "Why does X happen?"
- "Investigate / trace / debug this bug"
- "I don't know the root cause yet"
- A spike: exploring an unknown before committing to a fix
- Reproducing a reported bug before writing the fix

Do **not** load this skill when the root cause is already confirmed and the task is a known
fix — that's a normal Task Package for the `developer` role instead (see
`ai-factory/prompts/implementation.md`). This skill exists upstream of stage 05: it's for finding
the root cause an ExecutionPlan/Task Package can then be written against, or for an ad hoc
diagnosis the user asks for outside the pipeline entirely.

## Navigation

Locate code with whatever code-search capability is available (Explore/Grep/Glob, or a project's
own MCP code-index tools if it has one) — read only the suspect function/method (±30 lines), then
its callers. If you can't find the relevant code after a few targeted searches, ask the user for
the missing context rather than broadening into a repo-wide scan.

---

## The Iron Law — six steps, in order

**HARD GATE: no code edits until Step 3 (Hypothesis) is written and confirmed.**

### Step 1 — Reproduce

Goal: create a **repeatable trigger** for the problem.

- Preferred: a failing test (in the project's own test framework) that fails before the fix,
  passes after.
- Fallback: exact repro steps (route/command, input values, role, data state, timing).
- If you cannot reproduce it, **stop** and ask the user for the missing context — do not guess.

Write the repro in one of:
- A new test method, marked skipped/pending so it doesn't break CI yet
- A numbered list in `investigation.md` under `## Reproduce`

---

### Step 2 — Isolate

Goal: **binary search the stack** to find which layer owns the bug.

Use a checklist shaped to this project's own architecture (adapt the rows below to what actually
exists — drop layers that don't apply):

| Layer | Check |
|-------|-------|
| **Data store** | Query it directly — is the data wrong at rest, or only after processing? |
| **Business logic / handler / service** | Exercise it in isolation with clean input — does it fail on its own? |
| **Data-access query** | Log or print the generated query — is the query wrong, or just slow? |
| **API / controller boundary** | Test at the HTTP/RPC level — does the correct input reach the handler? |
| **Background job / async worker** | Does the bug only appear async? Check job args, retry state, execution context. |
| **UI / client** | Does the correct payload reach the API, or is the client sending wrong data? |

Write isolation findings in `investigation.md` under `## Isolate`:

```
Layer confirmed: <layer, e.g. AppointmentCommandHandler>
Layer cleared:   <layers ruled out, e.g. DB (data correct), API (payload verified)>
```

---

### Step 3 — Hypothesize ← HARD GATE

Write **one specific root cause claim** before touching any code:

```
Hypothesis: <exact mechanism, e.g. "Handler X ignores field Y under condition Z, causing
field Y to be null on write">
Evidence: <file:line, query/log output, or test result — not intuition>
```

**Rules:**
- One hypothesis per investigation cycle — not a list of guesses.
- Must include `Evidence:` — a file:line anchor, logged output, or test result.
- If you have no evidence yet, go back to Step 2.
- After a handful of searches, if you still cannot write `Evidence:` with a `file:line`, ask the
  user for clarification rather than guessing or broadening the search indefinitely.

---

### Step 4 — Verify

Prove or disprove the hypothesis **without editing production code**:

- Add targeted logging or a debug assertion.
- Run the failing test against the suspected line.
- Query the data store before/after the suspected operation.

**If the hypothesis is disproved:** go back to Step 2. Update `investigation.md`. Do not skip
back to Step 3 with a new guess — re-isolate first.

Write the outcome in `investigation.md` under `## Verify`:

```
Verified: confirmed — <what you observed that confirms it>. Hypothesis stands.
```

---

### Step 5 — Fix

Only now: apply the **minimal** code change that addresses the confirmed root cause.

- Fix **only** the confirmed root cause — do not refactor surrounding code.
- Follow the project's `ai-factory/gates/coding-standard.md` for the edit.
- Run the failing test from Step 1 — it must pass after the fix.
- Run the broader test suite for the affected area.

---

### Step 6 — Regression test

Add a **permanent** test that would have caught this bug before it reached production:

- Prefer a unit test targeting the exact condition that was wrong.
- Name it to describe the bug (e.g. `HandleFollowUp_ShouldPreserveField`).
- Remove any skip/pending marker from the Step 1 repro and promote it to the permanent suite.
- If a unit test isn't possible (timing, infra), add an integration test or a data assertion.

---

## investigation.md (optional artifact)

For non-trivial bugs, save findings to `docs/investigations/{issue-name}/investigation.md` (or
under the relevant `stories/<slug>/` if this bug was found while working a story). For simple
bugs (root cause obvious after Step 2), inline the hypothesis in the PR description instead.

**Template:**

```markdown
# Investigation — {issue-name}

## Reproduce
{failing test name or numbered repro steps}

## Isolate
Layer confirmed: {layer}
Layer cleared:   {layers ruled out}

## Hypothesis
{one root cause claim}
Evidence: {file:line or log/test output}

## Verify
{outcome — confirmed / disproved}

## Fix
{one sentence: what was changed and where}
PR: {link}

## Regression test
{test name and location}
```

---

## Learning loop

If the root cause traces to a rule that already existed and wasn't followed, or to a gap in a
skill/standard, log it as a finding per `ai-factory/gates/learning-loop.md` — the same Category/
Root-cause vocabulary applies here even though this isn't a stage-07/08 review.

## Output format

At Step 3, output:

```
HYPOTHESIS WRITTEN — no code edits until this is confirmed (Step 4).
Hypothesis: {claim}
Evidence: {anchor}
Proceed to Step 4 — verify? (yes / revise hypothesis)
```

At completion:

```
Root cause: {confirmed hypothesis}
Fix applied: {file:line}
Regression test: {test name}
STATUS: FIXED | NEEDS_MORE_INVESTIGATION
```
