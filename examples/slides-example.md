---
title: Slide directives demo
---

# Introduction

This prose only appears in document mode.

@slide(steplists, stepleadin)
- Documents are the default view
- `@slide` blocks wrap existing content
- Slide mode shows only wrapped content
@note(Open with the **toggle**: ⌘K M.)
@note(Mention that notes never show in the document or in the PDF.)
@end(Switch views with **VFM: Toggle Document / Slide Mode**.)

# Results

@slide
## Overview
@end

@slide[Key figure](showrefs)
The trend is clear [@tab:data]. This holds in every run.

Results build on prior work.

Data table.[^1] {#tab:data}
| a | b |
| - | - |
| 1 | 2 |
[^1]: Numbers are illustrative.
@end(and on the next slide...)

@slide(nodoc)
Speaker-only material that the document never shows.
@end
