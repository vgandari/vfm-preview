---
name: slide-polish-decisions
description: Judgment calls made in the slide-polish feature that the user should confirm
metadata:
  type: project
---

- Sub/superscript syntax is `^{x}` / `_{x}` because `~x~` is underline and `[^1]` a footnote.
- Tint = theme color mixed 14 % into white with dark text, even in dark themes (literal "lighter version").
- 2col: only the no-text, two-or-more-images case changed; text+image stays single column (existing tests/spec said so).
- Video: `.mov` etc. via the image syntax; export inlines ≤ 50 MB and types `.mov` as video/mp4 in data URIs.
- Affiliation: cover already rendered them; added `institution`/`organization` keys and unlinked top-level lists.
- Headings now keep slide-builder classes, so section-slide titles get `.vfm-divider-title` (was silently dropped).

**Why:** each was ambiguous in the request. **How to apply:** ask before changing; see docs/slide-polish.md.

slide-colors (2026-11-15): `separator-color`, `section-color` (literal bg, light text when luminance < 0.179, WCAG equal-contrast point),
`title-image` (cover + 50 % black scrim + white text). Title slide keeps the theme tint; section-color touches only section slides.
Tables (2026-11-15, supersedes 0.8): documents 0.9; slides 0.9 shrinking by 0.05 to 0.7 to fit (`slide.tableScale`, `--vfm-table-scale`), then split by rows. Bug fixed: splitTable measured the last piece without the @end() lead-in, so the table was dropped (REQ-231).
No color option is tinted: theme-color fills title and section slides exactly; section-color overrides section slides; text light/dark by luminance 0.179.
Branch `table-fit` (both repos) off slide-colors-impl; chain not merged back (coverage not measured).
