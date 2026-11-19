/**
 * The line that names a slide in the slide menu: "Title: A slideshow" for the title slide, "2. Intro", and
 * "3. Topic (1/2)" for the first of two slides that one block was split into. Pure, so a test can call it.
 */

import type { SlideDeck } from "@vfm/slides";

type SlideLike = Pick<SlideDeck["slides"][number], "title" | "cover" | "continuation">;

type Inline = { value?: unknown; children?: Inline[] };

/** The plain text of inline nodes. */
function plain(nodes: readonly Inline[]): string {
  const text = (n: Inline): string => (typeof n.value === "string" ? n.value : (n.children ?? []).map(text).join(""));
  return nodes.map(text).join("").replace(/\s+/g, " ").trim();
}

/** A slide's title as plain text; "Untitled slide" when it has none. */
export function slideTitle(slide: SlideLike): string {
  return slide.cover ? slide.cover.title : plain(slide.title as Inline[]) || "Untitled slide";
}

/** The menu line for slide `index` (0-based). */
export function slideLabel(slide: SlideLike, index: number): string {
  if (slide.cover) return `Title: ${slide.cover.title}`;
  const { index: part, of } = slide.continuation;
  return `${index + 1}. ${slideTitle(slide)}${of > 1 ? ` (${part}/${of})` : ""}`;
}
