# Markdown slide directives spec

One markdown file renders as a document by default, and as a slideshow when the author opts in, using `@slide` blocks that wrap existing content.

## Overview

The parser stores content only, and slides are a second view over the same AST. Layout, fitting and reveal timing belong to the renderer; the parser never emits presentation text.

- **Document mode** renders everything. `@slide` wrappers are transparent, and their title and lead-in text is never shown.
- **Slide mode** renders only content inside `@slide` blocks, split across as many rendered slides as needed.
- **Terms:** a "`@slide` block" is the directive pair in the source. A "slide" is what the audience sees after splitting.
- **Order rule:** slides never reorder source content, except that images may attach to the chunk holding the text before them.
- **Silent deletion** (cross-reference filtering) happens only in slide mode, and `check` reports every drop.

## Syntax

A `@slide` block wraps existing blocks and closes with `@end`. Both directives sit on their own lines.

```text
@slide[title](layout, showrefs, nodoc, noxrefs, steplists, stepleadin)
  ...blocks, headings allowed...
@end(leadin)
```

- **`[title]`** is optional, slide-only, inline Markdown, and overrides the section title. `[]` means a blank title. `@cite` is an error inside it. A literal bracket is written `\]`.
- **`(leadin)`** is optional, slide-only, inline Markdown, and shown on the last rendered slide of the block. Parentheses must balance, with `\)` to escape. `@cite` is an error here too.
- **Options** are order-independent. Unknown or malformed options are fatal in both modes, because `nodoc` changes document output.
- **Brackets** must follow `@slide` with no space, and the whole opener stays on one line.
- **Whole blocks only:** a wrapper cannot split a paragraph or list.
- **Headings are allowed inside** a `@slide` block.

| Option | Effect | Default |
| --- | --- | --- |
| `rtext` | Text on the right, images on the left | single column |
| `ltext` | Text on the left, images on the right | single column |
| `2col` | Two balanced columns | single column |
| `showrefs` | Show cited references on the slide | off |
| `nodoc` | Exclude this block from the document | off |
| `noxrefs` | Drop every unit containing a cross-reference | off |
| `steplists` | Reveal list items one per step | off |
| `stepleadin` | Reveal the lead-in on the last step | off |

### Title resolution

1. The `[title]` override, if present.
2. Otherwise the nearest heading in effect where the `@slide` opens.
3. Otherwise a blank title. This is not an error or a warning.

The slide records `titleSource` as `override`, `heading` or `none`. Continuations repeat the title as is.

## AST node types

The parser produces `SlideBlock` containers inside the document AST. The slide builder produces `Slide` nodes from them.

```ts
// Parser output: a transparent container in document mode
interface SlideBlock {
  kind: "slideBlock";
  title?: Inline[];            // from [title]; [] = blank, absent = inherit
  leadin?: Inline[];           // from @end(leadin)
  options: {
    layout?: "rtext" | "ltext" | "2col";
    showrefs: boolean; nodoc: boolean; noxrefs: boolean;
    steplists: boolean; stepleadin: boolean;
  };
  headingInEffect?: HeadingRef; // heading where the opener sits
  children: Block[];           // may contain Heading nodes
  loc: SourceLoc;
}

// Slide builder output: one per rendered slide
interface Slide {
  kind: "slide";
  title: Inline[];
  titleSource: "override" | "heading" | "none";
  continuation: { index: number; of: number };
  layout: "single" | "rtext" | "ltext" | "2col";
  context: ContextItem[];      // repeated ancestors on continuations
  body: Block[];
  images: Block[];             // image region for rtext / ltext
  references: RefEntry[];      // only new references, under showrefs
  leadin?: Inline[];           // last slide of the block only
  steps: NodeId[][];           // steps[0] is empty
  sourceBlock: SlideBlock;
}

interface ContextItem {
  kind: "listParent" | "heading";
  inline: Inline[];            // text only, no @cite, no cross-references
  continued: boolean;          // lets the renderer show "(cont.)"
}
```

- **Units** for filtering and splitting are: a sentence in a paragraph, a list item, a heading plus its first block, or any other whole block.
- **Figure and caption** are one unit, and a split never separates them.
- **Labels** are allowed only on top-level blocks (figures, tables, code, headings), which the filter never drops.
- **Source locations** are kept for every node, including text brought in by `@include`, so `check` can point at the original file.

## Pipeline

First, `@include` runs as a textual substitution on raw source, recursively, with cycle detection and paths relative to the including file. Then the AST goes through the stages below. Document mode stops after stage 1 and renders the AST with `@slide` wrappers transparent.

1. **Parse and validate** the whole AST. A label that exists nowhere in the document is an error. Syntax errors are fatal in both modes.
2. **Resolve titles:** override, then the heading at the opener, then blank.
3. **Prune** to the content of `@slide` blocks, headings inside them included. Everything else is dropped.
4. **Merge dividers and agendas** into nested lists (see Layout, images and dividers).
5. **Filter and split:** drop cross-reference units whose targets are in no `@slide` block (and, under `noxrefs`, all cross-reference units), then split greedily with the co-location rule, then apply layout and image placement.
6. **Number and resolve** figures, tables, citations and references deck-wide by appearance in the slide view.
7. **Assign reveal steps** under `steplists` and `stepleadin`. This stage only annotates and never changes content or fit.

