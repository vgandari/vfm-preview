#!/usr/bin/env python3
"""Builds MAPPING.json and adds `// Verifies REQ-… (UC-…)` comments to test cases that lack one.

Test cases written for a requirement carry the comment already (the source of truth for the mapping).
Older test cases are mapped here by file and title; one that matches no rule stops the script, so a new
test cannot go unmapped. Writes MAPPING.json in both repositories. Run from vfm-preview/: python3 tools/generate_mapping.py
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUITES = {
    "vfm": ROOT.parent / "vfm",
    "vfm-preview": ROOT,
}
TEST_FILES = [
    ("vfm", "tests/slide-polish.test.ts"),
    ("vfm", "tests/slide-colors.test.ts"),
    ("vfm", "tests/table-fit.test.ts"),
    ("vfm-preview", "tests/extension-polish.test.ts"),
    ("vfm", "tests/fit.test.ts"),
    ("vfm", "test/slides.test.ts"),
    ("vfm", "test/citations.test.ts"),
    ("vfm", "test/bibtex.test.ts"),
    ("vfm", "test/bibliography.test.ts"),
    ("vfm", "test/bibliography-client.test.ts"),
    ("vfm", "test/music-audio.test.ts"),
    ("vfm", "test/no-network.test.ts"),
]

# (title regex, requirements, use cases); first match wins.
LEGACY = {
    "test/bibliography-client.test.ts": [(r".", ["REQ-037"], ["UC-04"])],
    "test/bibliography.test.ts": [
        (r"validateBibEntry|fetchBibEntry|resolveBibliography|createFetchResolver", ["REQ-036"], ["UC-04"]),
        (r".", ["REQ-035"], ["UC-04"]),
    ],
    "test/bibtex.test.ts": [(r".", ["REQ-034"], ["UC-04"])],
    "test/citations.test.ts": [
        (r"unknown key", ["REQ-016", "REQ-041"], ["UC-04", "UC-11"]),
        (r".", ["REQ-016"], ["UC-04"]),
    ],
    "test/music-audio.test.ts": [(r".", ["REQ-038"], ["UC-06"])],
    "test/no-network.test.ts": [(r".", ["REQ-042"], ["UC-10"])],
    "test/slides.test.ts": [
        (r"directive syntax errors|inside code fences", ["REQ-033", "REQ-044"], ["UC-11", "UC-03"]),
        (r"reference into a nodoc", ["REQ-004", "REQ-033", "REQ-044"], ["UC-03", "UC-11"]),
        (r"document mode: wrappers", ["REQ-004"], ["UC-03"]),
        (r"@include|diagnostics from included", ["REQ-007", "REQ-033", "REQ-044"], ["UC-03", "UC-11"]),
        (r"footnote", ["REQ-039"], ["UC-03"]),
        (r"cross-reference unit|reference to a label in no|heading survives", ["REQ-020"], ["UC-05"]),
        (r"only referenced items|numberCaptions", ["REQ-019", "REQ-020"], ["UC-05"]),
        (r"layouts:|revert to one column", ["REQ-006"], ["UC-03"]),
        (r"steplists|step options", ["REQ-013"], ["UC-28"]),
        (r"table taller", ["REQ-012", "REQ-011"], ["UC-03"]),
        (r"code listing or theorem|at most one|floats take|second float|tables are floats|no header row|single sentence taller|continuation repeats|splitting is greedy|reduced paragraph stays|list continuation", ["REQ-011"], ["UC-03"]),
        (r"YAML header makes a title slide", ["REQ-009", "REQ-111"], ["UC-28", "UC-14"]),
        (r"slide number", ["REQ-010"], ["UC-28"]),
        (r"\bnotes?\b", ["REQ-030", "REQ-045"], ["UC-09"]),
        (r"algorithm, music and mermaid|old @@@|preprocessing keeps line", ["REQ-021"], ["UC-06"]),
        (r"document separator", ["REQ-008"], ["UC-03"]),
        (r"sentences end", ["REQ-015"], ["UC-12"]),
        (r"reducer|language defaults|paragraph ending in a colon|bold value", ["REQ-014"], ["UC-12"]),
        (r"block elements carry data-line", ["REQ-024", "REQ-043"], ["UC-07"]),
        (r"HTML comments never|raw HTML", ["REQ-022"], ["UC-03"]),
        (r"underline|~text~", ["REQ-040"], ["UC-29"]),
        (r"slide mode keeps only|blank-title|title is shared|several sections|\[title\] on the block|shared by several|adjacent dividers|title-only|same-level headings|only a run", ["REQ-005"], ["UC-03"]),
    ],
}

# Requirements that need a person (VS Code UI, a browser, a file on disk). Procedures: docs/MANUAL_TESTS.md.
MANUAL = {
    "MT-01": (["REQ-001"], ["UC-01"]),
    "MT-02": (["REQ-002"], ["UC-02"]),
    "MT-03": (["REQ-003"], ["UC-02"]),
    "MT-04": (["REQ-017", "REQ-033"], ["UC-04", "UC-11"]),
    "MT-05": (["REQ-023"], ["UC-07"]),
    "MT-06": (["REQ-024"], ["UC-07", "UC-19"]),
    "MT-07": (["REQ-025"], ["UC-07"]),
    "MT-08": (["REQ-026", "REQ-106", "REQ-147"], ["UC-08", "UC-13", "UC-17"]),
    "MT-09": (["REQ-027"], ["UC-08"]),
    "MT-10": (["REQ-028"], ["UC-08"]),
    "MT-11": (["REQ-029"], ["UC-08"]),
    "MT-12": (["REQ-031", "REQ-032", "REQ-145"], ["UC-10", "UC-17"]),
    "MT-13": (["REQ-033"], ["UC-11"]),
    "MT-14": (["REQ-143", "REQ-144"], ["UC-17"]),
    "MT-15": (["REQ-171", "REQ-146"], ["UC-20", "UC-17"]),
    "MT-16": (["REQ-101", "REQ-102", "REQ-107"], ["UC-13"]),
    "MT-20": (["REQ-244", "REQ-241", "REQ-243"], ["UC-26"]),
    "MT-17": (["REQ-151", "REQ-152", "REQ-232"], ["UC-18", "UC-25"]),
    "MT-18": (["REQ-221", "REQ-222", "REQ-211", "REQ-213"], ["UC-24"]),
}

USE_CASES = {  # use case → requirements it needs; each repository keeps the ones it owns (see below)
    "UC-01": ["REQ-001"],
    "UC-02": ["REQ-002", "REQ-003"],
    "UC-03": ["REQ-004", "REQ-005", "REQ-006", "REQ-007", "REQ-008", "REQ-011", "REQ-012", "REQ-022", "REQ-039"],
    "UC-04": ["REQ-016", "REQ-017", "REQ-033", "REQ-034", "REQ-035", "REQ-036", "REQ-037", "REQ-041"],
    "UC-05": ["REQ-019", "REQ-020"],
    "UC-06": ["REQ-021", "REQ-038"],
    "UC-07": ["REQ-023", "REQ-024", "REQ-025", "REQ-043"],
    "UC-28": ["REQ-009", "REQ-010", "REQ-013"],
    "UC-29": ["REQ-040"],
    "UC-08": ["REQ-026", "REQ-027", "REQ-028", "REQ-029"],
    "UC-09": ["REQ-030", "REQ-045"],
    "UC-10": ["REQ-031", "REQ-032", "REQ-042"],
    "UC-11": ["REQ-033", "REQ-041", "REQ-044"],
    "UC-12": ["REQ-014", "REQ-015"],
    "UC-13": ["REQ-101", "REQ-102", "REQ-103", "REQ-104", "REQ-105", "REQ-106", "REQ-107"],
    "UC-14": ["REQ-111", "REQ-112", "REQ-113", "REQ-114"],
    "UC-15": ["REQ-121", "REQ-122", "REQ-123"],
    "UC-16": ["REQ-131", "REQ-132", "REQ-133", "REQ-134", "REQ-135", "REQ-136"],
    "UC-17": ["REQ-141", "REQ-142", "REQ-143", "REQ-144", "REQ-145", "REQ-146", "REQ-147", "REQ-148"],
    "UC-18": ["REQ-151", "REQ-152"],
    "UC-19": ["REQ-024", "REQ-161", "REQ-162"],
    "UC-20": ["REQ-171", "REQ-172", "REQ-173", "REQ-174"],
    "UC-21": ["REQ-181"],
    "UC-22": ["REQ-201", "REQ-202", "REQ-207", "REQ-208"],
    "UC-23": ["REQ-203", "REQ-204", "REQ-205", "REQ-206", "REQ-207", "REQ-208"],
    "UC-26": ["REQ-241", "REQ-242", "REQ-243", "REQ-244"],
    "UC-27": ["REQ-245"],
    "UC-25": ["REQ-231", "REQ-232", "REQ-233", "REQ-234", "REQ-235"],
    "UC-24": ["REQ-211", "REQ-212", "REQ-213", "REQ-214", "REQ-215", "REQ-221", "REQ-222", "REQ-223"],
}

TEST_RE = re.compile(r'^(?P<pre>(?:\s*//[^\n]*\n)*)(?P<line>test\((?P<q>["\'])(?P<title>(?:(?!(?P=q)).|\\.)*)(?P=q))', re.M)
VERIFIES = re.compile(r"//\s*Verifies\s+(?P<reqs>REQ-\d+(?:\s*,\s*REQ-\d+)*)(?:\s*\((?P<ucs>[^)]*)\))?")


def doc_ids(root: pathlib.Path, doc: str, kind: str) -> set[str]:
    return set(re.findall(rf"\|\s*({kind}-\d+)\s*\|", (root / "docs" / doc).read_text(encoding="utf8")))


def write_mapping(name: str, root: pathlib.Path, tests: dict, prefix: str) -> None:
    """Each repository owns the requirements in its docs/REQUIREMENTS.md and the use cases in its docs/USE_CASES.md.
    The mapping keeps the owned requirements only. vfm-preview also lists vfm tests, as evidence for its own
    requirements; vfm lists its own tests (keys relative to its root) and the manual ones that name its ids."""
    reqs, ucs = doc_ids(root, "REQUIREMENTS.md", "REQ"), doc_ids(root, "USE_CASES.md", "UC")
    cases = {}
    for tid, t in tests.items():
        if name == "vfm" and not tid.startswith(("vfm/", "manual/")):
            continue  # vfm lists its own tests, and the manual procedures (kept in vfm-preview/docs) that name its ids
        r, u = [x for x in t["requirements"] if x in reqs], [x for x in t["use_cases"] if x in ucs]
        if r or u:
            cases[tid[len(prefix):] if name == "vfm" else tid] = {**t, "requirements": r, "use_cases": u}
    use_cases = {uc: [r for r in rs if r in reqs] for uc, rs in USE_CASES.items() if uc in ucs}
    (root / "MAPPING.json").write_text(json.dumps({"use_cases": use_cases, "test_cases": cases}, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(f"wrote {name}/MAPPING.json: {len(use_cases)} use cases, {len(cases)} test cases")


def main() -> int:
    tests, failed = {}, False
    for suite, rel in TEST_FILES:
        path = SUITES[suite] / rel
        text = path.read_text(encoding="utf8")
        rules = LEGACY.get(rel, [])
        out, pos = [], 0
        for m in TEST_RE.finditer(text):
            title = m.group("title")
            found = VERIFIES.search(m.group("pre"))
            if found:
                reqs = re.findall(r"REQ-\d+", found.group("reqs"))
                ucs = re.findall(r"UC-\d+", found.group("ucs") or "")
            else:
                hit = next(((r, u) for rx, r, u in rules if re.search(rx, title)), None)
                if not hit:
                    print(f"UNMAPPED: {rel}: {title}")
                    failed = True
                    continue
                reqs, ucs = hit
                comment = f"// Verifies {', '.join(reqs)} ({', '.join(ucs)})\n"
                out.append(text[pos:m.start("line")] + comment)
                pos = m.start("line")
            tests[f"{suite}/{rel}::{title}"] = {"requirements": reqs, "use_cases": ucs, "kind": "automated"}
        out.append(text[pos:])
        new = "".join(out)
        if new != text:
            path.write_text(new, encoding="utf8")
    for mt, (reqs, ucs) in MANUAL.items():
        tests[f"manual/{mt}"] = {"requirements": reqs, "use_cases": ucs, "kind": "manual", "status": "not run"}
    if failed:
        return 1
    for name, root, prefix in (("vfm-preview", ROOT, ""), ("vfm", SUITES["vfm"], "vfm/")):
        write_mapping(name, root, tests, prefix)
    return 0


if __name__ == "__main__":
    sys.exit(main())
