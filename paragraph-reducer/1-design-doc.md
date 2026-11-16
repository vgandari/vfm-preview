# Design Document: Paragraph Reducer for the Markdown-to-Slides Parser

**Status:** Draft
**Date:** 2026-10-25
**Scope:** Add deterministic (non-LLM) handling of `paragraph` AST nodes to an existing parser that already gathers and separates markdown content for slideshows.

---

## 1. Background and Problem

The existing parser walks the markdown AST and emits slide content, but does not handle `paragraph` nodes. Paragraphs are the hardest node type to convert: slides need terse text, while paragraphs are long prose.

This design adds a **paragraph reducer** that turns each paragraph into slide-ready bullets (or a callout) and always preserves the full original text in speaker notes. It does not use an LLM. It selects and trims existing text only, so no words are invented.

## 2. Goals and Non-Goals

### Goals
- Handle paragraph nodes without dropping content.
- Work for any language out of the box (Part A), with optional per-language improvements (Part B).
- Output is always a subset of the source text.
- Integrate through one narrow interface so the existing parser changes minimally.
- Be conservative: bad bullets are worse than no bullets.

### Non-Goals
- Abstractive summarization or paraphrasing.
- Rewriting the existing parser's heading, list, table, image, or code handling.
- Slide rendering (handled by the existing parser's output stage).

## 3. Assumptions

The parser's source language and slide object shape have not been reviewed. This document assumes the parser walks an AST and emits slide objects with roughly: title, bullets, notes, and a layout hint. Concrete code should be written against the real shape once known.

## 4. Integration Contract

The only change to the existing parser: when it meets a paragraph node, call the reducer and merge the result into the current slide.

```
reduce_paragraph(node, context, config) -> ParagraphResult

node:     paragraph AST node (inline children: text, strong, em, link, code)
context:  heading text, section siblings, document language, document-level IDF
config:   budgets, weights, language profile (optional; may be empty)

ParagraphResult
  kind:     exposition | enumeration | definition | statistic | process | contrast
  bullets:  list[str]                 # goes on the slide
  callout:  optional (value, caption)
  notes:    str                       # original paragraph, always preserved
  source:   position range            # trace back to the markdown
```

Design rules:
- The language profile is optional. The pipeline must work with an empty one.
- `notes` always contains the original paragraph text.
- The reducer never throws on valid input; on any internal failure it returns `kind=exposition`, empty `bullets`, and the original in `notes`.

## 5. Part A: Language-Independent Components

| ID | Component | Description |
|---|---|---|
| A1 | Inline flattening | Walk inline children to produce plain text plus spans (bold, italic, link, code) with character offsets. Bold/italic are the author's importance signal. Normalize soft wraps and hard breaks before segmenting. |
| A2 | Document preparation | Once per document: segment all paragraphs, build a document-level IDF table from tokens, and cache heading tokens per section. Self-computed IDF removes the need for stopword lists. |
| A3 | Segmentation | ICU / Unicode UAX #29 sentence and word segmentation, parameterized by locale (`BreakIterator`, or `Intl.Segmenter` in JS). Language is detected once per document; a front-matter `lang:` override takes priority. |
| A4 | Structural kind detection | Punctuation and markup cues only. See table below. |
| A5 | Sentence scoring | Weighted sum of position (first, last), IDF-weighted overlap with the section heading, bold-span presence, numeric content, and a statistical filler penalty (frequent, low-IDF sentence-initial tokens). TextRank centrality is added only if heuristics prove insufficient. All weights live in `config`. |
| A6 | Selection with guards | Take top k sentences (default 1-2) in source order. Dangling-reference guard: if a chosen sentence opens with a frequent, short, low-IDF sentence-initial token and the previous sentence was not chosen, include the previous sentence. Topic-shift split: for paragraphs over about 6 sentences, split where adjacent-sentence similarity drops and emit separate bullet groups. |
| A7 | Punctuation-based trimming | Remove parenthetical spans (ASCII and CJK brackets); remove spans between paired commas or dashes; if still over budget, cut at the last clause delimiter (`, ; — 、 ， ；`) under budget. Never cut mid-token; never add words. |
| A8 | Display-unit budgets | Budget in characters or grapheme width, not words: roughly 70-90 for Latin scripts, 35-45 for CJK. Keyed by script in `config`. |
| A9 | Layout mapping | Map `kind` to existing layouts: enumeration to bullets, statistic to callout, definition to bold header plus line, process to numbered list, exposition to 1-2 bullets. |
| A10 | Author overrides | Honored in order: explicit marker (a blockquote or directive meaning "this is the slide text"); bold-only paragraphs used verbatim; front-matter switch `paragraphs: first-sentence \| auto \| notes-only`. |

### A4 cue table

| Kind | Language-neutral cue |
|---|---|
| Enumeration | Colon followed by 3+ delimiter-separated segments of similar length |
| Definition | Bold/italic span at sentence start followed by a dash or colon |
| Statistic | Numeric token with `%`, currency, or unit forming a large share of the sentence's salient content |
| Process | Ordinals or numerals at sentence starts |
| Exposition | Default |
| Contrast | Not detectable without a lexicon; deferred to Part B |

### Exit criteria for Part A
On a test corpus in at least three scripts (Latin, CJK, and Arabic or Hebrew), every paragraph yields non-empty bullets that are subsets of the source, with no exceptions, using nothing language-specific.

## 6. Part B: Language-Dependent Components (additive, optional)

| ID | Component | Description |
|---|---|---|
| B1 | Language profile format | One YAML/JSON file per language containing: sentence-break suppressions (abbreviations), budget overrides, discourse-marker lists, contrast markers, process cues, anaphoric openers, and parser model name. A missing key falls back to Part A behavior. |
| B2 | Better segmentation | Register stronger segmenters (e.g. `pysbd`) as overrides of A3; fall back to ICU on failure. |
| B3 | Marker lexicons (10-30 words each) | Filler/discourse openers (penalize and strip when leading); contrast markers (enable the contrast kind and two-column layout); anaphoric openers (sharpen the A6 guard); process cues. |
| B4 | Universal Dependencies trimming | Optional trimmer using a UD parser (Stanza, UDPipe, or a spaCy pipeline). Delete by UD label: `appos`, `parataxis`, trailing `advcl` and `acl:relcl`, low-information `advmod`, leading discourse `cc`/`advmod`. Rules use position relative to core arguments, not left/right of head, so they hold for any word order. Delete by character offsets for unspaced scripts. Coordinated lists (`conj` chains) become sub-bullets. Safety net: if the result lacks a root verb or required subject, revert to A7 output. |
| B5 | Definition/enumeration refinement | Optional per-language patterns ("X is/means/refers to...", "includes/such as...") for cases A4 misses. |
| B6 | Per-language tuning | Adjust budgets and score weights per language after evaluation. |

## 7. Processing Pipeline

```
paragraph node
  -> A1 flatten + normalize
  -> A10 override check (may return early)
  -> A3 segment
  -> A4 detect kind (+ B3/B5 refinement if profile present)
  -> A5 score
  -> A6 select + guards
  -> A7 trim (or B4 if parser available)
  -> A8 enforce budget
  -> A9 map to layout
  -> ParagraphResult (notes = original)
```

## 8. Configuration

Front matter (document level):

```yaml
lang: en                 # overrides detection
paragraphs: auto         # first-sentence | auto | notes-only
```

Config (code or file level): score weights, per-script budgets, `k` (sentences kept), topic-shift threshold, split threshold, and the language profile directory.

Default behavior should be conservative: when confidence is low, emit notes-only.

## 9. Evaluation Plan

1. **Corpus:** about 30 documents (technical, narrative, list-heavy) in 3+ languages, with a handful of paragraphs hand-labeled with the desired bullets.
2. **Automated invariants:**
   - Bullets are substrings or subsequences of the source.
   - No empty slides.
   - Every bullet is within budget.
   - Notes always contain the original paragraph.
3. **Snapshot tests** on rendered slide models so weight changes appear as reviewable diffs.
4. **Manual review** of 20-30 outputs per language before adding B-level features, to see where Part A falls short.

## 10. Rollout Order

| Step | Work | Result |
|---|---|---|
| 1 | Contract, A1, A9, notes passthrough | Paragraphs appear in notes; nothing breaks |
| 2 | A3, A8, A7 | Truncated first sentence per paragraph, any language |
| 3 | A2, A5, A6 | Scored selection with guards |
| 4 | A4, A10 | Kind detection and author overrides |
| 5 | B1, B3 | Lexicons for top languages |
| 6 | B2, B4 | Parser-based trimming |
| 7 | Evaluation harness, B6 tuning | Measured quality |

Steps 1 and 2 are independently shippable. Step 1 alone closes the "paragraphs are dropped" gap.

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Bad bullets look worse than none | Conservative default (notes-only unless confident); opt-in aggressiveness via `paragraphs:` |
| Language misdetection on short or mixed documents | Explicit `lang:` override; detect per document, not per paragraph |
| Soft wraps and hard breaks distort segmentation | Normalize whitespace in A1 |
| Extractive output reads choppy on narrative prose | Accept as a known limit; author overrides (A10) as the escape hatch |
| Dependency trimming yields ungrammatical fragments | B4 safety net reverting to A7 output |
| Dangling pronouns after sentence selection | A6 guard, sharpened by B3 anaphora list |

## 12. Open Questions

1. What language is the existing parser written in, and what is its slide object shape?
2. Which languages must be supported first, and are CJK or right-to-left scripts in scope?
3. Is a heavyweight NLP dependency (spaCy, Stanza) acceptable, or should B4 be optional at install time?
4. Output target: .pptx, HTML (reveal.js/Marp), or both?
5. Should notes be rendered as speaker notes, or also as an appendix slide?

## 13. Appendix: Reference Sketch of the Language-Neutral Core

```python
import regex, math
from icu import BreakIterator, Locale
from collections import Counter

def segment(text, lang, kind):
    bi = (BreakIterator.createSentenceInstance if kind == "sent"
          else BreakIterator.createWordInstance)(Locale(lang))
    bi.setText(text)
    out, start = [], 0
    for end in bi:
        out.append(text[start:end]); start = end
    return out

def words(s, lang):
    return [w.lower() for w in segment(s, lang, "word")
            if regex.search(r"[\p{L}\p{N}]", w)]

def idf_table(docs_tokens):
    df = Counter(w for d in docs_tokens for w in set(d))
    n = len(docs_tokens)
    return {w: math.log((n + 1) / (c + 1)) + 1 for w, c in df.items()}

HAS_NUM = regex.compile(r"\p{N}")
PAREN = regex.compile(r"[\(（\[【][^\)）\]】]*[\)）\]】]")

def score(sents, idf, heading_tokens, bold_spans, lang):
    head = set(heading_tokens)
    res = []
    for i, s in enumerate(sents):
        toks = words(s, lang)
        sc = 2.0 if i == 0 else (0.8 if i == len(sents) - 1 else 0)
        sc += 1.5 * sum(idf.get(t, 0) for t in set(toks) & head) / (
            sum(idf.get(t, 0) for t in head) or 1)
        sc += 2.0 * any(b in s for b in bold_spans)
        sc += 1.0 * bool(HAS_NUM.search(s))
        res.append(sc)
    return res

def trim_by_punct(s, budget_chars):
    s = PAREN.sub("", s)
    if len(s) <= budget_chars:
        return s.strip()
    cuts = [m.end() for m in regex.finditer(r"[,;—、，；]", s)
            if m.end() <= budget_chars]
    return (s[:cuts[-1]] if cuts else s[:budget_chars]).strip(" ,;—、，；")
```