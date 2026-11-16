# Requirements

Style: NASA Systems Engineering Handbook. Each requirement is one verifiable "shall" statement. "Preview" is
the VS Code extension (`vfm-preview`), "vfm" is the renderer library in `../vfm`. Verification methods: **T**est,
**I**nspection, **D**emonstration. Test cases are not written yet for the inferred requirements (see
`MAPPING.json`); that is on purpose and is tracked as a gap, not as coverage.

## A. Inferred from existing behavior

### Document and slide views

| ID | Requirement | UC | Source |
| --- | --- | --- | --- |
| REQ-001 | The preview shall render the Markdown file as a document and refresh within one second of an edit. | UC-01 | README |
| REQ-002 | The preview shall open in the mode named by the setting `vfmPreview.mode` and switch between document and slide mode on command. | UC-02 | README |
| REQ-003 | In slide mode the preview shall advance by one slide or one reveal step on ←, → and Space. | UC-02 | README |
| REQ-004 | vfm shall render the content of every `@slide … @end` block as part of the document, and shall omit blocks marked `nodoc`. | UC-03 | spec "Overview" |
| REQ-005 | vfm shall build, from the `@slide` blocks only, one or more 1280×720 slides per block, in source order. | UC-03 | spec "Overview" |
| REQ-006 | vfm shall support the layouts `rtext`, `ltext` and `2col` and shall treat the absence of a layout as a single column. | UC-03 | spec "Syntax" |
| REQ-007 | vfm shall replace an `@include(path)` line with the contents of the named file before parsing and shall report a cycle as a diagnostic. | UC-03 | vfm README `includes.ts` |
| REQ-008 | vfm shall end the current slide at a document separator (`---`, `***`) inside a `@slide` block and shall not display the separator. | UC-03 | vfm README |
| REQ-009 | vfm shall make slide 1 from the YAML header's `title`, `subtitle`, authors, affiliations and `date` when a `title` exists. | UC-02 | vfm README "Title slide" |
| REQ-010 | vfm shall number slides from 1, counting the title slide, and shall show the number in the lower right corner of every slide except the title slide. | UC-02 | vfm README, `update.md` |
| REQ-011 | vfm shall place content in whole units and shall not change type size to make room, except that it shall scale a lone float down to at most half size. | UC-03 | vfm README "What does not fit" |
| REQ-012 | vfm shall split a table that has a header row and is too tall across slides by rows, repeating the header. | UC-03 | vfm README |
| REQ-013 | vfm shall reveal list items one per step under `steplists` and the lead-in on the last step under `stepleadin`. | UC-02 | spec "Reveal steps" |
| REQ-014 | vfm shall reduce a paragraph inside a `@slide` block to slide text by selecting and deleting sentences only, never by rewriting, unless the mode is `paragraphs: full`. | UC-12 | vfm README |
| REQ-015 | vfm shall treat sentence-ending punctuation followed by a line break as the only sentence boundary. | UC-12 | `update.md` |

### Citations, labels, blocks

| ID | Requirement | UC | Source |
| --- | --- | --- | --- |
| REQ-016 | vfm shall resolve `@cite(key)` and `@cite(a, b)` against the BibTeX files named in the YAML header `bibliography` key. | UC-04 | README "Citations" |
| REQ-017 | The preview shall look for a relative `.bib` path next to the Markdown file, then in the containing workspace folder, then in other workspace folders, and shall prefer unsaved editor text. | UC-04 | README |
| REQ-018 | The preview shall report an unreadable bibliography or unparsable entry in the Problems panel, and vfm shall mark an unknown key as an "unknown citation". | UC-04, UC-11 | README |
| REQ-019 | vfm shall number labelled headings, figures, tables, listings, equations, algorithms and scores and shall replace `[@label]` with a link showing the number. | UC-05 | vfm README |
| REQ-020 | In slide mode vfm shall number only items that a surviving cross-reference points to, consecutively across the deck. | UC-05 | vfm README "Numbering" |
| REQ-021 | vfm shall render fenced blocks with the language `alg`, `mus` or `mermaid` as an algorithm, a score with a Play button, or a diagram numbered as a figure. | UC-06 | vfm README |
| REQ-022 | vfm shall display raw HTML as text and shall keep HTML comments invisible. | UC-03 | vfm README "No raw HTML" |

