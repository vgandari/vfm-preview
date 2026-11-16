# Theme color, affiliations, math captions, sub/superscripts, video, tables

How to use what the `slide-polish` feature adds. Requirement numbers refer to `REQUIREMENTS.md`.

## Theme color (REQ-101 to REQ-106)

```yaml
---
title: My talk
theme-color: "#1a6ea8"
---
```

- The rule under every slide title is drawn in that color.
- The title slide and every section slide (a slide that is only a heading, or an agenda) use the color itself as
  their background, not lightened. Text on them is light when the color is dark and dark when it is light (the same
  0.179 luminance switch as `section-color`, below).
- Accepted: `#rgb`, `#rrggbb`, `rgb(26, 110, 168)`, `hsl(205, 73%, 38%)` and CSS color names such as `teal`.
  Anything else is ignored and shows up in the Problems panel as `theme-color`.
- Without the key nothing changes. The Word and PowerPoint exports use their templates' colors, not this one.

## Separate colors and a title image (REQ-201 to REQ-215, REQ-221 to REQ-223)

```yaml
---
title: My talk
theme-color: "#1a6ea8"       # accent; title and section slide background
separator-color: "#e07b00"   # the rule under slide titles
section-color: "#0b3954"     # background of section slides, as written
title-image: images/cover.jpg
---
```

- `separator-color` colors only the rule under slide titles. Without it the rule uses `theme-color`.
- `section-color` is the background of every section slide (a slide that is only a heading, or an agenda), exactly as
  written, not tinted. Text on it is light when the color is dark and dark when it is light; the switch is at a relative luminance of 0.179 (WCAG 2.x), where white text and dark text have equal contrast, so mid-tones like `#808080` get dark text and `#0b3954` gets light text. Without it, section slides use `theme-color`.
- `title-image` replaces the title slide's background. It covers the slide (cropped, not stretched), a dark layer
  keeps the white title text legible. The path is relative to the Markdown file. A remote URL needs
  `vfmPreview.allowRemoteImages`. Without a `title` in the header there is no title slide, and the key is reported and ignored.
- Each key works alone: `section-color` does not need `theme-color`.
- The title slide is the plain `theme-color` when there is no `title-image`; `section-color` does not touch it.
- No color option is ever tinted or lightened: each is used exactly as written.
- Same color forms as `theme-color`. A bad color is ignored and reported in the Problems panel under its key.
- The Word and PowerPoint exports do not use these keys.

## Affiliations on the title slide (REQ-111 to REQ-114)

```yaml
author:
  - name: Ada Lovelace
    affiliation: Analytical Engines Ltd., London, UK
  - name: Charles Babbage
    affiliation: Analytical Engines Ltd., London, UK
```

The title slide lists the affiliations in order of first appearance, numbered, and marks each author with the
numbers that apply (here `Ada Lovelace¹, Charles Babbage¹` and one numbered affiliation). An affiliation may be given as `name`, `institution`,
`organization` or `department`. A top-level `affiliations:` list that no author refers to is shown as it is,
without numbers. Exporting to PowerPoint puts the affiliations under the author names on the title slide.

## Math in captions (REQ-121 to REQ-123)

```markdown
![Decay of $N(t)=N_0e^{-\lambda t}$ over time](decay.png){#fig:decay}
```

Works for figures, tables, listings, algorithms, scores and diagrams, and in slides.
A lone `$` is just a dollar sign.

## Subscripts and superscripts (REQ-131 to REQ-136)

| Write | Get |
| --- | --- |
| `H_{2}O` | H₂O (subscript) |
| `E = mc^{2}` | superscript 2 |
| `10^{-3} m_{*italic*}` | markup is allowed inside the braces |
| `a\^{b}` | literal `a^{b}` |

Why braces: `~text~` is already underline and `^text^` collides with footnote marks, so the form
that is the same as in LaTeX was chosen. Raw `<sup>` and `<sub>` remain shown as text (`no-html`).
Not applied inside code, math or link destinations.

## Video (REQ-141 to REQ-148)

```markdown
![Pouring the sample](media/pour.mov){#fig:pour}
```

The syntax is the image syntax. The extensions `.mov`, `.mp4`, `.m4v`, `.webm` and `.ogv` make it a video with
controls; the alt text is the caption. Playback is the browser's own, with no conversion, so the codec must be one
VS Code's Chromium can play: H.264/AAC in `.mov` or `.mp4` is fine; ProRes is not (re-encode it, e.g.
`ffmpeg -i in.mov -c:v libx264 -c:a aac out.mov`). In slides a video is placed and scaled like an image.
HTML export embeds videos up to 50 MB. Word and PowerPoint get the caption and the file name.

## Tables (REQ-151, REQ-152, REQ-231 to REQ-234)

Table text is 0.9 times the size of the surrounding text in documents. On a slide it starts at 0.9 and, when the table
does not fit, shrinks in steps of 0.05 down to 0.6 before anything else happens (a 30 px slide shows 27 px at 0.9 and
18 px at 0.6). A table still too big at 0.6 continues on the next slide with its header repeated, the most rows that
fit at 0.6 on each. Captions keep the surrounding size. A table is not dropped when the block ends with
`@end(lead-in)`: the lead-in goes under the last piece, and the table is shrunk or split to make room for it.
`code` inside a table is 85 % of the table text.

## Jumping to the source (REQ-161 to REQ-163)

In slide mode, double-click a slide title to go to the `@slide[title]` line (or the heading it came from), and
double-click a lead-in to go to its `@end(...)` line.

## Images on slides (REQ-171 to REQ-174)

Images are scaled to fit their region. On a `2col` slide with no text, the first image takes the left column
and the second the right; a third starts a new slide. A `2col` slide with text, or with just one image, is laid
out in one column as before.

## Questions

- **Why did my `.mov` show a gray box?** The codec is not playable by Chromium; see Video above.
- **Can I put two videos side by side?** Yes: a `2col` block holding two videos and no text.
- **How do I get a lighter background?** Give the color you want: `theme-color`, `section-color` and `title-image` are
  never tinted, so a lighter look is a lighter color.
- **Why is a table so small?** On a slide a table shrinks (down to 0.6) until it fits. Shorten it or split it with a
  document separator if you want it larger. Inline `code` inside a table is 0.85 of the table text.
- **Why did my table disappear?** That was a bug when the block ended with `@end(text)`; fixed (REQ-231).
- **A dark `section-color`, but the text is dark?** The switch is by luminance, not hue: a saturated mid-tone such as
  `#2e8b57` is brighter than it looks and keeps dark text. Darken it a little to get light text.
- **Can I choose the text color myself?** Not yet: it follows the background.
