#!/usr/bin/env python3
"""Builds MAPPING.json and adds `// Verifies REQ-… (UC-…)` comments to test cases that lack one.

Test cases written for a requirement carry the comment already (the source of truth for the mapping).
Older test cases are mapped here by file and title; one that matches no rule stops the script, so a new
test cannot go unmapped. Run from vfm-preview/: python3 tools/generate_mapping.py
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUITES = {
    "vfm": ROOT.parent / "vfm",
    "vfm-preview": ROOT,
}
TEST_FILES = [
    ("vfm", "tests/slide-polish.test.ts"),
    ("vfm-preview", "tests/extension-polish.test.ts"),
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
        (r"unknown key", ["REQ-016", "REQ-018"], ["UC-04", "UC-11"]),
        (r".", ["REQ-016"], ["UC-04"]),
    ],
    "test/music-audio.test.ts": [(r".", ["REQ-038"], ["UC-06"])],
    "test/no-network.test.ts": [(r".", ["REQ-031"], ["UC-10"])],
    "test/slides.test.ts": [
        (r"directive syntax errors|inside code fences", ["REQ-033"], ["UC-11", "UC-03"]),
        (r"reference into a nodoc", ["REQ-004", "REQ-033"], ["UC-03", "UC-11"]),
        (r"document mode: wrappers", ["REQ-004"], ["UC-03"]),
        (r"@include|diagnostics from included", ["REQ-007", "REQ-033"], ["UC-03", "UC-11"]),
        (r"footnote", ["REQ-039"], ["UC-03"]),
        (r"cross-reference unit|reference to a label in no|heading survives", ["REQ-020"], ["UC-05"]),
        (r"only referenced items|numberCaptions", ["REQ-019", "REQ-020"], ["UC-05"]),
        (r"layouts:|revert to one column", ["REQ-006"], ["UC-03"]),
        (r"steplists|step options", ["REQ-013"], ["UC-02"]),
        (r"table taller", ["REQ-012", "REQ-011"], ["UC-03"]),
        (r"code listing or theorem|at most one|floats take|second float|tables are floats|no header row|single sentence taller|continuation repeats|splitting is greedy|reduced paragraph stays|list continuation", ["REQ-011"], ["UC-03"]),
        (r"YAML header makes a title slide", ["REQ-009", "REQ-111"], ["UC-02", "UC-14"]),
        (r"slide number", ["REQ-010"], ["UC-02"]),
        (r"\bnotes?\b", ["REQ-030"], ["UC-09"]),
        (r"algorithm, music and mermaid|old @@@|preprocessing keeps line", ["REQ-021"], ["UC-06"]),
        (r"document separator", ["REQ-008"], ["UC-03"]),
        (r"sentences end", ["REQ-015"], ["UC-12"]),
        (r"reducer|language defaults|paragraph ending in a colon|bold value", ["REQ-014"], ["UC-12"]),
        (r"block elements carry data-line", ["REQ-024"], ["UC-07"]),
        (r"HTML comments never|raw HTML", ["REQ-022"], ["UC-03"]),
        (r"underline|~text~", ["REQ-040"], ["UC-01"]),
        (r"slide mode keeps only|blank-title|title is shared|several sections|\[title\] on the block|shared by several|adjacent dividers|title-only|same-level headings|only a run", ["REQ-005"], ["UC-03"]),
    ],
}

# Requirements that need a person (VS Code UI, a browser, a file on disk). Procedures: docs/MANUAL_TESTS.md.
MANUAL = {
    "MT-01": (["REQ-001"], ["UC-01"]),
    "MT-02": (["REQ-002"], ["UC-02"]),
    "MT-03": (["REQ-003"], ["UC-02"]),
    "MT-04": (["REQ-017", "REQ-018"], ["UC-04", "UC-11"]),
    "MT-05": (["REQ-023"], ["UC-07"]),
    "MT-06": (["REQ-024", "REQ-163"], ["UC-07", "UC-19"]),
    "MT-07": (["REQ-025"], ["UC-07"]),
    "MT-08": (["REQ-026", "REQ-106", "REQ-147"], ["UC-08", "UC-13", "UC-17"]),
    "MT-09": (["REQ-027"], ["UC-08"]),
    "MT-10": (["REQ-028"], ["UC-08"]),
    "MT-11": (["REQ-029"], ["UC-08"]),
    "MT-12": (["REQ-032", "REQ-145"], ["UC-10", "UC-17"]),
    "MT-13": (["REQ-033"], ["UC-11"]),
    "MT-14": (["REQ-143", "REQ-144"], ["UC-17"]),
    "MT-15": (["REQ-171", "REQ-146"], ["UC-20", "UC-17"]),
    "MT-16": (["REQ-101", "REQ-102"], ["UC-13"]),
    "MT-17": (["REQ-151", "REQ-152"], ["UC-18"]),
}

USE_CASES = {  # use case → requirements it needs (docs/USE_CASES.md ↔ docs/REQUIREMENTS.md)
    "UC-01": ["REQ-001", "REQ-040"],
    "UC-02": ["REQ-002", "REQ-003", "REQ-009", "REQ-010", "REQ-013"],
    "UC-03": ["REQ-004", "REQ-005", "REQ-006", "REQ-007", "REQ-008", "REQ-011", "REQ-012", "REQ-022", "REQ-039"],
    "UC-04": ["REQ-016", "REQ-017", "REQ-018", "REQ-034", "REQ-035", "REQ-036", "REQ-037"],
    "UC-05": ["REQ-019", "REQ-020"],
    "UC-06": ["REQ-021", "REQ-038"],
    "UC-07": ["REQ-023", "REQ-024", "REQ-025"],
    "UC-08": ["REQ-026", "REQ-027", "REQ-028", "REQ-029"],
    "UC-09": ["REQ-030"],
    "UC-10": ["REQ-031", "REQ-032"],
    "UC-11": ["REQ-018", "REQ-033"],
    "UC-12": ["REQ-014", "REQ-015"],
    "UC-13": ["REQ-101", "REQ-102", "REQ-103", "REQ-104", "REQ-105", "REQ-106"],
    "UC-14": ["REQ-111", "REQ-112", "REQ-113", "REQ-114"],
    "UC-15": ["REQ-121", "REQ-122", "REQ-123"],
    "UC-16": ["REQ-131", "REQ-132", "REQ-133", "REQ-134", "REQ-135", "REQ-136"],
    "UC-17": ["REQ-141", "REQ-142", "REQ-143", "REQ-144", "REQ-145", "REQ-146", "REQ-147", "REQ-148"],
    "UC-18": ["REQ-151", "REQ-152"],
    "UC-19": ["REQ-161", "REQ-162", "REQ-163"],
    "UC-20": ["REQ-171", "REQ-172", "REQ-173", "REQ-174"],
    "UC-21": ["REQ-181"],
}

TEST_RE = re.compile(r'^(?P<pre>(?:\s*//[^\n]*\n)*)(?P<line>test\((?P<q>["\'])(?P<title>(?:(?!(?P=q)).|\\.)*)(?P=q))', re.M)
VERIFIES = re.compile(r"//\s*Verifies\s+(?P<reqs>REQ-\d+(?:\s*,\s*REQ-\d+)*)(?:\s*\((?P<ucs>[^)]*)\))?")


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
    mapping = {"use_cases": USE_CASES, "test_cases": tests}
    (ROOT / "MAPPING.json").write_text(json.dumps(mapping, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(f"wrote MAPPING.json: {len(USE_CASES)} use cases, {len(tests)} test cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
