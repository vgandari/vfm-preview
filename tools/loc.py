#!/usr/bin/env python3
"""Writes LOC.md: for every commit on the current branch since `main`, the non-comment, non-blank lines added
in code files (ts, tsx, css, mjs, py). Run from vfm-preview/: python3 tools/loc.py"""
import subprocess, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPOS = {"vfm-preview": ROOT, "vfm": ROOT.parent / "vfm"}
CODE = (".ts", ".tsx", ".css", ".mjs", ".py")
COMMENT = re.compile(r"^\s*(//|/\*|\*|\*/|#|<!--)")


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout


rows = []
for name, repo in REPOS.items():
    branch = git(repo, "branch", "--show-current").strip()
    for h in reversed(git(repo, "rev-list", "main..HEAD").split()):
        subject = git(repo, "show", "-s", "--format=%s", h).strip()
        added, current = 0, None
        for line in git(repo, "show", "--format=", "-U0", h).splitlines():
            if line.startswith("+++ "):
                current = line[6:] if line.startswith("+++ b/") else None
            elif line.startswith("+") and not line.startswith("+++") and current and current.endswith(CODE):
                body = line[1:]
                if body.strip() and not COMMENT.match(body):
                    added += 1
        rows.append((name, branch, h[:7], added, subject))

total = sum(r[3] for r in rows)
out = ["# Lines of code added (non-comment, non-blank; ts, tsx, css, mjs, py)", "",
       "| Repo | Branch | Commit | LOC added | Subject |", "| --- | --- | --- | ---: | --- |"]
out += [f"| {n} | {b} | {h} | {a} | {s} |" for n, b, h, a, s in rows]
out += ["", f"Total since `main`: {total}", ""]
(ROOT / "LOC.md").write_text("\n".join(out), encoding="utf8")
print("\n".join(out))
