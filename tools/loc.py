#!/usr/bin/env python3
"""Writes LOC.md: for every commit on the current branch since `main`, the non-comment, non-blank lines added
in code files (ts, tsx, css, mjs, py). Run from vfm-preview/: python3 tools/loc.py"""
import subprocess, re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPOS = {"vfm-preview": ROOT, "vfm": ROOT.parent / "vfm"}
CODE = (".ts", ".tsx", ".css", ".mjs", ".py")
COMMENT = re.compile(r"^\s*(//|/\*|\*|\*/|#|<!--)")


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout


# Optional: `python3 tools/loc.py vfm=<base> vfm-preview=<base> [--append]` counts the commits after each base (for a
# feature that is already merged into main) and, with --append, adds the rows to the existing LOC.md.
bases = dict(a.split("=", 1) for a in sys.argv[1:] if "=" in a)
append = "--append" in sys.argv
rows = []
for name, repo in REPOS.items():
    branch = git(repo, "branch", "--show-current").strip()
    for h in reversed(git(repo, "rev-list", f"{bases[name]}..HEAD" if name in bases else "main..HEAD").split()):
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

if append:
    old = (ROOT / "LOC.md").read_text(encoding="utf8").rstrip().split("\n")
    body = [l for l in old if l.startswith("| ") and not l.startswith(("| Repo", "| ---"))]
    new = [f"| {n} | {b} | {h} | {a} | {s} |" for n, b, h, a, s in rows]
    rows_all = len(body) + len(new)
    total_old = sum(int(l.split("|")[4]) for l in body)
    out = old[:4] + body + new + ["", f"Total: {total_old + sum(r[3] for r in rows)}", ""]
    (ROOT / "LOC.md").write_text("\n".join(out), encoding="utf8")
    print("\n".join(new)); sys.exit(0)
total = sum(r[3] for r in rows)
out = ["# Lines of code added (non-comment, non-blank; ts, tsx, css, mjs, py)", "",
       "| Repo | Branch | Commit | LOC added | Subject |", "| --- | --- | --- | ---: | --- |"]
out += [f"| {n} | {b} | {h} | {a} | {s} |" for n, b, h, a, s in rows]
out += ["", f"Total since `main`: {total}", ""]
(ROOT / "LOC.md").write_text("\n".join(out), encoding="utf8")
print("\n".join(out))
