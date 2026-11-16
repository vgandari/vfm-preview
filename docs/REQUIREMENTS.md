# Requirements

Style: NASA Systems Engineering Handbook. Each requirement is one verifiable "shall" statement. "Preview" is
the VS Code extension (`vfm-preview`), "vfm" is the renderer library in `../vfm`. Verification methods: **T**est,
**I**nspection, **D**emonstration. Test cases are not written yet for the inferred requirements (see
`MAPPING.json`); that is on purpose and is tracked as a gap, not as coverage.

Requirements about the renderer, including the layout measurer, are in `../vfm/docs/REQUIREMENTS.md`. This file keeps those about the extension. IDs are unique across the two repositories. Exports are editor-only: another host provides its own exporters.

## A. Inferred from existing behavior

### Document and slide views

| ID | Requirement | UC | Source |
| --- | --- | --- | --- |
| REQ-001 | The preview shall render the Markdown file as a document and refresh within one second of an edit. | UC-01 | README |
| REQ-002 | The preview shall open in the mode named by the setting `vfmPreview.mode` and switch between document and slide mode on command. | UC-02 | README |
| REQ-003 | In slide mode the preview shall advance by one slide or one reveal step on ←, → and Space. | UC-02 | README |

### Citations, labels, blocks

| ID | Requirement | UC | Source |
| --- | --- | --- | --- |
| REQ-017 | The preview shall look for a relative `.bib` path next to the Markdown file, then in the containing workspace folder, then in other workspace folders, and shall prefer unsaved editor text. | UC-04 | README |

### Editing, export, privacy

| ID | Requirement | UC | Source |
| --- | --- | --- | --- |
| REQ-023 | When the author clicks a task checkbox, the preview shall rewrite that line in the file in which it was written, including an included file. | UC-07 | README |
| REQ-024 | When the author double-clicks rendered content that carries a source line, including a slide's title or lead-in, the preview shall reveal that line in the editor, in the included file when the line came from one, and shall select the clicked word when it is on the line. | UC-07, UC-19 | README |
| REQ-025 | The preview shall scroll the editor and the preview together in document mode. | UC-07 | README, `update.md` |
| REQ-026 | The preview shall export a self-contained HTML file with local images and KaTeX fonts inlined. | UC-08 | README |
| REQ-027 | The preview shall print the HTML export to PDF with a locally installed browser, one 1280×720 page per slide. | UC-08 | README |
| REQ-028 | The preview shall export Word using the `.docx`/`.dotx` named by `docx-template`, and PowerPoint using the `.pptx`/`.potx` named by `pptx-template`, and shall use a built-in template when the key is absent. | UC-08 | README |
| REQ-029 | The preview shall export one `@slide … @end` block per rendered slide, with its notes, as Markdown. | UC-08 | README |
| REQ-030 | The preview shall show `@note` text only in the notes panel and the presenter window, and never in document mode, the audience view or the PDF. | UC-09 | README |
| REQ-031 | The preview and its exports shall carry a Content-Security-Policy with no `connect-src`. | UC-10 | vfm README |
| REQ-032 | The preview shall block remote images unless `vfmPreview.allowRemoteImages` is on. | UC-10 | README |
| REQ-033 | The preview shall publish each directive, bibliography and layout problem to the Problems panel with its file and line, naming the folders tried when a bibliography file is missing. | UC-04, UC-11 | README |

## B. New in `slide-polish`

### Theme color (UC-13)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-106 | The HTML export of a deck shall show the same theme color as the preview. | D |

### Math in captions (UC-15)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-122 | The Word and PowerPoint exports shall write `$…$` in a caption as the source text of the formula. | T |

### Subscripts and superscripts (UC-16)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-135 | The Word export shall write sub- and superscripts as runs with vertical alignment, and the PowerPoint export shall set the baseline of the run. | T |

### Video (UC-17)

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-144 | The preview shall resolve a local video path as it resolves a local image path and shall allow the webview to load it. | D |
| REQ-145 | The preview shall block a remote video unless `vfmPreview.allowRemoteImages` is on. | T |
| REQ-147 | The HTML export shall embed a local video of 50 MB or less, and shall leave a link and report a diagnostic for a larger one. | D |
| REQ-148 | The Word and PowerPoint exports shall write the caption and the file name of a video in place of the video. | T |

### Project layout

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-181 | The preview shall import vfm through the alias `@vfm`, which resolves to the sibling directory `../vfm` of the project root, so that every `vfm-preview-<feature>` working copy builds against the same library. | I |

## C. New in `slide-colors`

The renderer's requirements for `separator-color`, `section-color` and `title-image` are REQ-201 to REQ-215 in `../vfm/docs/REQUIREMENTS.md`; so is the layout measurer (REQ-244).

| ID | Requirement | Method |
| --- | --- | --- |
| REQ-221 | The preview shall resolve a local `title-image` path as it resolves a local image path, relative to the Markdown file, and shall allow the webview to load it. | D |
| REQ-222 | The preview shall block a remote `title-image` unless `vfmPreview.allowRemoteImages` is on. | T |
| REQ-223 | The HTML export shall embed a local `title-image` named in the YAML header in the file, and shall leave a remote or missing one as written. | T |
