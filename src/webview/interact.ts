/**
 * Preview interaction shared by document and slide views: everything that maps a spot in the rendered
 * page back to a line of the author's file (rendered block elements carry `data-line`, the 1-based line
 * in the text sent to the webview, which `sourceMap` turns into a file and line).
 */

import type { SourceLoc } from "@vfm/slides";

export type SourceMap = SourceLoc[] | undefined;

/** The place in the author's files for a line of the (include-expanded) text. */
export function locOf(line: number, sourceMap: SourceMap): SourceLoc {
  return sourceMap?.[line - 1] ?? { line };
}

/** The deepest rendered element at or above `el` that knows its source line. */
export function lineOwner(el: Element | null): HTMLElement | null {
  return (el?.closest?.("[data-line]") as HTMLElement | null) ?? null;
}

const isMain = (loc: SourceLoc) => !loc.file;

/** Line of the main file → line in the expanded text (the last line at or before it that is the main file's). */
export function expandedLine(mainLine: number, sourceMap: SourceMap): number {
  if (!sourceMap) return mainLine;
  let best = -1;
  for (let i = 0; i < sourceMap.length; i++) {
    const loc = sourceMap[i];
    if (isMain(loc) && loc.line <= mainLine) best = i + 1;
    if (isMain(loc) && loc.line > mainLine) break;
  }
  return best < 0 ? mainLine : best;
}

/** Expanded-text line → line of the main file, or undefined inside an included file. */
export function mainLine(expanded: number, sourceMap: SourceMap): number | undefined {
  const loc = locOf(Math.max(1, Math.round(expanded)), sourceMap);
  return isMain(loc) ? loc.line : undefined;
}

interface Anchor {
  line: number;
  top: number;
}

/** Rendered blocks with a source line, with their page position, in line order. */
export function anchors(root: HTMLElement): Anchor[] {
  const base = window.scrollY;
  const out: Anchor[] = [];
  root.querySelectorAll<HTMLElement>("[data-line]").forEach((el) => {
    out.push({ line: Number(el.dataset.line), top: el.getBoundingClientRect().top + base });
  });
  return out.sort((a, b) => a.line - b.line || a.top - b.top);
}

/** Page position that shows source `line` at the top, interpolating between rendered blocks. */
export function topForLine(list: Anchor[], line: number): number | undefined {
  if (list.length === 0) return undefined;
  let before = list[0];
  let after: Anchor | undefined;
  for (const a of list) {
    if (a.line <= line) before = a;
    else {
      after = a;
      break;
    }
  }
  if (!after || after.line === before.line || before.line > line) return before.top;
  const t = (line - before.line) / (after.line - before.line);
  return before.top + t * (after.top - before.top);
}

/** Source line at page position `y`, the inverse of topForLine. */
export function lineForTop(list: Anchor[], y: number): number | undefined {
  if (list.length === 0) return undefined;
  const byTop = [...list].sort((a, b) => a.top - b.top);
  let before = byTop[0];
  let after: Anchor | undefined;
  for (const a of byTop) {
    if (a.top <= y) before = a;
    else {
      after = a;
      break;
    }
  }
  if (!after || after.top === before.top || before.top > y) return before.line;
  return before.line + ((y - before.top) / (after.top - before.top)) * (after.line - before.line);
}

/** The rendered block that holds source `line`: the last one starting at or before it (the first when none does). */
export function blockForLine(root: HTMLElement, line: number): HTMLElement | undefined {
  let best: HTMLElement | undefined;
  let bestLine = -Infinity;
  let first: HTMLElement | undefined;
  let firstLine = Infinity;
  root.querySelectorAll<HTMLElement>("[data-line]").forEach((el) => {
    const l = Number(el.dataset.line);
    if (l <= line && l >= bestLine) {
      best = el;
      bestLine = l;
    }
    if (l < firstLine) {
      first = el;
      firstLine = l;
    }
  });
  return best ?? first;
}

/** Briefly outline `el` so the eye finds where the cursor's line landed. */
export function flash(el: HTMLElement) {
  el.classList.remove("vfm-flash");
  void el.offsetWidth; // restart the animation when flashed twice in a row
  el.classList.add("vfm-flash");
  setTimeout(() => el.classList.remove("vfm-flash"), 1400);
}
