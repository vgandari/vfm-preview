---
name: preview-bugs
description: The 2026-11-18 bug batch (17 items): what was changed, what could not be reproduced, decisions to confirm with the user
metadata:
  type: project
---

Branch chain `preview-bugs` → `-api` → `-docs` → `-tests` → `-impl` in both repos (REQ-255..258 in vfm-preview, REQ-321..333 in vfm; UC-48..57).
No browser was available (see [[sandbox-limits]]), so everything that only a browser shows (math clipping, table scroll, video size, xref jump, menu look)
is verified by stylesheet-text tests plus manual tests MT-23..MT-26, **not run**.

**Why:** the user pasted a bug list; the last item ("Bug: When exporting to PDF,") was cut off and is still unanswered.
**How to apply:** ask for the rest of that item; do not guess it.

Decisions the user may want to change:
- Cross-reference jump without script: figures/listings are capped at `100vh - 8em` (`@media screen`) with `scroll-margin-top: 1em`, instead of moving the `id`
  (tests lock `<figure id=…>`). A very tall picture is shown smaller; a long listing scrolls inside its box.
- References slide is always added when any citation resolves (no opt-out option yet).
- On `2col`, a blank line between bullets splits them into sets (loose lists become separate lists there); a comment alone no longer splits.
- `@cite` is now allowed in lead-ins and captions; still an error in `[title]`.
- Slide captions drop the period; documents keep adding one.
- Pictures: the host sends mtimes (`UpdateMessage.assets`) and the webview adds `?vfm=<mtime>`; refresh happens on render, panel visible, window focus. No watcher.

Not reproduced (renderer output was correct in 22 variants): a link in a figure caption breaking the figure. Found and fixed instead: the HTML export's image regex
`!\[[^\]]*\]` skipped images whose caption holds a link (now `src/mapImageTargets.ts`). "Occasionally a figure does not appear" was not reproduced either
(no builder-level loss in a 270-deck fuzz); one candidate fixed: a stale `vfm-hidden` class on a reused element (Slides.tsx).

The extension locks vfm at a commit; until vfm is pushed and `package-lock.json` updated, run extension tests and builds with `VFM_DIR=../vfm`
(`tests/preview-bugs.test.ts` skips its Frontmatter test against the old lock).