### Error policy

- **Fatal in both modes:** syntax errors (unbalanced `@end`, bad option names, directive on an inline line), unknown labels, and document-mode references into `nodoc` content.
- **Slide mode only:** overflow of a single unit that cannot fit on an empty slide.
- **Warnings from `check`:** everything else in the Check messages section.

## Layout, images and dividers

| Situation | Result |
| --- | --- |
| No layout given | single column |
| `rtext` / `ltext`, no images | single column |
| `rtext` / `ltext`, with images | text on one side, image region on the other |
| `2col`, slide without an image | two columns, balanced at block boundaries |
| `2col`, slide with an image | single column for that slide |
| `2col`, two or more images and no text | one image per column |
| Image-only slide | one image per slide |

### Images

- **Image blocks** are blocks containing only an image. An image inside a paragraph stays inline in the text flow.
- **Placement:** an image attaches to the slide that holds the block before it. If the block and image don't fit together, the image moves to the next slide. An image with no preceding block attaches to the first slide.
- **`rtext` / `ltext`:** the image region is separate from the text region. Extra images that overflow it spill onto an image-only slide right after.
- **Captions** travel with their image.

### Dividers and agendas

- **Divider:** a `@slide` block whose content is only headings (an empty block counts, with the resolved title as its one entry). One entry shows as a large heading.
- **Run merging:** adjacent dividers (adjacent in the slide view, so pruned prose does not break the run) merge into one slide whose body is a list nested by relative heading depth. Runs merge only when their `nodoc` and reveal flags match.
- **Merged title:** the nearest heading that is a proper ancestor of the run's shallowest entry, otherwise blank.
- **Agenda:** a `@slide` with a `[title]` override and only headings keeps the override as its title, with the headings as the list.
- **Options on dividers:** layouts and `showrefs` / `noxrefs` are ignored with a `check` warning. The last block's lead-in is kept, and earlier ones are dropped with a warning.

### Sections inside a content slide

- Heading levels are relative: the shallowest heading inside becomes level 1 beneath the slide title.
- A heading and the first block after it form one unit, so a heading is never stranded at the bottom of a slide. A heading with nothing after it is dropped with a warning.
- A continuation repeats the slide title and the heading in effect, flagged `continued`.
- `check` warns when a content slide holds more than N headings (default 2, set at deck level). It is never an error, and dividers are exempt.

## Cross-references, citations and showrefs

A cross-reference such as `[@fig:ref]` survives only if its target is on the same rendered slide. A reference to a label that exists nowhere in the document is an error in stage 1, so a typo is never mistaken for an absent target.

| Reference target | Default | `noxrefs` |
| --- | --- | --- |
| Same rendered slide | unit kept | unit dropped |
| Another slide, or only in the document | unit dropped | unit dropped |
| Label exists nowhere | error | error |

- **Unit:** a sentence in a paragraph or a whole list item. If the segmenter is unsure, the whole paragraph is the unit. The segmenter splits on sentence-final punctuation followed by a capital letter, with exceptions for abbreviations, decimals, code spans, `@cite(...)` and `[@...]`.
- **Not filtered:** tables, code blocks and captions. An unresolvable reference inside one renders as plain text, with a `check` warning.
- **Targets** are block-level: figures, tables, headings and other top-level labeled blocks.
- **Early drop (stage 5):** units referencing targets in no `@slide` block, and all cross-reference units under `noxrefs`.
- **Co-location drop (during splitting):** units whose target ends up on a different slide, by the algorithm in the next section.
- **Orphaned follow-ons:** a kept sentence may begin with "This" or "It" after a drop. The parser cannot detect that, so `check` lists the sentence following each drop.

### Citations and showrefs

- `@cite` is not a cross-reference, so citations are unaffected by the filter. A dropped unit's citations do not count as cited.
- Reference numbers are deck-wide, assigned by first appearance in the slide view.
- Under `showrefs`, each slide lists only the references cited on it that no earlier slide has shown. Slides without `showrefs` do not count as having shown anything.
- A citation on a continuation slide appears on that slide, not the first. New references are reserved in the fit test, like the lead-in, so slides must be processed strictly in source order.
- In `nodoc` blocks, citations do not count toward the document's bibliography numbering.

## Splitter

The splitter is one greedy pass per `@slide` block, in source order. The renderer supplies `fits(slide)`, which measures with everything visible and includes the lead-in (on the last slide), new references under `showrefs`, and repeated context.

