---
name: conformance-suite
description: How vfm's Markdown conformance tests work and what they found (2026-11-16)
metadata:
  type: project
---

`vfm/tests/conformance.test.ts` renders 830 published cases (CommonMark 0.31.2, GFM spec, cmark-gfm extensions, markdown-it fixtures; `vfm/tests/fixtures/`)
and compares normalized HTML (`tests/helpers/normalizeHtml.ts`). 105 need raw HTML and are skipped on purpose (vfm shows HTML as text).
689 of 725 agree (95.0 %); the rest are in `known-divergences.json` with kind by-design / upstream / other-suite / defect. A new difference or a
fixed-but-still-listed one fails the run. Defects found (todo tests, REQ-309/314/315): `====` renders an empty `<mark>`; a paragraph with text
and an image keeps only the figure (text dropped); a hard break in alt text is lost; text inside `==…==` is not parsed as inline Markdown.

**Why:** user asked for tests of all flavor features copied from CommonMark/GFM suites. **How to apply:** when adding syntax, run `npm test` in `vfm`;
refresh fixtures with `python3 tools/build_spec_fixtures.py <dir of downloaded suites>`. `vfm/node_modules/esbuild` is a symlink into
`../vfm-preview/node_modules/esbuild` (esbuild is used by tests but not declared in vfm's package.json: ask the user before declaring it).
`handlers.ts` `codeHandler` prints a `[codeHandler] data:` debug line per code block; tests mute it.
Tutorial: `vfm/docs/tutorial/TUTORIAL.md`, checked by `tests/tutorial.test.ts`.
