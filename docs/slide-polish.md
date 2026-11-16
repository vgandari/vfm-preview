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
- The title slide and every section slide (a slide that is only a heading, or an agenda) use a much lighter
  tint of it as their background, with dark text.
- Accepted: `#rgb`, `#rrggbb`, `rgb(26, 110, 168)`, `hsl(205, 73%, 38%)` and CSS color names such as `teal`.
  Anything else is ignored and shows up in the Problems panel as `theme-color`.
- Without the key nothing changes. The Word and PowerPoint exports use their templates' colors, not this one.

## Affiliations on the title slide (REQ-111 to REQ-114)

```yaml
author:
  - name: Ada Lovelace
    affiliation: Analytical Engines Ltd., London, UK
  - name: Charles Babbage
    affiliation: Analytical Engines Ltd., London, UK
```

Both authors share one affiliation, so it is shown once under the names. With several affiliations each
author gets numbers (`Ada Lovelace¹ ², Charles Babbage²`) and the numbered list follows. A top-level
`affiliations:` list that no author refers to is shown as it is.

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

## Tables (REQ-151, REQ-152)

Table text is 0.9 times the size of the surrounding text in documents and in slides.

## Jumping to the source (REQ-161 to REQ-163)

In slide mode, double-click a slide title to go to the `@slide[title]` line (or the heading it came from), and
double-click a lead-in to go to its `@end(...)` line.

## Images on slides (REQ-171 to REQ-174)

Images are scaled to fit their region. On a `2col` slide with no text, the first image takes the left column
and the second the right; a third starts a new slide. With text, text is on the left and images on the right.

## Questions

- **Why did my `.mov` show a gray box?** The codec is not playable by Chromium; see Video above.
- **Can I put two videos side by side?** Yes: a `2col` block holding two videos and no text.
- **How do I get a lighter background on only one slide?** Not supported: the tint applies to all title and
  section slides, so a deck keeps one look.
