# Manual test procedures

These cover requirements that need VS Code, a browser or a person's eyes. They are listed in `MAPPING.json` as
`manual/MT-nn` with status "not run"; `python3 tools/check_mapping.py` reports every requirement that is verified
only by a manual test that has not been run. Record the date and result under each one when run.

**Setup.** `npm install && npm run build`, press F5 (Extension Development Host), and open
`examples/slide-polish/deck.md` (a deck with a theme color, two affiliations, a tall image, a two-image `2col` slide, a
wide image with text and a table). For
video, use any H.264/AAC `.mov` or `.mp4` next to the document.

| ID | Requirements | Procedure | Pass when |
| --- | --- | --- | --- |
| MT-01 | REQ-001 | Open the preview to the side; type in the editor. | The preview updates within a second. |
| MT-02 | REQ-002 | Set `vfmPreview.mode` to `slides`, reopen; run **VFM: Toggle Document / Slide Mode**. | The preview opens in the set mode and the command switches it. |
| MT-03 | REQ-003 | In slide mode press ←, → and Space on a deck with `steplists`. | Each key moves one slide or one reveal step. |
| MT-04 | REQ-017, REQ-018 | Put `refs.bib` next to the file, then only in the workspace root, then rename it. | It is found next to the file first, then in the workspace; the missing file is listed in Problems with the folders tried. |
| MT-05 | REQ-023 | Click a `- [ ]` checkbox in the preview, also one in an `@include`d file. | The line in the right file changes and the preview follows. |
| MT-06 | REQ-024, REQ-163 | In slide mode double-click (a) a slide title taken from `@slide[title]`, (b) a title taken from a heading, (c) a lead-in, (d) body text, (e) a section slide's heading. | The editor shows the `@slide[…]` line, the heading line, the `@end(…)` line, the text's line and the heading's line; the word clicked is selected where it is on the line. |
| MT-07 | REQ-025 | In document mode scroll the editor, then the preview. | The other follows. |
| MT-08 | REQ-026, REQ-106, REQ-147 | **Export to HTML…** for the deck with a theme color and a 1 MB `.mov`; open the file in a browser; repeat with a 60 MB video. | Same colors as the preview, local images and the small video are embedded and play with the file moved elsewhere; the 60 MB video is left as a relative link. |
| MT-09 | REQ-027 | **Export to PDF…** a deck. | One 1280×720 page per slide with every reveal step shown. |
| MT-10 | REQ-028 | Export to Word and to PowerPoint with and without `docx-template` / `pptx-template`. | Template styles and layouts are used; without the key a plain template is. |
| MT-11 | REQ-029 | **Export Slides as Markdown…** and reload the result. | One `@slide … @end` per slide with its notes; reloading does not reduce text again. |
| MT-12 | REQ-032, REQ-145 | Reference `https://…/a.png` and `https://…/a.mp4` with `vfmPreview.allowRemoteImages` off, then on. | Blocked when off, loaded when on. |
| MT-13 | REQ-033 | Write a bad option `@slide(bogus)` and a missing `.bib`. | Both appear in Problems with file and line. |
| MT-14 | REQ-143, REQ-144 | `![Clip](clip.mov)` in document mode and on a slide; click play. | The video plays with controls in both; a ProRes `.mov` shows a grey box (known limit, see `slide-polish.md`). |
| MT-15 | REQ-146, REQ-171 | Slides with: a 500×1600 image alone; a 1600×300 image beside text (`rtext`); two 700×700 images in `2col`; a video in each. | Every picture is whole (not cropped, not overflowing), aspect ratio kept, caption visible; the `2col` slide has one picture per column. |
| MT-16 | REQ-101, REQ-102 | Deck with `theme-color: "#1a6ea8"`, in a light and a dark VS Code theme. | The title rule is that blue; title and section slides have a pale blue background with dark text in both themes. |
| MT-17 | REQ-151, REQ-152 | A document and a slide with a paragraph above a table. | Table text is visibly a little smaller than the paragraph; the caption is not. |
| MT-18 | REQ-221, REQ-222, REQ-211, REQ-213 | Add `title-image: cover.jpg` (a photo next to the deck) to the header of `examples/slide-polish/deck.md`; open the slides. Then point it at an `https://` image with `vfmPreview.allowRemoteImages` off, then on. | The photo fills the title slide, cropped not stretched, under a dark layer with white readable text. The remote image is blocked while the setting is off, and shows when it is on. |

## Results

Not run yet. The development environment of this feature could not start a browser or VS Code (the sandbox
blocks Chrome with a Mach port permission error), so none of the above has been seen on screen.
