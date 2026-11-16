---
name: branching-and-gates
description: How features are branched, gated and measured in vfm / vfm-preview (learned 2026-11-16)
metadata:
  type: feedback
---

The user wants the full chain for every feature: `<f>` → `<f>-api` → `-docs` → `-tests` → `-impl`, each branched off the one before, merged back one step at a
time (impl→tests: all tests pass; tests→docs: coverage not decreased; docs→api: every documented interface tested; api→`<f>`; `<f>`→main), fast-forward.
Do NOT commit a feature as one commit on one branch. api = interfaces and test-only helpers; docs = docs/ and README; tests = tests/, MAPPING.json,
tools/generate_mapping.py (in vfm-preview, it writes both mappings); impl = the code. LOC log: `python3 tools/loc.py vfm=<base> vfm-preview=<base> --append`
in vfm-preview, then rename the branch column.

**Why:** the user corrected a one-commit shortcut ("you should have stuck to the rules of the chain of branches"). **How to apply:** create the five branches
before writing anything; put each file on its stage; run the gates and report the numbers.

Coverage: `vfm/tools/coverage.sh` (direct-import, Node built-in) and `vfm/tools/coverage_mapped.py` (maps esbuild bundles back to sources, about 4 minutes).
After the conformance feature: mapped 85.66 % to 89.54 %; extension direct 48.74 % to 58.36 %. Importing modules directly in a test changes the
denominator of `coverage.sh` (96.27 % to 84.96 %), so compare like with like.

Sandbox quirks: a command whose text holds a dollar sign followed by a brace makes the shell checker refuse the whole command (it cannot parse it and
suspects an rm); write such files with the Write tool and keep scratch tests outside the repository. Each esbuild test bundle has its own React:
render slides through `ssr.renderSlide` (same bundle as react-dom/server), not `api.renderSlide`, when a slide uses hooks.
