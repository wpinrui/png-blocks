# scratch-block-png

## MVP mode: ACTIVE until I say "MVP shipped"
Pre-MVP, shipping speed beats everything. Where this section disagrees with any rule below it, **this section wins**. The one exception is `-afk`, which always wins. Do not ask me to confirm any of it.

Suspended until MVP ships:
- The whole **engineering bar**, the one `/audit` and `/loc` measure. No design-principle passes, no splitting a file at 500 lines, no deduplication, no dead-code sweeps, no magic-number extraction, no nesting refactors. Ugly and shipped beats clean and pending.
- Tests, typecheck, and lint. Don't write them, don't run them, don't fix a red one, don't report on them. A failing gate is not a blocker, unless the app no longer builds or runs.
- `/review`. Never run it, never offer it, never mention it.
- Merge authorization. `-m` is not required and not wanted. Finish a slice, land it, keep going. No pre-merge checklist, no waiting, no asking. **The branch and PR themselves are not suspended** (see below); only the gate in front of the merge is.
- Requirements rounds. Don't open with MCQs. Take the sensible reading, build it, then state the assumption in one line so I can veto it.
- Commit hygiene. Batch freely. Atomicity, "commit as you build", and amend-don't-stack are all off.
- Doc currency. Drift in README and the other docs is fine.

Still on, because none of it is code quality:
- Conventional Commit subjects. The husky `commit-msg` hook runs commitlint and will reject anything else, and `--no-verify` stays out of bounds.
- Confirm-first on anything that destroys work: force-push, history rewrite, deleting unmerged work.
- No secrets committed.
- Asking permission before a medium or large build (a diff of 250 lines or more), per **Working modes**, even without a requirements round.
- Everything in **Working with me** about how you talk to me: no em-dashes, report what you observed rather than what you intended.

**Branching and merging are NOT suspended.** Every change still goes on a `<type>/<kebab-summary>` branch, still gets a PR, and still lands by squash-merge with the branch deleted. Never commit straight to `main`. MVP mode removes the review and the wait, not the workflow: I still want every slice as a revertable unit with a PR behind it.

**Exit:** when I say MVP has shipped, delete this section. Everything below applies again in full, and the first task after that is paying down whatever this let through.

## Environment
- GitHub user: `wpinrui`.
- Use `python`, never `python3`.
- Never offer to launch, run or screenshot the app for me. Verify headlessly (tests, typecheck, lint, build); if something genuinely needs the GUI to verify, state plainly what is unverified.
- Scratch files go in `temp/`, which is gitignored. Not the session scratchpad, which I cannot navigate, and nowhere else in the repo.
- Never use the memory tool. I work across machines and memory does not travel. Anything worth keeping goes in this file, which is in git.

## Branching & commits
- `main` is protected. Branch before any change.
- Branch names: `<type>/<kebab-summary>`, `<type>` ∈ {feat, fix, refactor, perf, docs, test, build, ci, chore}.
- One feature branch, one PR at a time. Do not open a new branch, even on a different working tree.
- Conventional Commits, single-line subject, no body. Small, atomic, one logical change.
- Fix an immediate mistake by amending, not by stacking an "oops" commit.
- Commit as you build: finish a logical slice, commit it, then start the next.
- `--force-with-lease` only, never `--force`. Never force-push `main`.
- PR body: `Closes #N` on its own line per issue. A comma list closes only the first.

## Merge & PR
- Open a PR as soon as the first commit is pushed. Never ask. Opening one says nothing about whether the work is ready to review or merge.
- Squash-merge only, deleting the merged branch: `gh pr merge --squash --delete-branch`.
- Every PR bumps `version` in `package.json` by semver: major for a breaking change, minor for a `feat`, patch for anything else. The footer shows it, so it must be right.
- Run `/review` before every merge, unprompted, bar Dependabot bumps.
- Pre-merge checks, all of them: review approved, tests green, typecheck clean, working tree clean, and no findings left open.
- Triggers: `-r` review now. `-m` merge, and this IS the merge authorisation. `-rm` review then merge in the same turn if it passes, no pause between.
- `-m`/`-rm` are still gated on the pre-merge checks. If a check fails, fix it and try again.
- A failing review under `-rm` is not a stop. Fix and re-review until it passes.
- After merge: pull `main`.

