---
name: review
description: Codex review of the current branch against the engineering bar. Run it when the work is basically ready to merge.
---
Follow `AGENTS.md`, including its MVP mode. If subagents are unavailable, perform the dimensions sequentially yourself using the same reviewer reference.


Review the pending changes against the project's engineering bar. You are the
orchestrator: you gather everything once, then fan the reading out across
parallel reviewers following [references/code-reviewer.md](references/code-reviewer.md) and merge what they find.

The reviewers are forbidden to re-derive the diff or run the project. That only
holds if you hand them a complete packet, so build it properly.

## Arguments

Read any arguments in the user's request before you start:

- `deep` anywhere in them turns on the mutation agent in step 3.
- A bare number is a PR to review instead of the current branch: check it out
  with `gh pr checkout <n>` and treat it as the branch from there. Refuse if the
  working tree is dirty.
- Anything else is a focus. Pass it verbatim to every reviewer as an extra
  emphasis; it narrows attention, it never narrows the bar.

## 1. Size the change

Get the shape of the diff first. Compare against `origin/main`, never a local
`main`, which may not have been pulled since the last merge and would report
every commit landed in the meantime as part of this branch:

```
git diff --stat origin/main...HEAD
git status --porcelain
```

- **Single pass** when the diff touches no source file, or changes fewer than 50
  lines in total. One reviewer, dimension `all`. A nine-line docs change does
  not need three agents.
- **Full fan-out** otherwise: three reviewers, one per dimension.

## 2. Build the packet

Write one file to `temp/`, which is gitignored, holding:

- the branch name, and `git log --oneline origin/main..HEAD`
- the diff stat from step 1
- **gate results**: the tests and the typecheck, narrowed to what the diff
  touches wherever the tooling allows it. Name what you ran, and say what you
  skipped and why.
- **mechanical audit**: `node .codex/scripts/audit.mjs`
- the full diff: `git diff origin/main...HEAD` and `git diff HEAD`, excluding
  anything generated (`dist/`, `node_modules/`, lockfiles, generated sources).
  If the diff runs past about 4000 lines, include the source diff only, note in
  the packet what you left out, and tell the reviewers to Read the files they
  need.

Run those gates yourself, here, once. They are pre-merge checks anyway, and
their being in the packet is what lets the reviewers skip running anything.
Reuse a result you already have from this session if nothing has changed since.
If a gate fails in a file the diff touched, say so and stop: fix it before
reviewing.

If you have already reviewed this branch in this session, add a **prior
findings** section listing every blocker from the last round and its status, and
a **fix diff** section covering only the commits since. That switches the
reviewers into re-review mode.

## 3. Fan out

Launch the **code-reviewer** subagents using the available subagent tools, so they run at the same time. Serial launches throw away the whole point
of splitting the work.

Give each one: the absolute path to the packet, its dimension (`correctness`,
`design`, or `tests-and-docs`), and any focus from the arguments.

On a re-review, run only the dimensions that requested changes last round. A
dimension that approved is retired and does not run again, unless the fix diff
touches what it flagged. Say in the report which dimensions you retired.

**`deep`** adds a fourth agent, dimension `mutation`, and only when asked for.
Its prompt must open with `DEEP MODE` and say:

> The ban on running the project is lifted for you alone. Budget: at most 12
> test runs, and stop when it is spent. Take the newest logic in the diff and
> the tests that claim to cover it. For each, change the source so the behaviour
> the test names is wrong, re-run that test, and record whether it fails.
> Report only the tests that still pass, naming the mutation they survived.
> Restore every file you touched and confirm `git status` is clean before you
> report. Do not report style, design or docs; the other agents have those.

Deep mode is opt-in per invocation. It is worth it for logic a bug could hide
in, and wasted on layout, docs or a small fix.

## 4. Report

Merge the verdicts:

- Collect all findings, blockers first, and drop duplicates that two dimensions
  both raised.
- The overall verdict is **CHANGES REQUESTED** if any dimension requested
  changes, otherwise **APPROVED**.
- Say which dimensions ran, and say plainly if `deep` did not.

Do not approve while a blocker stands.

## 5. Three rounds, then stop

At most three rounds, and most changes should clear in one. Never open a fourth:
after round three, fix only what is actually broken and let the rest go. List
what you dropped in one line.

Never comment on whether a change belongs on this branch or another. I decide
branch scope.

## The bar

A PR cannot be approved if any of these fail:

- **SOLID**, **DRY**, **KISS**, **YAGNI**; consistent level of abstraction within a unit.
- No dead or commented-out code; no duplication.
- No god files; no god objects/classes.
- No long parameter lists, flag arguments, feature envy, primitive obsession, or magic numbers.
- No arrowhead code (deep nesting); use guard clauses and early returns.
- Size limits: file ≤ 500 lines (hard cap); function < 50 (flag > 75); nesting depth ≤ 3; parameters ≤ 3 (else pass an object).
- No doc drift. `README.md` reflects current reality, with no stale placeholders once the project has substance.
- Tests reasonably in place: core logic and new behaviour ship with meaningful tests; no untested critical paths.
- Always blocking, never a nit: correctness bugs including display-only ones, missing tests on new logic, and near-verbatim duplication.

The auditable items above are measured by `.codex/scripts/audit.mjs` and handed
to the reviewers in the packet. They adjudicate those rows, never re-count them,
and never run the project.