### Editing, export, privacy

| ID | Requirement | UC | Source |
| --- | --- | --- | --- |
| REQ-023 | When the author clicks a task checkbox, the preview shall rewrite that line in the file in which it was written, including an included file. | UC-07 | README |
| REQ-024 | When the author double-clicks rendered content that carries a source line, the preview shall reveal that line in the editor and shall select the clicked word when it is on the line. | UC-07 | README |
| REQ-025 | The preview shall scroll the editor and the preview together in document mode. | UC-07 | README, `update.md` |
| REQ-026 | The preview shall export a self-contained HTML file with local images and KaTeX fonts inlined. | UC-08 | README |
| REQ-027 | The preview shall print the HTML export to PDF with a locally installed browser, one 1280×720 page per slide. | UC-08 | README |
| REQ-028 | The preview shall export Word using the `.docx`/`.dotx` named by `docx-template`, and PowerPoint using the `.pptx`/`.potx` named by `pptx-template`, and shall use a built-in template when the key is absent. | UC-08 | README |
| REQ-029 | The preview shall export one `@slide … @end` block per rendered slide, with its notes, as Markdown. | UC-08 | README |
| REQ-030 | The preview shall show `@note` text only in the notes panel and the presenter window, and never in document mode, the audience view or the PDF. | UC-09 | README |
| REQ-031 | The preview and its exports shall carry a Content-Security-Policy with no `connect-src`, and the library shall contain no call that fetches from the network during rendering. | UC-10 | vfm README |
| REQ-032 | The preview shall block remote images unless `vfmPreview.allowRemoteImages` is on. | UC-10 | README |
| REQ-033 | The preview shall publish each directive, bibliography and layout problem to the Problems panel with its file and line. | UC-11 | README |

### Bibliography, footnotes, syntax, music (found while mapping the existing tests)

| ID | Requirement | UC | Source |
| --- | --- | --- | --- |
| REQ-034 | vfm shall parse BibTeX entries of any type and field, resolve `crossref` and biblatex aliases without overwriting fields, keep each entry's source text, and report a repeated key, an unreadable entry or a bad crossref. | UC-04 | `bibtex.ts` |
| REQ-035 | vfm shall format a reference in APA, MLA or Vancouver style for each entry type, and shall not fail or leave stray punctuation when fields are missing. | UC-04 | `bibliography.ts` |
| REQ-036 | vfm shall resolve each cited key once, treating keys as case-sensitive, and shall validate each entry it receives. | UC-04 | `bibliography.ts` |
| REQ-037 | vfm shall validate an entry before sending it to the user's own server, send nothing for an invalid one, and describe a refusal or an unreachable server in words the author can act on. | UC-04 | `bibliography-client.ts` |
| REQ-038 | vfm shall play a score by reading the notes abcjs writes for the tune, following repeats, without loading anything from the network. | UC-06 | `music-audio.ts` |
| REQ-039 | In slide mode vfm shall show a footnote only on a slide whose text cites it, only when it is defined inside that slide's `@slide` block, numbered from 1 on that slide. | UC-03 | vfm README "Footnotes" |
| REQ-040 | vfm shall render `~text~` as underline and `~~text~~` as strikethrough, and shall leave a lone tilde as text. | UC-01 | vfm README |

## B. New in `slide-polish`

### Theme color (UC-13)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-101 | When the YAML header holds `theme-color` with a valid CSS color, vfm shall draw the rule below every slide title in that color. | T |
| REQ-102 | When `theme-color` is valid, vfm shall fill the background of the title slide and of every section slide (divider) with the theme color mixed 14 % into white, and shall draw text on those slides in the default dark text color. | T |
| REQ-103 | vfm shall accept `#rgb`, `#rrggbb`, `rgb()`, `hsl()` and CSS color names as `theme-color`, and shall pass no other text to the stylesheet. | T |
| REQ-104 | When `theme-color` is present and not valid, vfm shall use the default colors and shall report a diagnostic with code `theme-color` and the line of the header. | T |
| REQ-105 | When `theme-color` is absent, vfm shall render slides with the default colors, identical to the previous release. | T |
| REQ-106 | The HTML export of a deck shall show the same theme color as the preview. | D |