```text
split(block, deckState):
  units = units(block)                  # after the early drop
  slides = [newSlide(block)]
  pending = []                          # (unit, targets not yet placed)

  for unit in units:
    cur = last(slides)
    if not fits(cur + unit):
      cur = startSlide(slides, contextFor(unit))   # repeat ancestors
      if not fits(cur + unit):
        error("overflow", unit.loc); continue      # a unit too big alone
    place(cur, unit)

    for t in unit.xrefTargets:
      where = placedOn(t)
      if where is None:        pending.add(unit, t)   # target comes later
      elif where != cur:       drop(unit, "target on earlier slide")

    for t in labelsDefinedBy(unit):                   # a figure, table, heading
      for (u, t2) in pending where t2 == t:
        if slideOf(u) != cur:  drop(u, "separated by a break")
        else:                  pending.resolve(u, t)

  for (u, t) in pending:                              # target never placed
    drop(u, "target not on any slide")

  last(slides).leadin = block.leadin
  numberContinuations(slides)
  return slides
```

- **Pending units keep their space** while pending, so a drop can never cause overflow elsewhere.
- **Retroactive drops** leave closed slides shorter. Nothing is pulled back from later slides, which keeps the pass single and non-iterative.
- **A unit with several targets** survives only if all of them end up on its slide.
- **Split points:** between blocks, and between list items. Paragraphs, code and tables are never cut, except a paragraph too large for an empty slide, which is split at sentence boundaries with a `check` warning.
- **Context cost:** repeated ancestors are measured. If context leaves too little room for one unit, drop the outermost levels first and keep the nearest parent. If even that does not fit, report overflow.
- **Lists:** continuations repeat the parent items only along the path to the continued child, as plain items.
- **Images** are placed by the rules in Layout, images and dividers, in the same pass.

## Reveal steps

`steplists` and `stepleadin` affect rendering only. They run as stage 7, after slides and lists are final, and never add, remove or move content. Option names are placeholders.

- **Model:** each rendered slide has an ordered list of steps. Step 0 is what is visible when the slide appears.
- **`steplists`:** every list item is hidden at step 0 and revealed one per step in reading order. Nested items follow their parent. Several lists on one slide continue the same count in source order.
- **`stepleadin`:** the lead-in is hidden until one step after the last stepped list item, or step 1 if there is no stepped list.
- **Visible from step 0:** paragraphs, headings, images, code, tables, repeated parent context and references.
- **Fit** is measured with everything visible, and hidden items keep their space, so nothing shifts as items appear.
- **Continuations** start their own steps at 0, and only the last one has a lead-in.
- **Merged agendas** are ordinary lists, so `steplists` applies to them. A run merges only if its reveal flags match.
- **No-op cases:** `steplists` with no lists, or `stepleadin` with no lead-in, does nothing and gets a `check` note.
- **Document mode** ignores both options.

```text
steps: [[], [item1], [item2], [item3], [leadin]]
```

A renderer that does not support stepping ignores `steps` and shows everything. Static output such as PDF shows the final step, one page per rendered slide.

## Check messages

`check` validates slide directives and reports what slide mode would change, without rendering. Every message carries the source location, including the original file for included text.

| Code | Severity | Reported when |
| --- | --- | --- |
| `syntax` | error | Unbalanced `@end`, unknown option, directive on an inline line, `@cite` in a title or lead-in |
| `unknown-label` | error | A cross-reference names a label that exists nowhere in the document |
| `doc-ref-into-nodoc` | error | The document references a label defined only in a `nodoc` block |
| `overflow` | error | A single unit cannot fit on an empty slide |
| `drop-xref` | info | A unit was dropped. Names the label and the case: not on any slide, target on earlier slide N, or separated by a break |
| `drop-follows` | info | Lists the kept sentence that follows each dropped one, since it may begin with "This" or "It" |
| `drop-all` | warning | A paragraph or list disappeared entirely |
| `xref-in-table-or-code` | warning | An unresolvable reference inside a table or code block rendered as plain text |
| `split` | info | A `@slide` block continued onto N slides |
| `paragraph-split` | warning | A paragraph was split at a sentence boundary because it was too large |
| `too-many-headings` | warning | A content slide has more than N headings (default 2) |
| `heading-stranded` | warning | A trailing heading with nothing after it was dropped |
| `layout-ignored` | warning | A layout or `showrefs` / `noxrefs` on a divider or agenda |
| `leadin-dropped` | warning | A merged divider run discarded an earlier lead-in |
| `layout-no-image` | info | `rtext` or `ltext` with no images, rendered as single column |
| `step-noop` | info | `steplists` with no lists, or `stepleadin` with no lead-in |

## Open items

None of these blocks the design. Each can be added later without changing the pipeline.

- **`@more`:** a line that forces a slide break, so an author can keep a paragraph with its figure instead of losing the sentence. A no-op in document mode.
- **`nomerge`:** an option that keeps a single title-only divider from merging into an agenda.
- **Heading-count threshold:** the default of 2 for `too-many-headings` needs real documents to tune.
- **Option names:** `steplists` and `stepleadin` are placeholders.
- **Comment-wrapped form:** `<!-- @slide(...) -->` so raw files read cleanly on sites that do not know the syntax.
- **Including an existing figure by label** in a second `@slide` block, so one figure can serve several slides.
