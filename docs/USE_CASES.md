# Use cases

Derived from `README.md`, `update.md`, `slide-directives-spec.md`, `../vfm/README.md` and the comments in the
source. "Source" names where the use case was found. UC-13 to UC-21 are the work in the `slide-polish` feature;
the rest describe behavior that already exists. Requirements are in `REQUIREMENTS.md`; the mapping between
use cases, requirements and test cases is in `MAPPING.json`.

**Actor.** The *author* writes Markdown in VS Code and watches the preview. The *audience* sees the slides or
an exported file.

`../vfm/docs/USE_CASES.md` has the renderer's use cases. Use case IDs are unique across the two files.

## Existing behavior (inferred)

| ID | Use case | Source |
| --- | --- | --- |
| UC-01 | The author previews a Markdown file as a document, beside the editor, and the preview follows edits. | README "VFM Preview" |
| UC-02 | The author previews the same file as slides, moves between slides and reveal steps with the keyboard, and toggles between the two views. | README "Slide mode" |
| UC-04 | The author cites sources with `@cite(key)` and gets in-text citations and a reference list from BibTeX files named in the YAML header. | README "Citations" |
| UC-07 | The author edits from the preview: toggles task checkboxes, double-clicks to jump to the source, scrolls the editor and preview together. | README "Editing from the preview" |
| UC-08 | The author exports the document or slides to HTML, PDF, Word (with template), PowerPoint (with template) or slides-only Markdown. | README "Export" |
| UC-09 | The presenter keeps private notes with `@note(…)` and shows them in a presenter view. | README "Presenter notes" |
| UC-10 | The author works offline and the preview never contacts the network. | vfm README "No network access" |
| UC-11 | The author learns about directive and citation problems in the Problems panel. | README "Slide mode", "Citations" |

## New in `slide-polish`

| ID | Use case | Origin |
| --- | --- | --- |
| UC-13 | The author gives a deck a theme color. The rule under every slide title uses it, the title slide and the section slides sit on that color as it is. | request |
| UC-15 | The author writes math in the caption of a figure, table, listing, algorithm, score or diagram. | request |
| UC-16 | The author writes subscripts and superscripts in ordinary text (chemical formulas, units, ordinals, footnote-like marks) without switching to math. | request |
| UC-17 | The author adds a video, especially a `.mov` file, with the same syntax as an image and plays it in the preview. | request |
| UC-19 | The author double-clicks a slide title or a lead-in in the slide preview and lands on the line of the file that produced it. | bug report |
| UC-21 | The developer builds the extension, in the main working copy or in a `vfm-preview-<feature>` copy, against the sibling `vfm` library. | project note |

## New in `slide-colors`

| ID | Use case | Origin |
| --- | --- | --- |
| UC-24 | The author replaces the background of the title slide with an image. | request |