### Affiliations on the title slide (UC-14)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-111 | The title slide shall list, for each author, the affiliation named in the YAML header, as department, institution and place. | T |
| REQ-112 | The title slide shall number the affiliations in order of first appearance and mark each author with the numbers of that author's affiliations. | T |
| REQ-113 | vfm shall take the name of an affiliation from `name`, `institution`, `organization` or `department`, in that order. | T |
| REQ-114 | When the header defines top-level `affiliations` and no author refers to any, the title slide shall list all of them once, without numbers. | T |

### Math in captions (UC-15)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-121 | vfm shall render `$…$` in the caption of a figure, table, listing, algorithm, score and diagram with KaTeX, in document and slide mode. | T |
| REQ-122 | vfm shall render `$…$` in the caption identically in the Word and PowerPoint exports as the source text of the formula. | T |
| REQ-123 | A `$` in a caption that does not close shall remain literal text. | T |

### Subscripts and superscripts (UC-16)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-131 | vfm shall render `^{text}` in running text as a superscript and `_{text}` as a subscript. | T |
| REQ-132 | vfm shall apply REQ-131 in paragraphs, headings, list items, table cells, captions, slide titles and lead-ins. | T |
| REQ-133 | vfm shall leave `^{…}` and `_{…}` unchanged inside code, math and link destinations. | T |
| REQ-134 | The text between the braces shall be inline Markdown, and a brace pair with no text, or with a line break before the closing brace, shall remain literal text. | T |
| REQ-135 | The Word export shall write sub- and superscripts as runs with vertical alignment, and the PowerPoint export shall set the baseline of the run. | T |
| REQ-136 | A backslash before `^` or `_` shall make the pair literal text. | T |

### Video (UC-17)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-141 | When an image's destination ends in `.mov`, `.mp4`, `.m4v`, `.webm` or `.ogv` (ignoring case, query and fragment), vfm shall render a `<video controls>` element instead of an `<img>`. | T |
| REQ-142 | vfm shall use the image's alt text as the caption of the video figure and shall number it as a figure when it carries a `{#fig:…}` label. | T |
| REQ-143 | vfm shall pass the video to the browser for native playback with `preload="metadata"` and `playsinline`, and shall not set a `type` attribute that would reject a QuickTime container. | I |
| REQ-144 | The preview shall resolve a local video path as it resolves a local image path and shall allow the webview to load it. | D |
| REQ-145 | The preview shall block a remote video unless `vfmPreview.allowRemoteImages` is on. | T |
| REQ-146 | In slide mode vfm shall place a video as it places an image, and the slide shall scale it to fit its region. | T |
| REQ-147 | The HTML export shall embed a local video of 50 MB or less, and shall leave a link and report a diagnostic for a larger one. | D |
| REQ-148 | The Word and PowerPoint exports shall write the caption and the file name of a video in place of the video. | T |

### Table text (UC-18)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-151 | vfm shall set the text of a table to 0.9 times the size of the text around it, in document mode and in slide mode. | T |
| REQ-152 | Text that is not in a table shall keep its size. | T |

### Jump to source from titles and lead-ins (UC-19)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-161 | vfm shall give the title region of a slide the source line of its origin: the `@slide[title]` line when the title is an override, otherwise the line of the heading. | T |
| REQ-162 | vfm shall give the lead-in region of a slide the line of its `@end(lead-in)`. | T |
| REQ-163 | When the author double-clicks a slide's title or lead-in, the preview shall reveal that line, in the included file when the line came from one. | D |

### Images fit the slide (UC-20)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-171 | The slide shall scale every image or video down to fit the height and width of its region, preserving its aspect ratio and not enlarging it past its own size. | D |
| REQ-172 | On a `2col` slide that has images and no text, vfm shall give each image its own column, up to two. | T |
| REQ-173 | On a `2col` slide that has text, or only one image, vfm shall lay the slide out in one column in source order, as before. | T |
| REQ-174 | When a `2col` block has more images than fit, vfm shall continue on a new slide. | T |

### Project layout

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-181 | The preview shall import vfm through the alias `@vfm`, which resolves to the sibling directory `../vfm` of the project root, so that every `vfm-preview-<feature>` working copy builds against the same library. | I |
