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
