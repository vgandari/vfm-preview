---
name: project-layout
description: Directory layout of vfm / vfm-preview and how the extension finds the library
metadata:
  type: project
---

`/Users/cc/projects/vfm-preview/` is the working directory. `vfm-preview/` (inner) is the VS Code extension,
`vfm/` (sibling) is the renderer library; both are separate git repos with branch chain
main → slide-polish → -api → -docs → -tests → -impl. The extension imports the library through the `@vfm` alias
(tsconfig paths + esbuild alias, `VFM_DIR` overrides). The library's default branch was `master`, renamed locally to `main`
(config write was blocked by the sandbox; the remote still has `master`). `/Users/cc/projects/vfm` is an older stray copy.

**Why:** the old relative imports assumed vfm inside the extension folder. **How to apply:** new
`vfm-preview-<feature>` copies sit beside `vfm-preview` so `../vfm` still resolves. `vfm/node_modules` is a symlink to the
extension's `node_modules` (untracked) so the library's tests run.

Docs split (2026-11-15): renderer use cases/requirements/MAPPING.json live in `vfm/docs` and `vfm/MAPPING.json`; the extension keeps its own.
One shared ID space; `python3 tools/generate_mapping.py` (run in vfm-preview) writes both mappings, `tools/check_mapping.py` is copied in `vfm/tools`.
New vfm-only requirements REQ-041..045 were split out of REQ-018/030/031/033/024. 2026-11-16: REQ-018 merged into REQ-033, REQ-163 into REQ-024, REQ-244 and the layout measurer (`slides/fit.ts`, `createDomMeasurer`) moved to vfm; UC-01/02 are preview-only (vfm has UC-28/29); same ID in both repos need not mean the same item.
