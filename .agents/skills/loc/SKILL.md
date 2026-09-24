---
name: loc
description: Report total code lines (markdown, comments, and blanks excluded) and flag any file over the 500-line cap.
---

## Lines of code

Run `node .codex/scripts/loc.mjs` from the repository root, then read its output.

Summarise the command output: total SLOC and file count, and explicitly call out any file flagged over the 500-line cap. If nothing is flagged, confirm the codebase is within the cap.
