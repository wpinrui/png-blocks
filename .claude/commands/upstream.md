---
description: Send an instruction of my choice upstream to project-007, so every project it scaffolds ships it. Opens the PR, reviews, merges and rebuilds.
argument-hint: "[the instruction]"
---

Send the instruction I name upstream to project-007, the tool that scaffolded
this project, so every project it scaffolds from now on ships it. If I named
none, ask which. Running this command is the merge authorisation.

This project is not touched. Everything below happens in the project-007
checkout, under its rules. This project's MVP mode does not apply there.

## 1. Find the checkout

`project-007` is linked globally, so its checkout is the real path of the
package under the global root:

```
node -p "require('fs').realpathSync(require('path').join(require('child_process').execSync('npm root -g').toString().trim(), 'project-007'))"
```

## 2. Check it is free

project-007 takes one PR at a time. Stop and report if the checkout is off
`main`, has uncommitted changes, or has an open PR (`gh pr list`, run there).
Otherwise pull: `git pull --ff-only origin main`.

## 3. Make the change

Read the checkout's `.claude/CLAUDE.md` first. It names every copy of a rule:
put the instruction in all of them with the same wording, and follow its
conventions for the branch, commits and PR.

## 4. Review and merge

Follow the checkout's `.claude/commands/review.md` from there, as if `-rm` had
been typed in it. Point every reviewer at the checkout's absolute path. Fix and
re-review until it approves, run the checkout's pre-merge checks, then merge with
`gh pr merge --squash --delete-branch` and pull `main` again.

## 5. Rebuild

Run `yarn install --frozen-lockfile`, then `yarn build`, both in the checkout.
The next `project-007` run scaffolds with the new instruction.

## Report

The PR link, whether it merged, and whether the rebuild succeeded. If a step
stopped the run, name it and why.

$ARGUMENTS
