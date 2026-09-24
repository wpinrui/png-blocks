---
description: Measure the auditable half of the engineering bar over the branch's changes.
argument-hint: "[--all]"
allowed-tools: Bash(node:*)
---

## Mechanical audit

!`node .claude/scripts/audit.mjs $ARGUMENTS`

Summarise the report above: what breached a cap, what is uncalled, and what
looks left behind. Say explicitly if nothing did.

Judge, do not just relay. A long table of literal data is not the same defect as
a long function doing five things, and a helper reached only by tests may be a
fair public seam. Name the rows that are real and the rows you are dismissing,
with the reason.

The report covers sizes, nesting, parameter counts, uncalled symbols, repeated
literals and leftover code. Correctness, design and doc drift are not in it;
`/review` covers those.
