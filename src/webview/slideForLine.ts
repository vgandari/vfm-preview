/**
 * Editor → preview in slide mode: which slide shows a line of the author's text?
 * Pure (types only), so tests can call it without a browser.
 */

import type { SlideDeck } from "@vfm/slides";

type SlideLike = Pick<SlideDeck["slides"][number], "titleLine" | "body" | "images" | "cover"> & {
  sourceBlock?: { openLine: number; closeLine: number };
};

type Node = { position?: { start?: { line?: number } }; children?: Node[] };

/** Smallest source line in a node or below it (a list has none of its own; its items do). */
function minLine(node: Node): number {
  let best = node.position?.start?.line ?? Infinity;
  for (const c of node.children ?? []) best = Math.min(best, minLine(c));
  return best;
}

/**
 * Smallest source line the slide's own content shows. Every continuation of a split block shares the
 * block's title line, so the title only counts for a slide with no content lines (a section slide).
 */
function firstLine(slide: SlideLike): number {
  let best = Infinity;
  for (const b of [...slide.body, ...slide.images]) best = Math.min(best, minLine(b as Node));
  return best === Infinity ? slide.titleLine ?? Infinity : best;
}

/**
 * Index of the slide that shows `line` (1-based, in the include-expanded text).
 * - inside an `@slide … @end` block: that block's slide, or when the block spans several
 *   slides (a long one is split), the last of them that starts at or before the line;
 * - between blocks: the nearest slide above (the one the author just finished);
 * - before the first block: the first slide (the title slide when there is one).
 */
export function slideForLine(slides: readonly SlideLike[], line: number): number {
  let inBlock = -1;
  let above = -1;
  let aboveOpen = -Infinity;
  slides.forEach((s, i) => {
    const b = s.sourceBlock;
    if (!b) return;
    if (b.openLine <= line && line <= b.closeLine) {
      if (inBlock < 0 || firstLine(s) <= line) inBlock = i;
    } else if (b.closeLine < line && b.openLine >= aboveOpen) {
      above = i;
      aboveOpen = b.openLine;
    }
  });
  if (inBlock >= 0) return inBlock;
  if (above >= 0) return above;
  return 0;
}
