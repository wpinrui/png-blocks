---
name: dependabot
description: Process and merge every open Dependabot PR. Use when the user says "dependabot" or asks to clear the dependency bumps.
---

# Dependabot

Me saying "dependabot" means: process and merge all open Dependabot PRs, majors
included. Do not ask which ones.

## How

1. List them: `gh pr list --author "app/dependabot" --json number,title,mergeable`
2. For each, confirm it is a **pure version bump**. A manifest and a lockfile
   changing together is a pure bump. Anything touching source is not, and that
   one stops and gets reported to me rather than merged.
3. CI green is the gate. `/review` does not apply: there are no source changes
   for a reviewer to read.
4. Merge sequentially with `gh pr merge <n> --squash --delete-branch`. One at a
   time, not in parallel.
5. The rest will usually conflict on the lockfile once the first lands. Ask
   Dependabot to rebase by commenting `@dependabot rebase` on each, then wait
   for fresh CI before the next.

## Report

One line per PR: number, what bumped, from what to what, and merged or held.
Name anything you held and why. Nothing else.
