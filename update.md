Modify the vfm package (`vfm/`) as follows
- Use backticks for algorithms and music instead of `@@@` and `&&&`, add support for rendering mermaid diagrams.
- Ensure js libraries in `vfm` don't fetch anything from the internet on the user's client.
- Slides mode
  - Document separators also break slides (check if already implemented this way)
  - Break down paragraphs for slides (see markdown files in `paragraph-reducer/`, which were written without knowledge of `vfm` or `vfm-preview`)
  - Sentences end with sentence-ending punctuation, followed by a newline to avoid the need for language-specific rules like detecting abbreviations.

Modify `vfm-preview` (`./`) as follows
- Doc mode
  - don't display yaml keys in a table
  - scroll sync
  - Add option to export to Word with a template file specified in the yaml header
- Doc mode and slides mode
  - User should be able to toggle checkboxes in the preview, which updates original open file
  - Double click on a point in the preview to jump to corresponding location in original file
- Slides mode
  - After implementing paragraph-reducer, add option to export `.md` file with only slide info in final slides mode AST.
  - Add option to export to Powerpoint with a template file specified in the yaml header

- create one big test case file to match https://spec.commonmark.org/0.31.2/. for cases where the commonmark spec allows raw html inside markdown, make sure those tests fail

- read new comments in slide-example-2.md
- move slide numbers in preview thumbnails to lower right corner of thumbnails
- remove section numbering from automatically generated slide titles