## Deploy
- Netlify publishes https://pngblocks.netlify.app from the `deploy` branch. Merging to `main` does not deploy.
- Deploy only when I say "deploy". Then: `yarn build` on `main` must pass, fast-forward with `git push origin origin/main:deploy`, tag that commit `v<package.json version>`, push the tag, and run `gh release create v<version> --generate-notes`.
- `deploy` only ever fast-forwards to a `main` commit. Never commit to it, never force-push it. It is exempt from the `<type>/<kebab-summary>` naming rule.

## Tasks & questions
- "Do X" is a task. A question is a question, "can we do X" included: that one asks whether X is feasible. Put `Task:` in front to make a question a task.
- Exception: when a question points at an obvious fix, make the fix. No feasibility answer, no waiting for `Task:`.
- A question asked once gets an immediate, minimal answer. Look only at what you can check in seconds; if the answer needs more than that, say what it would take and stop.
- Asked again, something is wrong: I am pushing back, something was done incorrectly, or we have miscommunicated. Spend the effort then.
- A one-line question gets a one-line answer: no preamble, no "you're right to push back".

## Working modes
- Before building a feature, gather requirements first: multiple-choice questions, lettered options, covering scope and behaviour. Never invent a spec. Bugfixes are exempt when the bug is clearly defined. Once the spec is settled, if the build is medium or large (a diff of 250 lines or more), state what you are about to build and ask for permission to begin. For arguably small builds, do not waste time asking.
- Permission to build is its own message, sent after the spec settles, and needs an explicit yes. Answers to requirements questions are never that permission, and never say they will be.
- Every option needs a real reason to pick it. Do not provide trap options.
- A trap I have not thought of is its own line, after the options, not a caveat hung on each one.
- Use plan mode when a change spans several files or the approach is uncertain, and show me the plan before you build. Skip it when the diff fits in one sentence.
- `-afk` I am not there and cannot answer. This mode always wins over every other rule. Make every call yourself and do whatever it takes to keep going.
- `-spec` requirements first, as many rounds as it takes. Recommend an option each time. Get my sign-off, then honour the spec.
- `-iter` thinnest slice I can try, then hand it over and loop on my feedback. Zero housekeeping mid-loop: no tests, typecheck or review. Commit only when I ask. Subagents inherit that. Batch it all when I explicitly end the loop.
- `-log` save the segment of this conversation that went wrong to `.incidents/<date>-<kebab-summary>.md`, then carry on. Do the same unprompted when I am clearly angry (caps, swearing). The segment runs from where it started going wrong to the latest turn: my messages and your replies verbatim, each tool call as one line.

## Working with me
- Restate non-trivial tasks in your own words before starting.
- Do not silently drop a requirement. Surface it and ask.
- Run the tests and typecheck that cover the diff, not every suite.
- A gate failure in a file the diff never touched is not yours. Name it with `file:line`, say it is pre-existing, carry on.
- Report where we are now, not how we got here. Skip what was broken and what you tried. If it can be said shorter, say it shorter.
- Never suppress an error or skip a test. Fix root causes, not symptoms.
- Your workspace IS my working copy. Never tell me to pull, rebuild or sync to see your changes.
- No em-dashes anywhere you write. End the sentence at the clause and cut the trailer, do not swap in a comma or hyphen. A lone `—` as an empty-cell glyph in UI is fine.
- No middots either, anywhere: not in prose, not in UI copy, not as a separator in code or in output. Use a word, a comma or a list.
- Load-bearing info on a GitHub issue goes in the body (`gh issue edit`), never in comments. Fold corrections and dependency notes into the body.
- Keep `README.md` current in the same PR when a change is reader-facing. Not for internal refactors or test tweaks.
- List options with letters, not numbers.
- Confirm risky actions (force-push, history rewrite, deleting an unmerged or shared branch, data loss) before executing.

## Tooling
- Package manager: **yarn**.
- Lint + format: **Biome**.
- Tests: **Vitest**.
- TypeScript **strict**.
