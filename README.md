# VFM Preview

VS Code extension that previews Markdown files with the vfm renderer (in `vfm/`).

- `npm install && npm run build`, then press F5 to launch an Extension Development Host.
- Open a `.md` file and run **VFM: Open Preview to the Side** (⌘K V, or the editor title button).
- `npm run watch` rebuilds on change; `npm run package` produces a `.vsix`.

The vfm folder is bundled as-is; its dependencies are installed from this package's `package.json`.

## Slide mode

Paragraphs inside a block are reduced to slide text (pick, trim, never rewrite), a `---` ends a slide, and
sentences are written one per line; see `vfm/README.md`. Markdown files can wrap content in `@slide … @end` (see `slide-directives-spec.md`, sample in
`slides-example.md`). The preview opens in the mode set by `vfmPreview.mode` and switches with
**VFM: Toggle Document / Slide Mode** (⌘K M), the editor-title button, or the
**Show as Slides / Show as Document** commands. In slide mode use ← / → / Space to move
through slides and reveal steps. Directive problems show up in the Problems panel; `@include`d
files are followed and edits to them refresh the preview.

## Export and browser

- **VFM: Export to HTML…** writes one self-contained `.html` (the preview's own bundle, KaTeX fonts and
  local images inlined). It asks for Document or Slides, defaulting to the current view. In a browser the
  slides keep arrow-key navigation, and **F** (or the ⛶ button) goes fullscreen.
- **VFM: Export to PDF…** prints that HTML with headless Chrome, Chromium, Edge or Brave. Documents print
  as pages; slides print one per 1280×720 page with every reveal step shown. Set `vfmPreview.browserPath`
  if no browser is found.
- **VFM: Open in Browser** (editor-title button) opens the current view in your default browser without
  asking for a file.

A lone float (score, algorithm, listing, image, table…) that is too tall for its slide is scaled down, to
at most half size, instead of being dropped as an overflow.

## Citations

`@cite(key)` and `@cite(a, b)` resolve against the BibTeX file(s) named in the YAML header:

```yaml
bibliography: refs.bib            # or a list: [refs.bib, more/other.bib]
```

A relative path is looked for **next to the Markdown file first**, then in the workspace folder that holds it, then in
any other workspace folder; an absolute path is used as written. The first match wins, and an unsaved `.bib` in an
editor is preferred to the file on disk. Editing the `.bib` refreshes the preview. A file that cannot be found, or an
entry that cannot be parsed, is reported in the Problems panel (with the folders that were tried). A cited key that is
not in the file shows as a red "unknown citation" marker. Citations work in document mode, slides (including
`showrefs`), the HTML export, and Word (author-year text and a References section); PowerPoint gets "(Author, Year)".

## Editing from the preview

- **Task checkboxes** (`- [ ]`) are live in document and slide mode: clicking one rewrites that line in the
  file (an `@include`d file is edited in place), and the preview follows.
- **Double click** anything to jump to it in the editor; the clicked word is selected when it is on the line.
- **Scroll sync** (document mode): the preview and the editor follow each other.
- Rendered blocks carry `data-line`, the line of your file they came from; this is exact for fenced divs,
  `alg` / `mus` / `mermaid` blocks, YAML headers and included files.

## Theme, affiliations, math captions, sub/superscripts, video

See `docs/slide-polish.md`: `theme-color:` in the YAML header colors the title slide, tints the section slides and colors the
title rule; the title slide lists affiliations; captions accept `$math$`; `H_{2}O` and `x^{2}` work outside math;
a video file (`.mov`, `.mp4`, …) written with the image syntax embeds as a video (see `docs/slide-polish.md`); table text is a little smaller.
Double-clicking a slide title or lead-in jumps to its line in the file.

The extension imports the renderer from the sibling folder `../vfm` through the alias `@vfm`
(`tsconfig.json` and `esbuild.mjs`; set `VFM_DIR` to build against another checkout).

## Diagrams, algorithms, scores

Fenced code with a reserved language: `` ```alg Caption {#alg:name} `` (pseudocode.js),
`` ```mus Caption {#mus:name} `` (ABC) and `` ```mermaid Caption {#fig:name} `` (Mermaid, numbered as a figure).
Nothing the preview runs touches the network: its Content-Security-Policy has no `connect-src`, and remote
images are blocked unless `vfmPreview.allowRemoteImages` is on. Exported HTML carries the same policy.

## Export to Word, PowerPoint and slides Markdown

These run in the preview (it has the parser and renderer) and save through the editor.

- **VFM: Export to Word…** writes the whole document. Name a template in the YAML header:
  `docx-template: templates/report.docx` (a `.docx` or `.dotx`, relative to the document). Its styles, page
  setup, headers and footers are kept and only the body is replaced; styles are used by id when present
  (`Title`, `Subtitle`, `Heading1`…, `Quote`, `Caption`, `ListBullet`, `TableGrid`, `Code`) and otherwise
  the same look is applied directly. The key is optional: without it a plain built-in template is used. Figures, tables and
  headings keep their numbers, cross-references become links, Mermaid diagrams and local images become
  pictures. Math, algorithms and scores are written as source text; footnotes go at the end.
- **VFM: Export Slides to PowerPoint…** writes the final slides. A template is optional:
  `pptx-template: templates/deck.pptx` (`.pptx` or `.potx`); without the key a plain built-in 16:9 template is used. Its sample slides are removed and slides use its
  *Title Slide*, *Title and Content* and *Section Header* layouts through their placeholders, so fonts,
  colors and bullet styles are the template's. Bullets, numbered lists, callouts, tables, images, Mermaid
  pictures and (when the template has a notes master) presenter notes are native; code, math, algorithms
  and scores are monospace/source text. Reveal steps are not exported.
- **VFM: Export Slides as Markdown…** writes only what is on the slides, as one `@slide … @end` block per
  rendered slide with its notes. The YAML header is kept with `paragraphs: full` so loading the file
  again does not reduce the text a second time.

## Presenter notes

Write `@note(text)` on its own line inside a `@slide` block (it can span lines; outside a block it is just text). Each rendered slide shows
the notes that come after its content and before the next slide's. In the slide preview press **N** (or the
Notes button) for a notes panel under the slide. In an exported HTML page or **Open in Browser**, **P** (or
the Presenter button) opens a presenter window: the current slide, the next slide, large notes and a
timer, kept in step with the audience window, so the audience window can go fullscreen. Notes never show in
document mode, HTML slides' audience view or the PDF.
